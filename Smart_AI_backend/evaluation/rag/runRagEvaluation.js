#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { createRecommendationStore } = require('../recommendation/recommendationStore');
const { installDeterministicOpenAIEmbedding } = require('../deterministicEmbedding');
const { createGenerationHooks } = require('./fakeLLMProviders');
const { RAG_CASES } = require('./fixtures/ragCases');
const { evaluateRagCases } = require('./evaluator');

const USAGE = `
Usage: node evaluation/rag/runRagEvaluation.js [options]

Options:
  --fail-under=<number>  Exit with code 1 if overall pass rate < threshold (0..1)
  --output=<path>        Write JSON report to <path> (default: evaluation-results/rag-evaluation.json)
  --help                 Show this message

Examples:
  node evaluation/rag/runRagEvaluation.js
  node evaluation/rag/runRagEvaluation.js --fail-under=0.90
`;

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { failUnder: null, output: null };

  for (const arg of args) {
    if (arg === '--help') {
      console.log(USAGE);
      opts._exitEarly = true;
      return opts;
    }
    if (arg.startsWith('--fail-under=')) {
      const val = parseFloat(arg.split('=')[1]);
      if (isNaN(val) || val < 0 || val > 1) {
        console.error(`Error: --fail-under must be a number between 0 and 1, got "${arg.split('=')[1]}"`);
        opts._exitEarly = true;
        process.exitCode = 1;
        return opts;
      }
      opts.failUnder = val;
    } else if (arg.startsWith('--output=')) {
      opts.output = arg.split('=')[1];
    } else {
      console.error(`Error: Unknown option "${arg}"`);
      console.log(USAGE);
      opts._exitEarly = true;
      process.exitCode = 1;
      return opts;
    }
  }

  return opts;
}

/**
 * Load the REAL services in this order so every production path runs untouched
 * while every external dependency is replaced by a deterministic offline
 * stand-in BEFORE its consumer module is required:
 *   1. fixture Product store   -> models/Product
 *   2. deterministic embedding -> utils/openai
 *   3. fake LLM providers      -> openai / @google/genai (used by utils/gemini)
 */
function loadSearchAndGeneration() {
  const productPath = require.resolve('../../models/Product');
  const store = createRecommendationStore();
  require.cache[productPath] = {
    id: productPath,
    filename: productPath,
    loaded: true,
    exports: store,
  };
  installDeterministicOpenAIEmbedding();

  const responsesByQuery = new Map(RAG_CASES.map(c => [c.query, c.answer]));
  const generation = createGenerationHooks({
    resolveResponse: userMessage =>
      responsesByQuery.get(userMessage) || 'Xin lỗi, tôi chưa có thông tin cụ thể về sản phẩm này.',
  });

  const { search } = require('../../services/productSearchService');
  return { search, store, generation };
}

const pct = v => (typeof v === 'number' && isFinite(v) ? `${(v * 100).toFixed(2)}%` : 'N/A');

