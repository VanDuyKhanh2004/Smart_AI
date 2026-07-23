# Chatbot Offline Evaluation

## Purpose

This module evaluates the AI shopping chatbot's quality **without calling real AI providers (Gemini, OpenAI) or production infrastructure (MongoDB, Redis, BullMQ)**.

All evaluation runs against curated fixtures with mocked services. Results are deterministic and reproducible.

## Architecture

```
evaluation/chatbot/
  fixtures/
    products.js            — 13 curated product definitions matching Product schema
    singleTurnCases.js     — 15 single-turn constraint cases
    rankingCases.js        — 5 ranking preference cases
    multiTurnCases.js      — 10 multi-turn conversation scenarios
    fallbackCases.js       — 5 fallback provider cases + 5 search-tier cases
  metrics.js               — Pure metric calculation functions
  evaluator.js             — Orchestrator: loads fixtures, mocks services, records outcomes
  runEvaluation.js         — CLI entry point with --fail-under support
  README.md                — This file
```

### Separation

| Concern | File |
|---------|------|
| Product fixtures | `fixtures/products.js` |
| Test case definitions | `fixtures/*Cases.js` |
| Metric calculations | `metrics.js` |
| Execution orchestration | `evaluator.js` |
| CLI / reporting | `runEvaluation.js` |

## Metrics Definitions

### Constraint Accuracy

- **caseAccuracy**: Fraction of constraint cases where every returned product satisfies all expected constraints. A case fails if required products are missing or forbidden products appear.
- **productPrecision**: Fraction of all returned products that satisfy constraints (across all constraint cases).
- **violatingProductCount**: Total number of out-of-constraint products returned across all cases.
- **noResultHonestyRate**: Fraction of cases expecting zero results that actually returned zero.

### Ranking Quality

- **top1Accuracy**: Fraction of ranking cases where the expected top product appears at position 1.
- **meanReciprocalRank**: Average of 1/rank for the expected top product across all ranking cases.
- **pairwiseRankingAccuracy**: Fraction of pairwise comparisons (A should rank before B) that hold.
- **stableRankingRate**: Fraction of ranking runs that produced deterministic, tie-stable output.

### Context Retention

- **retentionAccuracy**: Fraction of multi-turn cases where merged constraints are correctly inherited.
- **replacementAccuracy**: Fraction of brand-replacement cases where new brand replaces old.
- **resetAccuracy**: Fraction of reset cases where old filters are cleared.
- **isolationAccuracy**: Fraction of session-isolation cases where contexts do not leak.
- **failedTurnPreservationAccuracy**: Fraction of cases where previous valid context survives a completely failed response.

### Fallback Reliability

- **validResponseRate**: Fraction of fallback cases that produced a non-empty response.
- **deterministicFallbackSuccessRate**: Fraction of cases where the deterministic fallback activated when expected.
- **contextSaveOnValidResponseRate**: Fraction of valid-response cases where context was correctly saved.
- **contextNotSavedOnFailureRate**: Fraction of failure cases where context was correctly NOT saved.

### Latency (Offline Simulated)

- **averageMs**, **p50Ms**, **p95Ms**, **maxMs**: Statistical timing percentiles for all evaluation cases.
- All metrics are labeled "offline simulated" — they measure local execution with mocked services and do not represent production latency.

## How to Run

```bash
# Basic evaluation
npm run evaluate:chatbot

# With pass/fail threshold
npm run evaluate:chatbot -- --fail-under=0.90

# Custom output path
npm run evaluate:chatbot -- --output=./my-report.json
```

### CLI Options

| Option | Description |
|--------|-------------|
| `--fail-under=<number>` | Exit with code 1 if overall pass rate < threshold (0..1). Invalid values print error and exit 1. |
| `--output=<path>` | Write JSON report to custom path (default: `evaluation-results/chatbot-evaluation.json`) |
| `--help` | Show usage |

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Evaluation completed. If `--fail-under` was set, the pass rate met the threshold. |
| 1 | Pass rate below `--fail-under` threshold, or execution error, or invalid arguments. |

