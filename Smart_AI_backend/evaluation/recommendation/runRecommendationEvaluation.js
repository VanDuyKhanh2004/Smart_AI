#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { createRecommendationStore } = require('./recommendationStore');
const { RECOMMENDATION_CASES } = require('../chatbot/fixtures/recommendationCases');
const { evaluateRecommendationCases } = require('./engine');

const USAGE = `
Usage: node evaluation/recommendation/runRecommendationEvaluation.js [options]

Options:
  --fail-under=<number>  Exit with code 1 if overall pass rate < threshold (0..1)
  --output=<path>        Write JSON report to <path> (default: evaluation-results/recommendation-evaluation.json)
  --help                 Show this message

Examples:
  node evaluation/recommendation/runRecommendationEvaluation.js
  node evaluation/recommendation/runRecommendationEvaluation.js --fail-under=1.0
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
 * Load the recommendation service with the fixture Product model installed in
 * the require cache, so no MongoDB connection is needed.
 */
function loadRecommend() {
  const productPath = require.resolve('../../models/Product');
  const store = createRecommendationStore();
  require.cache[productPath] = {
    id: productPath,
    filename: productPath,
    loaded: true,
    exports: store,
  };
  const { recommend } = require('../../services/productRecommendationService');
  return { recommend, store };
}

const pct = v => (typeof v === 'number' && isFinite(v) ? `${(v * 100).toFixed(2)}%` : 'N/A');

async function main() {
  const opts = parseArgs();
  if (opts._exitEarly) return;

  console.log('=== Recommendation Offline Evaluation ===\n');

  const { recommend, store } = loadRecommend();
  const { results, report } = await evaluateRecommendationCases(
    RECOMMENDATION_CASES,
    recommend,
    c => store.configure({
      embedSourceId: c.sourceProductId,
      embedSource: c.embedSource !== false,
      vectorFailure: c.vectorFailure === true,
    }),
  );

  const outputPath = opts.output || path.join('evaluation-results', 'recommendation-evaluation.json');
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  const reportDoc = {
    metadata: {
      generatedAt: new Date().toISOString(),
      mode: 'offline-mocked',
      totalCases: report.totalCases,
    },
    summary: {
      overallPassRate: report.totalCases > 0 ? report.passed / report.totalCases : 0,
      passed: report.passed,
      failed: report.totalCases - report.passed,
    },
    recommendation: report,
    cases: results.map(r => ({
      caseId: r.caseId,
      passed: r.passed,
      mode: r.recommendationMode,
      constraintSafe: r.constraintSafe,
      stable: r.stable,
      outOfStockReturned: r.outOfStockReturned,
      error: r.error,
      returnedIds: r.returnedIds,
    })),
  };
  fs.writeFileSync(outputPath, JSON.stringify(reportDoc, null, 2), 'utf-8');

  console.log(`Report written to ${outputPath}\n`);

  console.log('=== Summary ===');
  console.log(`  Total cases:     ${report.totalCases}`);
  console.log(`  Passed:          ${report.passed}`);
  console.log(`  Failed:          ${report.totalCases - report.passed}`);
  console.log(`  Pass rate:       ${(reportDoc.summary.overallPassRate * 100).toFixed(2)}%`);
  console.log(`  Modes:           ${JSON.stringify(report.modeCounts)}`);

  console.log('\n=== Safety & Robustness ===');
  console.log(`  Hard-constraint safety:  ${pct(report.hardConstraintSatisfaction)}`);
  console.log(`  Out-of-stock returned:   ${report.outOfStockReturned}`);
  console.log(`  Determinism rate:        ${pct(report.determinismRate)}`);

  console.log('\n=== Ranking Quality (hand-authored relevance) ===');
  console.log(`  Precision@K:   ${pct(report.meanPrecisionAtK)}`);
  console.log(`  Recall@K:      ${pct(report.meanRecallAtK)}`);
  console.log(`  MRR:           ${pct(report.mrr)}`);
  console.log(`  NDCG@K:        ${pct(report.meanNdcgAtK)}`);
  console.log(`  Brand diversity: ${pct(report.meanDistinctBrandRatio)}`);

  for (const r of results) {
    const flag = r.passed ? 'PASS' : 'FAIL';
    console.log(`  [${flag}] ${r.caseId}  mode=${r.recommendationMode}  safe=${r.constraintSafe}  stock0=${r.outOfStockReturned}  stable=${r.stable}${r.error ? `  error=${r.error}` : ''}`);
  }

  if (opts.failUnder !== null) {
    const rate = reportDoc.summary.overallPassRate;
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
