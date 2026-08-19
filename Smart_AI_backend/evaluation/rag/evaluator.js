/**
 * Offline RAG answer-quality evaluation engine.
 *
 * Executes the REAL services/productSearchService.search() against the
 * fixture-backed Product store (require.cache override) with the deterministic
 * embedding override installed — the same "inject before require" pattern used
 * by evaluation/recommendation/runRecommendationEvaluation.js.
 *
 * When a `generation` config is supplied, each case ALSO runs the REAL
 * production answer-generation path (utils/gemini.js generateChatResponse /
 * generateChatResponseStream) with the retrieved products as productContext —
 * exactly what the production controller passes as `validatedProducts`. The
 * LLM providers are deterministic fakes (see fakeLLMProviders.js) so the
 * production prompt construction, product-context construction, retrieval and
 * generation orchestration all run untouched, with no network. The evaluator
 * then grades the GENERATED answer for groundedness and checks that the
 * production system prompt actually contains the retrieved product information.
 *
 * `searchFn`, `getCatalog` and `generation` are injected so the Jest suite
 * (jest.doMock) and the CLI (require.cache override) can run the same engine
 * offline.
 */

const { computeRetrievalMetrics } = require('./retrievalMetrics');
const { evaluateGroundedness, findProductRefs } = require('./groundedness');

const mean = arr => (arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length);

/**
 * Check how much of the retrieved product context actually reached the
 * production system prompt. Returns { score, found, total, noProductsMarker }.
 * Score is 1 when the retrieved set is empty and the "no products" marker is
 * present (or vacuous when empty).
 */
function computePromptGrounding(systemPrompt, retrievedProducts) {
  const prompt = String(systemPrompt || '');
  const products = retrievedProducts || [];
  if (products.length === 0) {
    return {
      score: 1,
      found: 0,
      total: 0,
      noProductsMarker: prompt.includes('HIỆN TẠI KHÔNG CÓ SẢN PHẨM LIÊN QUAN TRONG KHO'),
    };
  }
  const nameRefs = findProductRefs(prompt, products);
  let found = 0;
  for (const p of products) {
    const byName = nameRefs.some(r => String(r._id) === String(p._id));
    const byId = prompt.includes(String(p._id));
    if (byName || byId) found += 1;
  }
  return { score: found / products.length, found, total: products.length };
}