## How to Interpret Results

The JSON report contains:

```json
{
  "metadata": { "generatedAt": "...", "mode": "offline-mocked", "totalCases": 40 },
  "summary": { "overallPassRate": 0.95, "passed": 38, "failed": 2 },
  "constraints": { "caseAccuracy": 1, "productPrecision": 1, "violatingProductCount": 0, "noResultHonestyRate": 1 },
  "ranking": { "top1Accuracy": 0.8, "meanReciprocalRank": 0.9, "pairwiseRankingAccuracy": 0.92, "stableRankingRate": 1 },
  "context": { "retentionAccuracy": 1, "replacementAccuracy": 1, "resetAccuracy": 1, "isolationAccuracy": 1, "failedTurnPreservationAccuracy": 1 },
  "fallback": { "validResponseRate": 1, "deterministicFallbackSuccessRate": 1, "constraintSafetyUnderFallback": 1, "contextSaveOnValidResponseRate": 1, "contextNotSavedOnFailureRate": 1 },
  "latency": { "label": "offline simulated", "averageMs": 2.1, "p50Ms": 1.5, "p95Ms": 5.0, "maxMs": 12.3 },
  "cases": [
    { "caseId": "constraint-price-max-001", "category": "constraint", "passed": true },
    ...
  ]
}
```

- Metrics near 1.0 indicate good performance.
- Individual case results allow pinpointing specific failures.
- Latency metrics are simulated and useful only for regression detection, not production SLA claims.

## Limitations

1. **Curated fixtures**: Cases are hand-written and may not represent all real-world user language. High scores do not guarantee production performance.
2. **No real providers**: Gemini/OpenAI responses are simulated. Provider-specific phrasing, refusal handling, and hallucination patterns are not tested.
3. **No real search tier integration**: MongoDB Atlas `$vectorSearch` and text search are mocked. Search tier fail-over behavior is simulated.
4. **No real latency**: Timings reflect local execution with mocked I/O. Production latency will differ significantly.
5. **Deterministic only**: All fixtures and mocks are deterministic. Non-deterministic user behavior patterns are not covered.

## Adding New Fixtures

1. Add products to `fixtures/products.js` (optional).
2. Add test cases to the appropriate `fixtures/*Cases.js` file.

### Constraint case structure:
```js
{
  id: "constraint-xxx-001",
  category: "constraint",
  query: "điện thoại dưới 10 triệu",
  expected: {
    maxPrice: 10000000,
    requiredProductIds: ["eval-..."],
    forbiddenProductIds: ["eval-..."]
  }
}
```

### Ranking case structure:
```js
{
  id: "ranking-xxx-002",
  category: "ranking",
  query: "...ưu tiên camera đẹp",
  preferences: { camera: true, battery: false, performance: false, compact: false },
  productPool: ["eval-...", "eval-..."],
  expected: {
    topExpectedId: "eval-...",
    pairwisePreferred: [["eval-A", "eval-B"]]
  }
}
```

### Multi-turn case structure:
```js
{
  id: "context-xxx-003",
  category: "context",
  sessionId: "eval-ctx-x",
  turns: [
    { query: "...", responseType: "product_query" },
    { query: "...", responseType: "small_talk" },
  ],
  expectedFinalConstraints: { brands: ["samsung"], maxPrice: 14999999 }
}
```

3. Run `npm run evaluate:chatbot` to verify.
4. Run `npm test` to ensure existing tests still pass.

## Difference from Production Metrics

| Aspect | Offline Evaluation | Production |
|--------|-------------------|------------|
| Response generation | Mocked deterministic | Real Gemini/OpenAI + deterministic fallback |
| Search | In-memory filter | MongoDB Atlas $vectorSearch + text + fallback |
| Context storage | In-memory Map | Redis via cacheService |
| Latency | Local execution time | Network + provider + DB |
| Coverage | Curated fixtures | Real user traffic |
| Determinism | Fully deterministic | Non-deterministic (AI providers) |
