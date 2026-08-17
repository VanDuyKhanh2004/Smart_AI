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

function parseArgs(args) {
  const argv = Array.isArray(args) ? args : process.argv.slice(2);
  const opts = { failUnder: null, output: null };

  for (const arg of argv) {
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

const pct = v => (typeof v === 'number' && isFinite(v) ? `${(v * 100).toFixed(2)}%` : 'N/A');

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
  console.log(`  Case accuracy:            ${pct(report.constraints.caseAccuracy)}`);
  console.log(`  Product precision:        ${pct(report.constraints.productPrecision)}`);
  console.log(`  Violating products:       ${report.constraints.violatingProductCount}`);
  console.log(`  No-result honesty rate:   ${pct(report.constraints.noResultHonestyRate)}`);
  console.log(`  Parser norm. accuracy:    ${pct(report.parserNormalization.accuracy)}`);

  console.log('\n=== Ranking Metrics ===');
  console.log(`  Top-1 accuracy:           ${pct(report.ranking.top1Accuracy)}`);
  console.log(`  Mean reciprocal rank:     ${pct(report.ranking.meanReciprocalRank)}`);
  console.log(`  Pairwise accuracy:        ${pct(report.ranking.pairwiseRankingAccuracy)}`);
  console.log(`  Stable ranking rate:      ${pct(report.ranking.stableRankingRate)}`);

  console.log('\n=== Context Metrics ===');
  console.log(`  Retention accuracy:       ${pct(report.context.retentionAccuracy)}`);
  console.log(`  Replacement accuracy:     ${pct(report.context.replacementAccuracy)}`);
  console.log(`  Reset accuracy:           ${pct(report.context.resetAccuracy)}`);
  console.log(`  Isolation accuracy:       ${pct(report.context.isolationAccuracy)}`);
  console.log(`  Failure preserve:         ${pct(report.context.failedTurnPreservationAccuracy)}`);

  console.log('\n=== Fallback Metrics ===');
  console.log(`  Valid response rate:      ${pct(report.fallback.validResponseRate)}`);
  console.log(`  Deterministic success:    ${pct(report.fallback.deterministicFallbackSuccessRate)}`);
  console.log(`  Constraint safety:        ${pct(report.fallback.constraintSafetyUnderFallback)}`);
  console.log(`  Context save on valid:    ${pct(report.fallback.contextSaveOnValidResponseRate)}`);
  console.log(`  Context not saved on fail: ${pct(report.fallback.contextNotSavedOnFailureRate)}`);

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

module.exports = { parseArgs };