async function evaluateRagCases(cases, searchFn, setup, getCatalog, generation) {
  const allProducts = await getCatalog();
  const results = [];

  for (const c of cases) {
    if (setup) await setup(c);

    let run1 = null;
    let run2 = null;
    let error = null;
    try {
      run1 = await searchFn(c.query, c.limit, c.filters);
      run2 = await searchFn(c.query, c.limit, c.filters);
    } catch (e) {
      error = e;
    }

    const products = error ? [] : (run1.products || []);
    const retrievedIds = products.map(p => String(p._id));
    const relevantIds = (c.relevantIds || []).map(String);
    const forbiddenIds = (c.forbiddenIds || []).map(String);

    const metrics = computeRetrievalMetrics(relevantIds, retrievedIds, products.length);

    // --- Generation: run the REAL production answer-generation path offline. ---
    let generated = null;
    let streamed = null;
    let groundedness = null;

    if (generation && generation.generate) {
      const gen = await generation.generate([], c.query, products);
      const sysPrompt = gen.systemPrompt
        || (gen.messages && gen.messages[0] && gen.messages[0].content)
        || null;
      const promptGrounding = computePromptGrounding(sysPrompt, products);
      const genGrounded = evaluateGroundedness({
        answer: gen.text,
        allProducts,
        retrievedProducts: products,
      });

      generated = {
        text: gen.text,
        provider: gen.provider,
        systemPrompt: sysPrompt,
        userMessage: gen.userMessage,
        messagesCount: gen.messages ? gen.messages.length : 0,
        usesSystemMessage: Boolean(gen.messages && gen.messages[0] && gen.messages[0].role === 'system'),
        promptGrounding: promptGrounding.score,
        promptProductsFound: promptGrounding.found,
        promptNoProductsMarker: promptGrounding.noProductsMarker,
        groundedness: genGrounded,
      };
      groundedness = genGrounded;

      if (generation.generateStream) {
        const st = await generation.generateStream({
          userMessage: c.query,
          chatHistory: [],
          productContext: products,
        });
        streamed = {
          fullResponse: st.fullResponse,
          provider: st.provider,
          streamed: st.streamed === true,
          usesSystemMessage: Boolean(st.messages && st.messages[0] && st.messages[0].role === 'system'),
          systemPrompt: st.systemPrompt || (st.messages && st.messages[0] && st.messages[0].content) || null,
        };
      }
    } else {
      groundedness = evaluateGroundedness({
        answer: c.answer,
        allProducts,
        retrievedProducts: products,
      });
    }

    const stable =
      !error &&
      JSON.stringify(retrievedIds) ===
        JSON.stringify((run2.products || []).map(p => String(p._id)));
    const modeMatches = !error && (c.expectedMode ? run1.searchMode === c.expectedMode : true);
    const emptyMatches = c.expectedEmpty ? products.length === 0 : true;
    const forbiddenViolated = products.some(p => forbiddenIds.includes(String(p._id)));
    const recallGate = c.expectedEmpty
      ? products.length === 0
      : relevantIds.length === 0 || metrics.recallAtK >= 1;
    const groundedGate = groundedness.score >= 1;
    const generationGate =
      !generation ||
      Boolean(
        generated &&
        generated.groundedness.score >= 1 &&
        generated.usesSystemMessage &&
        generated.promptGrounding >= 1 &&
        (!generation.generateStream || (streamed && streamed.usesSystemMessage))
      );

    const passed = Boolean(
      !error &&
      stable &&
      modeMatches &&
      emptyMatches &&
      !forbiddenViolated &&
      recallGate &&
      groundedGate &&
      generationGate
    );

    results.push({
      caseId: c.id,
      query: c.query,
      filters: c.filters || undefined,
      expectedMode: c.expectedMode || undefined,
      expectedEmpty: c.expectedEmpty === true,
      vectorFailure: c.vectorFailure === true,
      searchMode: run1 ? run1.searchMode : 'error',
      error: error ? error.message : undefined,
      retrievedIds,
      relevantIds,
      forbiddenIds,
      metrics,
      groundedness: {
        totalClaims: groundedness.totalClaims,
        supportedClaims: groundedness.supportedClaims,
        unsupportedClaims: groundedness.unsupportedClaims,
        score: groundedness.score,
        reasons: groundedness.claims.filter(r => !r.supported).map(r => r.reason),
      },
      generated,
      streamed,
      stable,
      passed,
    });
  }

  const retrievalResults = results.filter(r => r.relevantIds.length > 0);
  const generationResults = results.filter(r => r.generated);
  const modeCounts = results.reduce((acc, r) => {
    acc[r.searchMode] = (acc[r.searchMode] || 0) + 1;
    return acc;
  }, {});

  const providerCounts = generationResults.reduce((acc, r) => {
    acc[r.generated.provider] = (acc[r.generated.provider] || 0) + 1;
    return acc;
  }, {});

  const report = {
    totalCases: results.length,
    passed: results.filter(r => r.passed).length,
    failed: results.filter(r => !r.passed).length,
    passRate: results.length === 0 ? 0 : results.filter(r => r.passed).length / results.length,
    meanRecallAtK: mean(retrievalResults.map(r => r.metrics.recallAtK)),
    meanPrecisionAtK: mean(retrievalResults.map(r => r.metrics.precisionAtK)),
    meanHitAtK: mean(retrievalResults.map(r => r.metrics.hitAtK)),
    modeCounts,
    forbiddenViolations: results.filter(r => r.forbiddenIds.some(id => r.retrievedIds.includes(id))).length,
    meanGroundedness: mean(results.map(r => r.groundedness.score)),
    totalUnsupportedClaims: results.reduce((sum, r) => sum + r.groundedness.unsupportedClaims, 0),
    meanPromptGrounding: generationResults.length === 0 ? 0 : mean(generationResults.map(r => r.generated.promptGrounding)),
    promptGroundingFailures: generationResults.filter(r => r.generated.promptGrounding < 1).length,
    missingSystemMessage: generationResults.filter(r => !r.generated.usesSystemMessage).length,
    streamedMissingSystemMessage: generationResults.filter(r => r.streamed && !r.streamed.usesSystemMessage).length,
    generationProviderCounts: providerCounts,
  };

  return { results, report };
}

module.exports = { evaluateRagCases, computePromptGrounding };