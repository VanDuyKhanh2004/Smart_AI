const OpenAI = require("openai");
require("dotenv").config();

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY không được định nghĩa trong file .env");
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL_NAME = process.env.OPENAI_MODEL || "gpt-4o";

let googleGenAI = null;
const GEMINI_CHAT_MODEL = process.env.GEMINI_CHAT_MODEL || "gemini-2.0-flash";
if (process.env.GEMINI_API_KEY) {
  try {
    const { GoogleGenAI } = require("@google/genai");
    googleGenAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  } catch (e) {
    console.warn("Gemini SDK not available for chat fallback:", e.message);
  }
}

const callChat = async (messages, options = {}) => {
  const response = await openai.chat.completions.create({
    model: MODEL_NAME,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 800,
    messages,
  });

  const content = response?.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("OpenAI trả về phản hồi rỗng");
  }
  return content;
};

const parseJsonFromText = (responseText) => {
  let cleanedResponse = responseText;
  if (responseText.includes("```json")) {
    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) cleanedResponse = jsonMatch[1].trim();
  } else if (responseText.includes("```")) {
    const codeMatch = responseText.match(/```\s*([\s\S]*?)\s*```/);
    if (codeMatch) cleanedResponse = codeMatch[1].trim();
  }
  return JSON.parse(cleanedResponse);
};

const isOpenAIUnavailableError = (error) => {
  if (!error) return false;
  if (error.status === 429) return true;
  if (error.status === 401) return true;
  if (error.status === 408 || error.code === "ETIMEDOUT") return true;
  if (["ECONNREFUSED", "ENOTFOUND", "ECONNRESET", "EAI_AGAIN"].includes(error.code)) return true;
  if (error.type === "insufficient_quota" || error.type === "rate_limit_error") return true;
  const msg = (error.message || "").toLowerCase();
  if (
    msg.includes("insufficient_quota") ||
    msg.includes("rate limit") ||
    msg.includes("rate_limit") ||
    msg.includes("api key") ||
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("etimedout") ||
    msg.includes("econnrefused") ||
    msg.includes("econnreset") ||
    msg.includes("enotfound") ||
    msg.includes("eai_again")
  )
    return true;
  return false;
};

const callGeminiChat = async (systemPrompt, chatHistory, userMessage) => {
  if (!googleGenAI) {
    throw new Error("Gemini SDK not initialized — GEMINI_API_KEY missing");
  }

  const contents = [];
  if (Array.isArray(chatHistory)) {
    for (const msg of chatHistory) {
      contents.push({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }],
      });
    }
  }
  contents.push({
    role: "user",
    parts: [{ text: userMessage }],
  });

  const response = await googleGenAI.models.generateContent({
    model: GEMINI_CHAT_MODEL,
    systemInstruction: systemPrompt,
    contents: contents,
    config: {
      temperature: 0.7,
      maxOutputTokens: 600,
    },
  });

  const text = response?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Gemini trả về phản hồi rỗng");
  }
  return text.trim();
};

const buildDeterministicResponse = (productContext, userMessage) => {
  if (!Array.isArray(productContext) || productContext.length === 0) {
    return "Cảm ơn bạn đã quan tâm! Hiện tại tôi chưa tìm thấy sản phẩm phù hợp với yêu cầu của bạn. Bạn có thể thử tìm kiếm với từ khóa khác hoặc liên hệ hotline 1900xxxx để được hỗ trợ trực tiếp ạ.";
  }

  let response = "Dạ, cảm ơn bạn đã quan tâm! Tôi xin gợi ý một số sản phẩm phù hợp với yêu cầu của bạn:\n\n";

  productContext.slice(0, 5).forEach((product, index) => {
    response += `${index + 1}. ${product.name} (${product.brand})\n`;
    response += `   - Giá: ${new Intl.NumberFormat("vi-VN").format(product.price)} VND\n`;
    response += `   - Mô tả: ${product.description}\n`;
    if (product.inStock > 0) {
      response += `   - Tình trạng: Còn hàng\n`;
    }
    response += "\n";
  });

  response += "Bạn muốn tìm hiểu thêm thông tin chi tiết về sản phẩm nào không ạ? Tôi sẵn sàng tư vấn thêm cho bạn!";

  return response;
};

