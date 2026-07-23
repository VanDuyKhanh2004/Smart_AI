#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { ChatbotEvaluator } = require('./evaluator');

const USAGE = `
Usage: node evaluation/chatbot/runEvaluation.js [options]

Options:
  --fail-under=<number>  Exit with code 1 if overall pass rate < threshold (0..1)
  --output=<path>        Write JSON report to <path> (default: evaluation-results/chatbot-evaluation.json)
  --help                 Show this message

Examples:
  node evaluation/chatbot/runEvaluation.js
  node evaluation/chatbot/runEvaluation.js --fail-under=0.90
  node evaluation/chatbot/runEvaluation.js --fail-under=0.85 --output=./my-report.json
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

async function main() {
  const opts = parseArgs();
  if (opts._exitEarly) return;

  console.log('=== Chatbot Offline Evaluation ===\n');

  const evaluator = new ChatbotEvaluator();
  const report = await evaluator.evaluateAll();

  const outputPath = opts.output || path.join('evaluation-results', 'chatbot-evaluation.json');
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf-8');

  console.log(`Report written to ${outputPath}\n`);

  console.log('=== Summary ===');
  console.log(`  Total cases: ${report.metadata.totalCases}`);
  console.log(`  Passed:      ${report.summary.passed}`);
  console.log(`  Failed:      ${report.summary.failed}`);
  console.log(`  Pass rate:   ${(report.summary.overallPassRate * 100).toFixed(2)}%`);

  console.log('\n=== Constraint Metrics ===');
  console.log(`  Case accuracy:            ${(report.constraints.caseAccuracy * 100).toFixed(2)}%`);
  console.log(`  Product precision:        ${(report.constraints.productPrecision * 100).toFixed(2)}%`);
  console.log(`  Violating products:       ${report.constraints.violatingProductCount}`);
  console.log(`  No-result honesty rate:   ${(report.constraints.noResultHonestyRate * 100).toFixed(2)}%`);
  console.log(`  Parser norm. accuracy:    ${(report.parserNormalization.accuracy * 100).toFixed(2)}%`);

  console.log('\n=== Ranking Metrics ===');
  console.log(`  Top-1 accuracy:           ${(report.ranking.top1Accuracy * 100).toFixed(2)}%`);
  console.log(`  Mean reciprocal rank:     ${(report.ranking.meanReciprocalRank * 100).toFixed(2)}%`);
  console.log(`  Pairwise accuracy:        ${(report.ranking.pairwiseRankingAccuracy * 100).toFixed(2)}%`);
  console.log(`  Stable ranking rate:      ${(report.ranking.stableRankingRate * 100).toFixed(2)}%`);

  console.log('\n=== Context Metrics ===');
  console.log(`  Retention accuracy:       ${(report.context.retentionAccuracy * 100).toFixed(2)}%`);
  console.log(`  Replacement accuracy:     ${(report.context.replacementAccuracy * 100).toFixed(2)}%`);
  console.log(`  Reset accuracy:           ${(report.context.resetAccuracy * 100).toFixed(2)}%`);
  console.log(`  Isolation accuracy:       ${(report.context.isolationAccuracy * 100).toFixed(2)}%`);
  console.log(`  Failure preserve:         ${(report.context.failedTurnPreservationAccuracy * 100).toFixed(2)}%`);

  console.log('\n=== Fallback Metrics ===');
  console.log(`  Valid response rate:      ${(report.fallback.validResponseRate * 100).toFixed(2)}%`);
  console.log(`  Deterministic success:    ${(report.fallback.deterministicFallbackSuccessRate * 100).toFixed(2)}%`);
  console.log(`  Context save on valid:    ${(report.fallback.contextSaveOnValidResponseRate * 100).toFixed(2)}%`);
  console.log(`  Context not saved on fail: ${(report.fallback.contextNotSavedOnFailureRate * 100).toFixed(2)}%`);

  console.log(`\n=== Latency (${report.latency.label}) ===`);
  console.log(`  Average: ${report.latency.averageMs} ms`);
  console.log(`  P50:     ${report.latency.p50Ms} ms`);
  console.log(`  P95:     ${report.latency.p95Ms} ms`);
  console.log(`  Max:     ${report.latency.maxMs} ms`);

  if (opts.failUnder !== null) {
    const rate = report.summary.overallPassRate;
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