async function main() {
  const opts = parseArgs();
  if (opts._exitEarly) return;

  console.log('=== RAG Answer-Quality Offline Evaluation ===\n');

  const { search, store, generation } = loadSearchAndGeneration();
  const setup = c => store.configure({ vectorFailure: c.vectorFailure === true });
  const getCatalog = () => store.find({}).lean();

  const { results, report } = await evaluateRagCases(RAG_CASES, search, setup, getCatalog, generation);

  const outputPath = opts.output || path.join('evaluation-results', 'rag-evaluation.json');
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  const reportDoc = {
    metadata: {
      generatedAt: new Date().toISOString(),
      mode: 'offline-deterministic',
      totalCases: report.totalCases,
    },
    summary: {
      overallPassRate: report.passRate,
      passed: report.passed,
      failed: report.failed,
    },
    retrieval: {
      meanRecallAtK: report.meanRecallAtK,
      meanPrecisionAtK: report.meanPrecisionAtK,
      meanHitAtK: report.meanHitAtK,
      modeCounts: report.modeCounts,
      forbiddenViolations: report.forbiddenViolations,
    },
    generation: {
      providerCounts: report.generationProviderCounts,
      meanGroundedness: report.meanGroundedness,
      totalUnsupportedClaims: report.totalUnsupportedClaims,
      meanPromptGrounding: report.meanPromptGrounding,
      promptGroundingFailures: report.promptGroundingFailures,
      missingSystemMessage: report.missingSystemMessage,
      streamedMissingSystemMessage: report.streamedMissingSystemMessage,
    },
    rag: report,
    cases: results.map(r => ({
      caseId: r.caseId,
      passed: r.passed,
      searchMode: r.searchMode,
      error: r.error,
      retrievedIds: r.retrievedIds,
      relevantIds: r.relevantIds,
      metrics: r.metrics,
      generated: r.generated
        ? {
            provider: r.generated.provider,
            generatedAnswer: r.generated.text,
            systemPrompt: r.generated.systemPrompt,
            userMessage: r.generated.userMessage,
            messagesCount: r.generated.messagesCount,
            usesSystemMessage: r.generated.usesSystemMessage,
            promptGrounding: r.generated.promptGrounding,
            promptProductsFound: r.generated.promptProductsFound,
            groundedness: r.generated.groundedness,
          }
        : undefined,
      streamed: r.streamed
        ? {
            provider: r.streamed.provider,
            fullResponse: r.streamed.fullResponse,
            usesSystemMessage: r.streamed.usesSystemMessage,
          }
        : undefined,
      stable: r.stable,
    })),
  };
  fs.writeFileSync(outputPath, JSON.stringify(reportDoc, null, 2), 'utf-8');

  console.log(`Report written to ${outputPath}\n`);

  console.log('=== Summary ===');
  console.log(`  Total cases:     ${report.totalCases}`);
  console.log(`  Passed:          ${report.passed}`);
  console.log(`  Failed:          ${report.failed}`);
  console.log(`  Pass rate:       ${(report.passRate * 100).toFixed(2)}%`);
  console.log(`  Modes:           ${JSON.stringify(report.modeCounts)}`);

  console.log('\n=== Retrieval (real productSearchService.search()) ===');
  console.log(`  Mean Recall@K:    ${pct(report.meanRecallAtK)}`);
  console.log(`  Mean Precision@K: ${pct(report.meanPrecisionAtK)}`);
  console.log(`  Mean Hit@K:       ${pct(report.meanHitAtK)}`);
  console.log(`  Forbidden returned: ${report.forbiddenViolations}`);

  console.log('\n=== Generation (real generateChatResponse / generateChatResponseStream) ===');
  console.log(`  Providers:         ${JSON.stringify(report.generationProviderCounts)}`);
  console.log(`  Mean groundedness: ${pct(report.meanGroundedness)}`);
  console.log(`  Unsupported claims: ${report.totalUnsupportedClaims}`);
  console.log(`  Mean prompt grounding: ${pct(report.meanPromptGrounding)}`);
  console.log(`  Prompt-grounding failures: ${report.promptGroundingFailures}`);
  console.log(`  Missing system message (non-stream): ${report.missingSystemMessage}`);
  console.log(`  Missing system message (stream): ${report.streamedMissingSystemMessage}`);

  for (const r of results) {
    const flag = r.passed ? 'PASS' : 'FAIL';
    const reasons = r.groundedness.reasons.length > 0 ? `  reasons=${r.groundedness.reasons.join(';')}` : '';
    const gen = r.generated
      ? `  genProvider=${r.generated.provider}  genGround=${r.generated.groundedness.score.toFixed(2)}  ` +
        `promptGround=${r.generated.promptGrounding.toFixed(2)}  sysMsg=${r.generated.usesSystemMessage}`
      : '';
    const stream = r.streamed ? `  streamSysMsg=${r.streamed.usesSystemMessage}` : '';
    console.log(
      `  [${flag}] ${r.caseId}  mode=${r.searchMode}  recall@${r.metrics.k}=${r.metrics.recallAtK.toFixed(2)}  ` +
      `precision@${r.metrics.k}=${r.metrics.precisionAtK.toFixed(2)}  hit=${r.metrics.hitAtK}${gen}${stream}  stable=${r.stable}` +
      `${r.error ? `  error=${r.error}` : ''}${reasons}`
    );
  }

  if (opts.failUnder !== null) {
    const rate = report.passRate;
    if (rate < opts.failUnder) {
      console.error(`\nFAIL: Overall pass rate ${(rate * 100).toFixed(2)}% is below threshold ${(opts.failUnder * 100).toFixed(2)}%`);
      process.exitCode = 1;
    } else {
      console.log(`\nPASS: Overall pass rate ${(rate * 100).toFixed(2)}% meets threshold ${(opts.failUnder * 100).toFixed(2)}%`);
    }
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('Evaluation failed:', err.message);
    process.exitCode = 1;
  });
}

module.exports = { parseArgs };