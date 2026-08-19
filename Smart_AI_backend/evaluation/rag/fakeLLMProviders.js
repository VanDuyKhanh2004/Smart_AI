/**
 * Deterministic fake LLM providers for the offline RAG generation evaluation.
 *
 * The production answer-generation orchestration in utils/gemini.js is kept
 * 100% intact — this module only swaps the two SDK packages (`openai` and
 * `@google/genai`) in the require cache BEFORE utils/gemini.js is required, so
 * `new OpenAI(...)` / `new GoogleGenAI(...)` construct the fakes below.
 *
 * The fakes are pure in-memory closures: they never touch the network. Every
 * provider call the production code makes is captured (messages / system
 * prompt / contents) so the evaluator can inspect the EXACT payload the real
 * pipeline would send to a live model. Responses are resolved deterministically
 * from `resolveResponse(userMessage)` (e.g. a hand-authored map of query ->
 * grounded answer).
 *
 * NOTE: this is evaluation-only infrastructure. Production behavior is not
 * modified; utils/gemini.js, chatController.js and the SDKs are untouched.
 */

const OPENAI_PKG = 'openai';
const GENAI_PKG = '@google/genai';

let currentResolveResponse = () => '';
let currentCaptured = null;

function ensureCaptured() {
  if (!currentCaptured) {
    currentCaptured = {
      calls: [],
      networkAttempted: false,
      reset() {
        this.calls = [];
      },
    };
  }
  return currentCaptured;
}

const record = call => ensureCaptured().calls.push(call);

/**
 * Fake OpenAI SDK: gemini.js does `new OpenAI(...)` then
 * `openai.chat.completions.create(payload, options)`.
 */
class FakeOpenAI {
  constructor() {
    this.chat = {
      completions: {
        create: async (payload, options) => {
          const messages = payload && Array.isArray(payload.messages) ? payload.messages : [];
          const userMessage = messages.length > 0 ? messages[messages.length - 1].content : '';
          const text = currentResolveResponse(userMessage);
          if (payload && payload.stream) {
            record({ kind: 'openai', mode: 'stream', messages, options });
            return (async function* stream() {
              yield { choices: [{ delta: { content: text }, finish_reason: null }] };
              yield { choices: [{ delta: { content: '' }, finish_reason: 'stop' }] };
            })();
          }
          record({ kind: 'openai', mode: 'non-stream', messages, options });
          return { choices: [{ message: { content: text } }] };
        },
      },
    };
  }
}

/**
 * Fake @google/genai SDK: gemini.js does
 * `new GoogleGenAI(...)` then `googleGenAI.models.generateContent(...)` /
 * `googleGenAI.models.generateContentStream(...)`.
 */
class FakeGoogleGenAI {
  constructor() {
    this.models = {
      generateContent: async payload => {
        const contents = Array.isArray(payload.contents) ? payload.contents : [];
        const last = contents[contents.length - 1];
        const userText = last && Array.isArray(last.parts) ? last.parts.map(p => p.text).join('') : '';
        const text = currentResolveResponse(userText);
        record({ kind: 'gemini', mode: 'non-stream', systemPrompt: payload.systemInstruction, contents });
        return { candidates: [{ content: { parts: [{ text }] } }] };
      },
      generateContentStream: async payload => {
        const contents = Array.isArray(payload.contents) ? payload.contents : [];
        const last = contents[contents.length - 1];
        const userText = last && Array.isArray(last.parts) ? last.parts.map(p => p.text).join('') : '';
        const text = currentResolveResponse(userText);
        record({ kind: 'gemini', mode: 'stream', systemPrompt: payload.systemInstruction, contents });
        return (async function* stream() {
          yield { text };
          yield { text: '' };
        })();
      },
    };
  }
}

/**
 * Install the fake SDK packages in the require cache. `resolveResponse` must
 * return the canned answer for a given user message.
 */
function installFakeLLMProviders({ resolveResponse }) {
  currentResolveResponse = resolveResponse || (() => '');
  const captured = ensureCaptured();
  captured.reset();

  const openaiPath = require.resolve(OPENAI_PKG);
  const genaiPath = require.resolve(GENAI_PKG);
  const priorOpenAI = require.cache[openaiPath];
  const priorGenAI = require.cache[genaiPath];

  require.cache[openaiPath] = { id: openaiPath, filename: openaiPath, loaded: true, exports: FakeOpenAI };
  require.cache[genaiPath] = { id: genaiPath, filename: genaiPath, loaded: true, exports: { GoogleGenAI: FakeGoogleGenAI } };

  const restore = () => {
    if (priorOpenAI) require.cache[openaiPath] = priorOpenAI;
    else delete require.cache[openaiPath];
    if (priorGenAI) require.cache[genaiPath] = priorGenAI;
    else delete require.cache[genaiPath];
  };

  return { captured, restore };
}

/**
 * Install the fakes, set the provider env keys (dotenv will not override
 * pre-set vars), then load the REAL production generation functions from
 * utils/gemini.js. Returns wrappers that invoke the real orchestration and
 * surface the exact messages/system prompt the production pipeline built.
 */
function createGenerationHooks({ resolveResponse }) {
  process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'eval-fake-openai-key';
  process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'eval-fake-gemini-key';

  const { captured, restore } = installFakeLLMProviders({ resolveResponse });
  const { generateChatResponse, generateChatResponseStream } = require('../../utils/gemini');

  const generate = async (chatHistory, userMessage, productContext) => {
    captured.reset();
    const res = await generateChatResponse(chatHistory, userMessage, productContext);
    const call = captured.calls[0] || null;
    const messages = (call && call.messages) || null;
    return {
      text: res.text,
      provider: res.provider,
      messages,
      systemPrompt: messages && messages[0] ? messages[0].content : null,
      userMessage,
      productContext,
    };
  };

  const generateStream = async ({ userMessage, chatHistory, productContext }) => {
    captured.reset();
    const res = await generateChatResponseStream({
      userMessage,
      chatHistory,
      productContext,
      signal: undefined,
      onDelta: () => {},
    });
    const call = captured.calls[0] || null;
    const messages = (call && call.messages) || null;
    return {
      fullResponse: res.fullResponse,
      provider: res.provider,
      streamed: res.streamed === true,
      messages,
      systemPrompt: messages && messages[0] ? messages[0].content : null,
      productContext,
    };
  };

  return { generate, generateStream, capture: captured, restore };
}

module.exports = { installFakeLLMProviders, createGenerationHooks, FakeOpenAI, FakeGoogleGenAI };