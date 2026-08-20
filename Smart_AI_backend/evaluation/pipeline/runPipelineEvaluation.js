#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { createRecommendationStore } = require('../recommendation/recommendationStore');
const { installDeterministicOpenAIEmbedding } = require('../deterministicEmbedding');
const { PIPELINE_CASES } = require('./fixtures/pipelineCases');
const { evaluatePipelineCases } = require('./evaluator');
const { parseProductConstraints } = require('../../utils/productConstraintParser');
const { matchesProductConstraints } = require('../../utils/productValidator');
const { rankProducts } = require('../../utils/productRanking');
const { resolveFollowUpQuery } = require('../../utils/conversationContext');

const USAGE = `
Usage: node evaluation/pipeline/runPipelineEvaluation.js [options]

Options:
  --fail-under=<number>  Exit with code 1 if overall pass rate < threshold (0..1)
  --output=<path>        Write JSON report to <path> (default: evaluation-results/pipeline-evaluation.json)
  --help                 Show this message

Examples:
  node evaluation/pipeline/runPipelineEvaluation.js
  node evaluation/pipeline/runPipelineEvaluation.js --fail-under=1.0
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
 * Load the REAL services in the same "inject before require" order as the RAG
 * evaluation so every production path runs untouched while every external
 * dependency is replaced by a deterministic offline stand-in:
 *   1. fixture Product store   -> models/Product
 *   2. deterministic embedding -> utils/openai
 * Then require services/productSearchService and the pure pipeline functions.
 */
function loadPipelineDependencies() {
  const productPath = require.resolve('../../models/Product');
  const store = createRecommendationStore();
  require.cache[productPath] = {
    id: productPath,
    filename: productPath,
    loaded: true,
    exports: store,
  };
  installDeterministicOpenAIEmbedding();

  const { search } = require('../../services/productSearchService');

  const deps = {
    search,
    parse: parseProductConstraints,
    matches: matchesProductConstraints,
    rank: rankProducts,
    resolve: resolveFollowUpQuery,
  };

  return { store, deps };
}

const pct = v => (typeof v === 'number' && isFinite(v) ? `${(v * 100).toFixed(2)}%` : 'N/A');

async function main() {
  const opts = parseArgs();
  if (opts._exitEarly) return;

  console.log('=== Constraint Pipeline End-to-End Offline Evaluation ===\n');

  const { store, deps } = loadPipelineDependencies();
  const setup = c => store.configure({ vectorFailure: c.vectorFailure === true });

  const { results, report } = await evaluatePipelineCases(PIPELINE_CASES, deps, setup);

  const outputPath = opts.output || path.join('evaluation-results', 'pipeline-evaluation.json');
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  const reportDoc = {
    metadata: {
      generatedAt: new Date().toISOString(),
      mode: 'offline-deterministic',
      totalCases: report.totalCases,
      pipeline:
        'parseProductConstraints -> productSearchService.search -> matchesProductConstraints -> rankProducts -> top-5',
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
    safety: {
      validatorSafetyFailures: report.validatorSafetyFailures,
      determinismFailures: report.determinismFailures,
    },
    ranking: {
      rankingTop1Accuracy: report.rankingTop1Accuracy,
      pairwiseAccuracy: report.pairwiseAccuracy,
    },
    pipeline: report,
    cases: results.map(r => ({
      caseId: r.caseId,
      query: r.query,
      passed: r.passed,
      searchMode: r.searchMode,
      error: r.error,
      cleanedQuery: r.cleanedQuery,
      searchLimit: r.searchLimit,
      relevantIds: r.relevantIds,
      forbiddenIds: r.forbiddenIds,
      retrievedIds: r.retrievedIds,
      finalProductIds: r.finalProductIds,
      expectedTop: r.expectedTop,
      metrics: r.metrics,
      stable: r.stable,
      validatorSafety: r.validatorSafety,
      ranking: r.ranking,
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

  console.log('\n=== Pipeline safety ===');
  console.log(`  Validator-safety failures: ${report.validatorSafetyFailures}`);
  console.log(`  Determinism failures:      ${report.determinismFailures}`);

  console.log('\n=== Ranking (real rankProducts()) ===');
  console.log(`  Top-1 accuracy:  ${pct(report.rankingTop1Accuracy)}`);
  console.log(`  Pairwise accuracy: ${pct(report.pairwiseAccuracy)}`);

  for (const r of results) {
    const flag = r.passed ? 'PASS' : 'FAIL';
    const reasons = [];
    if (r.error) reasons.push(`error=${r.error}`);
    if (!r.stable) reasons.push('unstable');
    if (r.forbiddenIds.some(id => r.retrievedIds.includes(id))) reasons.push('forbidden-returned');
    if (r.relevantIds.length > 0 && r.metrics.recallAtK < 1) reasons.push(`recall=${r.metrics.recallAtK}`);
    if (!r.validatorSafety) reasons.push('validator-safety');
    if (r.ranking.anyPref && !r.ranking.topOk) reasons.push(`top1=${r.retrievedIds[0] || 'none'} != ${r.expectedTop}`);
    if (r.ranking.anyPref && !r.ranking.pairwiseOk) reasons.push(`pairwise ${r.ranking.pairwiseViolation || 'violation'}`);
    if (r.expectedEmpty && r.retrievedIds.length > 0) reasons.push('expected-empty');
    const rankingInfo = r.ranking.anyPref ? `  top1=${r.retrievedIds[0] || 'none'}` : '';
    console.log(
      `  [${flag}] ${r.caseId}  mode=${r.searchMode}  recall@${r.metrics.k}=${r.metrics.recallAtK.toFixed(2)}  ` +
      `retrieved=${r.retrievedIds.length}  top5=${JSON.stringify(r.finalProductIds)}${rankingInfo}` +
      `${reasons.length > 0 ? `  ${reasons.join('; ')}` : ''}`
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