/**
 * Deterministic pre-classifier for known small-talk patterns.
 * Returns null if no pattern matches (defer to AI classifier).
 */
const preclassifyIntent = (userQuery) => {
  if (!userQuery || typeof userQuery !== "string") return null;

  const normalize = (str) =>
    str
      .toLowerCase()
      .trim()
      .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, "")
      .replace(/\s+/g, " ")
      .replace(/[.,!?;:\-–—"''‘’“”]+$/, "")
      .trim();

  const normalized = normalize(userQuery);
  if (!normalized) return null;

  // ---- exact-phrase sets ----
  const greetings = new Set([
    "xin chào", "chào bạn", "chào", "chào bạn ơi",
    "chào buổi sáng", "chào buổi chiều", "chào buổi tối",
    "chào bạn buổi sáng", "chào bạn buổi chiều", "chào bạn buổi tối",
    "xin chào bạn", "xin chào các bạn", "xin chào bạn ơi",
    "chào mọi người", "chào bạn nha", "xin chào bạn nha",
    "chào bạn nhé", "xin chào bạn nhé", "hello mọi người",
    "chào mọi người ơi", "chào cả nhà", "chào bạn hiền",
    "chào bạn thân", "chào bạn nhé hello",
    "hello", "hi", "hey", "helo", "hí", "hii", "heyy", "hiii",
    "hello bạn", "hi bạn", "hey bạn", "helo bạn", "hí bạn",
    "hế lô", "hế lô bạn", "alo", "alo bạn", "alo bạn ơi",
    "xin chào tất cả", "chào tất cả mọi người",
  ]);

  const howAreYou = new Set([
    "bạn khỏe không", "bạn có khỏe không", "bạn thế nào", "bạn ổn không",
    "bạn sao rồi", "bạn ổn chứ", "khỏe không bạn", "thế nào bạn",
    "bạn thế nào rồi", "dạo này thế nào", "có khỏe không bạn",
    "công việc thế nào", "bạn sao rồi dạo này", "dạo này bạn thế nào",
    "bạn có khỏe không ạ", "bạn thế nào rồi ạ",
  ]);

  const thanks = new Set([
    "cảm ơn", "cảm ơn bạn", "cảm ơn nhiều", "cảm ơn bạn nhiều",
    "cảm ơn bạn rất nhiều", "cảm ơn nhé", "cảm ơn bạn nhé",
    "cảm ơn ạ", "cảm ơn bạn ạ",
    "cám ơn", "cám ơn bạn", "cám ơn nhiều", "cám ơn bạn nhiều",
    "cám ơn bạn rất nhiều", "cám ơn nhé", "cám ơn bạn nhé",
    "cám ơn ạ", "cám ơn bạn ạ",
    "thanks", "thank you", "thank you very much", "thanks bạn",
    "thank bạn", "thanks bạn nhiều", "thank you bạn",
    "dạ cảm ơn", "dạ cảm ơn bạn", "dạ cám ơn", "dạ cám ơn bạn",
    "ok", "okay", "okê", "oke", "okie", "oki", "okiii",
    "ok bạn", "okay bạn", "okê bạn", "oke bạn",
    "ok bạn nhé", "okay bạn nha", "okie bạn", "oki bạn",
    "vâng", "dạ", "vâng ạ", "dạ vâng", "dạ ạ", "vâng ạ",
    "dạ vâng ạ", "rồi ạ", "hiểu rồi", "hiểu rồi ạ",
    "understood", "got it", "dạ ok", "dạ okay", "dạ oke",
    "vâng ok", "vâng ạ ok", "dạ hiểu rồi", "cảm ơn bạn nhé ạ",
    "cảm ơn bạn rất nhiều ạ", "cảm ơn ạ",
    "cảm ơn bạn đã hỗ trợ", "cảm ơn bạn đã giúp đỡ",
  ]);

  const goodbye = new Set([
    "tạm biệt", "tạm biệt bạn", "tạm biệt nhé", "tạm biệt bạn nhé",
    "tạm biệt nha", "tạm biệt bạn nha", "tạm biệt ạ",
    "bye", "bye bye", "goodbye", "good bye",
    "bye bạn", "bye bye bạn", "goodbye bạn",
    "chào tạm biệt", "chào nhé", "chào bạn nhé tạm biệt",
    "hẹn gặp lại", "hẹn gặp lại bạn", "hẹn gặp lại nhé",
    "hẹn gặp lại nha", "hẹn gặp lại bạn nha", "hẹn gặp lại bạn nhé",
    "gặp lại sau", "gặp lại sau nhé", "gặp lại sau bạn",
    "chào tạm biệt nhé", "tạm biệt chào bạn",
  ]);

  const identity = new Set([
    "bạn là ai", "bạn tên gì", "bạn tên là gì", "bạn là ai vậy",
    "bạn là ai thế", "bạn tên gì thế", "ai vậy bạn",
    "bạn làm được gì", "bạn có thể làm gì", "chức năng của bạn là gì",
    "bạn làm gì", "bạn có những chức năng gì",
    "cho mình hỏi bạn là ai", "bạn là ai ạ", "bạn tên gì ạ",
    "bạn tên là gì ạ", "bạn là ai vậy ạ", "bạn có thể giúp gì",
    "bạn giúp được gì", "bạn biết làm những gì",
    "giới thiệu về bạn đi", "hãy giới thiệu về bạn",
  ]);

  const acknowledgment = new Set([
    "ừ", "ừm", "uhm", "uh", "à", "à ra vậy", "ra vậy", "ra vậy ạ",
    "vậy ạ", "ra thế", "ra thế ạ", "hiểu rồi ạ", "mình hiểu rồi",
    "tôi hiểu rồi", "à mình hiểu rồi", "ok hiểu rồi",
    "vâng hiểu rồi ạ", "dạ hiểu ạ", "vâng ạ", "dạ ok ạ",
    "rõ rồi", "rõ rồi ạ", "được rồi", "được rồi ạ",
    "cảm ơn mình hiểu rồi",
  ]);

  const praise = new Set([
    "bạn giỏi quá", "bạn tốt quá", "bạn thật tuyệt",
    "bạn tuyệt vời", "bạn thông minh quá", "bạn giỏi thật",
    "giỏi quá", "tuyệt vời", "tuyệt", "hay quá", "hay lắm",
    "cảm ơn bạn giỏi quá", "cảm ơn bạn tốt quá",
    "bạn dễ thương quá", "bạn dthw quá", "bạn cute quá",
    "bạn thân thiện quá", "bạn nhiệt tình quá",
  ]);

  const matchSet = (set, response) => {
    if (set.has(normalized)) return response;
    return null;
  };

  const greetingResponse = {
    intent: "small_talk",
    clarified_query: null,
    direct_response:
      "Xin chào! Mình là trợ lý AI của Dienthoaigiakho. Mình có thể giúp bạn tìm kiếm và tư vấn các dòng điện thoại theo hãng, giá cả, cấu hình và nhiều tiêu chí khác. Bạn cần mình hỗ trợ gì không?",
  };

  const howAreYouResponse = {
    intent: "small_talk",
    clarified_query: null,
    direct_response:
      "Mình cảm ơn bạn! Mình vẫn ổn và sẵn sàng hỗ trợ bạn. Bạn cần mình tư vấn về sản phẩm nào không ạ?",
  };

  const thanksResponse = {
    intent: "small_talk",
    clarified_query: null,
    direct_response:
      "Rất vui được hỗ trợ bạn! Nếu cần thêm thông tin về các sản phẩm điện thoại, bạn cứ hỏi mình nhé. Chúc bạn một ngày tốt lành!",
  };

  const goodbyeResponse = {
    intent: "small_talk",
    clarified_query: null,
    direct_response:
      "Cảm ơn bạn đã quan tâm và sử dụng dịch vụ của Dienthoaigiakho! Chúc bạn một ngày tốt lành và hẹn gặp lại bạn khi cần hỗ trợ nhé!",
  };

  const identityResponse = {
    intent: "small_talk",
    clarified_query: null,
    direct_response:
      "Mình là trợ lý AI của Dienthoaigiakho, chuyên hỗ trợ tìm kiếm và tư vấn điện thoại. Mình có thể giúp bạn tìm điện thoại theo hãng (iPhone, Samsung, OPPO,...), theo mức giá, theo nhu cầu (pin trâu, camera đẹp, chơi game,...) hoặc so sánh các dòng máy. Bạn muốn tìm hiểu về sản phẩm nào không?",
  };

  const acknowledgmentResponse = {
    intent: "small_talk",
    clarified_query: null,
    direct_response:
      "Nếu bạn cần thêm thông tin gì, đừng ngần ngại hỏi mình nhé! Mình luôn sẵn sàng hỗ trợ bạn.",
  };

  const praiseResponse = {
    intent: "small_talk",
    clarified_query: null,
    direct_response:
      "Cảm ơn bạn rất nhiều! Mình rất vui khi được hỗ trợ bạn. Nếu có thắc mắc gì thêm về sản phẩm, bạn cứ hỏi mình nhé!",
  };

  const checks = [
    [greetings, greetingResponse],
    [howAreYou, howAreYouResponse],
    [thanks, thanksResponse],
    [goodbye, goodbyeResponse],
    [identity, identityResponse],
    [acknowledgment, acknowledgmentResponse],
    [praise, praiseResponse],
  ];

  for (const [set, response] of checks) {
    const result = matchSet(set, response);
    if (result) {
      console.log(`[Pre-classifier] Matched "${normalized}" as small_talk`);
      return result;
    }
  }

  return null;
};

/**
 * Phân loại ý định và xử lý phản hồi thông minh
 * Trả về object với intent classification và response tương ứng
 */
const classifyIntentAndRespond = async (chatHistory, userQuery) => {
  try {
    if (!userQuery || typeof userQuery !== "string") {
      throw new Error("User query không hợp lệ");
    }

    // --- Deterministic pre-classifier (no LLM call) ---
    const preResult = preclassifyIntent(userQuery);
    if (preResult) {
      console.log("[classifyIntentAndRespond] Using pre-classifier result, skipping LLM");
      return preResult;
    }

    const safeHistory = Array.isArray(chatHistory) ? chatHistory : [];
    const messages = [
      {
        role: "system",
        content:
          "Bạn là Quỳnh Như nhân viên CSKH của Dienthoaigiakho. Trả về JSON với intent (product_query|small_talk|complaint), clarified_query, direct_response. Nói tiếng Việt tự nhiên, thân thiện. Chỉ chào ở đầu cuộc trò chuyện.",
      },
      ...safeHistory.map((msg) => ({
        role: msg.role === "assistant" ? "assistant" : "user",
        content: msg.content,
      })),
      {
        role: "user",
        content: `Hãy phân loại tin nhắn mới: ${userQuery}. Chỉ trả JSON.`,
      },
    ];

    const responseText = await callChat(messages, { maxTokens: 300, temperature: 0.3 });

    try {
      const parsedResponse = parseJsonFromText(responseText);
      if (
        !parsedResponse.intent ||
        !["product_query", "small_talk", "complaint"].includes(parsedResponse.intent)
      ) {
        throw new Error("Invalid intent classification");
      }
      return parsedResponse;
    } catch {
      return {
        intent: "product_query",
        clarified_query: userQuery,
        direct_response: null,
      };
    }
  } catch {
    return {
      intent: "product_query",
      clarified_query: userQuery,
      direct_response: null,
    };
  }
};

const generateResponse = async (prompt) => {
  try {
    if (!prompt || typeof prompt !== "string") {
      throw new Error("Prompt không hợp lệ");
    }

    const messages = [
      {
        role: "system",
        content: "Bạn là trợ lý thân thiện, trả lời ngắn gọn bằng tiếng Việt.",
      },
      { role: "user", content: prompt },
    ];

    return await callChat(messages, { maxTokens: 400, temperature: 0.7 });
  } catch (error) {
    console.error("generateResponse error:", error.message);
    return "Xin lỗi, tôi đang gặp sự cố kỹ thuật. Vui lòng thử lại sau.";
  }
};

const generateChatResponse = async (chatHistory, userMessage, productContext = []) => {
  try {
    const systemPrompt = createSystemPrompt(productContext, chatHistory);
    const messages = [
      { role: "system", content: systemPrompt },
      ...(Array.isArray(chatHistory)
        ? chatHistory.map((msg) => ({
            role: msg.role === "assistant" ? "assistant" : "user",
            content: msg.content,
          }))
        : []),
      { role: "user", content: userMessage },
    ];

    console.log("Chat provider: OpenAI");
    try {
      const text = await callChat(messages, { maxTokens: 600, temperature: 0.7 });
      return { text, provider: "OpenAI" };
    } catch (openAIError) {
      if (isOpenAIUnavailableError(openAIError)) {
        console.log("OpenAI failed, switching to Gemini. Error:", openAIError.message);
      } else {
        console.log("OpenAI error, attempting Gemini fallback. Error:", openAIError.message);
      }

      console.log("Chat provider: Gemini");
      try {
        const text = await callGeminiChat(systemPrompt, chatHistory, userMessage);
        return { text, provider: "Gemini" };
      } catch (geminiError) {
        console.log("Gemini failed, using deterministic fallback. Error:", geminiError.message);

        const text = buildDeterministicResponse(productContext, userMessage);
        return { text, provider: "deterministic" };
      }
    }
  } catch (error) {
    console.error("generateChatResponse error:", error.message);
    const text = buildDeterministicResponse(productContext, userMessage);
    return { text, provider: "deterministic" };
  }
};

const createSystemPrompt = (productContext = [], chatHistory = []) => {
  const contextText =
    Array.isArray(productContext) && productContext.length > 0
      ? productContext
          .map(
            (product, index) => `
SẢN PHẨM ${index + 1}:
- ID: ${product._id}
- Tên: ${product.name}
- Hãng: ${product.brand}
- Giá: ${new Intl.NumberFormat("vi-VN").format(product.price)} VND
- Mô tả: ${product.description}
- Tồn kho: ${product.inStock} sản phẩm
${product.specs ? `- Thông số: ${JSON.stringify(product.specs, null, 2)}` : ""}`
          )
          .join("\n")
      : "HIỆN TẠI KHÔNG CÓ SẢN PHẨM LIÊN QUAN TRONG KHO.";

  const historyText =
    Array.isArray(chatHistory) && chatHistory.length > 0
      ? chatHistory
          .map((msg) => `${msg.role}: ${msg.content}`)
          .join("\n")
      : "";

  return `Bạn là Quỳnh Như nhân viên tư vấn bán hàng tại Dienthoaigiakho.
1. TƯ VẤN NHIỆT TÌNH, thân thiện, tự nhiên.
2. CHỈ dùng dữ liệu sản phẩm, không bịa.
3. Luôn nêu tên sản phẩm, hãng, giá, tồn kho; chỉ đưa thông số khi được hỏi.
4. Nếu thiếu dữ liệu thì thừa nhận và gợi ý thay thế.
${contextText ? `DANH SÁCH SẢN PHẨM:\n${contextText}` : ""}
${historyText ? `LỊCH SỬ CHAT GẦN ĐÂY:\n${historyText}` : ""}
Không cần chào lại nếu đã chào trước đó. Trả lời bằng tiếng Việt thân thiện.`;
};

/**
 * Specialized complaint handling agent
 * Handles multi-turn conversation and extracts contact information
 */
const generateComplaintResponse = async (chatHistory, userMessage) => {
  try {
    if (!userMessage || typeof userMessage !== "string") {
      throw new Error("User message không hợp lệ");
    }

    const safeHistory = Array.isArray(chatHistory) ? chatHistory : [];
    const historyText =
      safeHistory.length > 0
        ? safeHistory.map((msg) => `${msg.role}: ${msg.content}`).join("\n")
        : "";

    const complaintPrompt = `Bạn là Quỳnh Như, chuyên viên xử lý khiếu nại của DienThoaiGiaKho.
1. Luôn đồng cảm và xin lỗi vì bất tiện.
2. Thu thập email/SĐT, tự phát hiện nếu có trong tin nhắn.
3. isComplete = true chỉ khi đã có ít nhất một thông tin liên lạc.
4. priority: urgent (lỗi nghiêm trọng), high (lỗi sản phẩm), medium (dịch vụ), low (thắc mắc).
Chỉ trả JSON.
${historyText ? `LỊCH SỬ CHAT:\n${historyText}` : ""}
TIN NHẮN MỚI: ${userMessage}
Trả về JSON với:
{
  "responseText": "...",
  "isComplete": true/false,
  "complaintData": {
    "detailedDescription": "...",
    "customerContact": { "email": "...", "phone": "..." },
    "priority": "low|medium|high|urgent",
    "tags": ["..."]
  }
}`;

    const responseText = await callChat(
      [
        { role: "system", content: "Bạn là agent xử lý khiếu nại chuyên nghiệp, trả JSON." },
        { role: "user", content: complaintPrompt },
      ],
      { maxTokens: 500, temperature: 0.4 }
    );

    try {
      const parsedResponse = parseJsonFromText(responseText);

      if (
        !parsedResponse.responseText ||
        typeof parsedResponse.isComplete !== "boolean" ||
        !parsedResponse.complaintData
      ) {
        throw new Error("Invalid complaint response structure");
      }

      if (!parsedResponse.complaintData.customerContact) {
        parsedResponse.complaintData.customerContact = {};
      }

      if (parsedResponse.complaintData.customerContact.email) {
        const email = parsedResponse.complaintData.customerContact.email.trim().toLowerCase();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        parsedResponse.complaintData.customerContact.email = emailRegex.test(email)
          ? email
          : null;
      }

      if (parsedResponse.complaintData.customerContact.phone) {
        let phone = parsedResponse.complaintData.customerContact.phone.replace(/[\s\-\.]/g, "");
        const phoneRegex = /^(0|\+84)[0-9]{9,10}$/;
        parsedResponse.complaintData.customerContact.phone = phoneRegex.test(phone)
          ? phone
          : null;
      }

      if (
        !parsedResponse.complaintData.priority ||
        !["low", "medium", "high", "urgent"].includes(parsedResponse.complaintData.priority)
      ) {
        parsedResponse.complaintData.priority = "medium";
      }

      if (!Array.isArray(parsedResponse.complaintData.tags)) {
        parsedResponse.complaintData.tags = [];
      }

      return parsedResponse;
    } catch (parseError) {
      console.error("Error parsing complaint response:", parseError.message);

      return {
        responseText:
          "Em rất xin lỗi về sự bất tiện này. Em đã ghi nhận khiếu nại và sẽ chuyển bộ phận chuyên trách. Anh/chị có thể cung cấp email hoặc số điện thoại để em liên hệ ạ?",
        isComplete: false,
        complaintData: {
          detailedDescription: userMessage,
          customerContact: {
            email: null,
            phone: null,
          },
          priority: "medium",
          tags: ["general"],
        },
        nextAction: "Yêu cầu thông tin liên lạc từ khách hàng",
      };
    }
  } catch (error) {
    console.error("Error in generateComplaintResponse:", error.message);

    return {
      responseText:
        "Em rất xin lỗi, hiện tại hệ thống đang gặp sự cố kỹ thuật. Anh/chị có thể liên hệ hotline để được hỗ trợ trực tiếp không ạ?",
      isComplete: false,
      complaintData: {
        detailedDescription: userMessage,
        customerContact: {
          email: null,
          phone: null,
        },
        priority: "medium",
        tags: ["system_error"],
      },
      nextAction: "Hướng dẫn khách hàng liên hệ hotline",
    };
  }
};

const testGeminiConnection = async () => {
  try {
    console.log("Testing OpenAI chat connection...");
    const testResponse = await generateResponse(
      "Chào bạn, tôi đang test kết nối API. Vui lòng trả lời ngắn gọn."
    );
    if (testResponse && !testResponse.includes("sự cố kỹ thuật")) {
      console.log("OpenAI chat connection thành công");
      return true;
    }
    throw new Error("Test response không hợp lệ");
  } catch (error) {
    console.error("OpenAI chat connection failed:", error.message);
    return false;
  }
};

module.exports = {
  classifyIntentAndRespond,
  preclassifyIntent,
  generateResponse,
  generateChatResponse,
  createSystemPrompt,
  generateComplaintResponse,
  testGeminiConnection,
};


