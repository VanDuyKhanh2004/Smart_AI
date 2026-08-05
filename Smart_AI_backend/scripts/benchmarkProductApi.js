#!/usr/bin/env node
/**
 * Product API benchmark — dependency-free.
 *
 * Measures GET /products?page=1&limit=10 and GET /products/meta using the
 * built-in `fetch` and `performance` APIs. Useful to quantify the impact of
 * Product API performance work (metadata endpoint, lightweight list calls).
 *
 * Usage:
 *   node scripts/benchmarkProductApi.js
 *   node scripts/benchmarkProductApi.js --url http://localhost:5000/api
 *   node scripts/benchmarkProductApi.js --iterations 100 --concurrency 10
 *
 * Options (CLI flags take precedence over environment variables):
 *   --url, --base-url, -u      Base URL of the API. Env: BENCHMARK_BASE_URL
 *   --iterations, -n          Requests per endpoint. Env: BENCHMARK_ITERATIONS
 *   --concurrency, -c         Parallel requests per batch. Env: BENCHMARK_CONCURRENCY
 *   --list-only               Benchmark only the product list endpoint.
 *   --meta-only               Benchmark only the product metadata endpoint.
 *   --help, -h                Show usage.
 *
 * NOTE: results reflect your local network/dev server, NOT production latency
 * on Render. Cold/warm cache and network conditions vary.
 */

const DEFAULT_BASE_URL = 'http://localhost:5000/api';
const ENDPOINTS = {
  list: {
    name: 'GET /products?page=1&limit=10',
    path: '/products?page=1&limit=10',
  },
  meta: {
    name: 'GET /products/meta',
    path: '/products/meta',
  },
};

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = {
    baseUrl: process.env.BENCHMARK_BASE_URL || DEFAULT_BASE_URL,
    iterations: Number(process.env.BENCHMARK_ITERATIONS) || 30,
    concurrency: Number(process.env.BENCHMARK_CONCURRENCY) || 5,
    listOnly: false,
    metaOnly: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = () => args[i + 1];

    switch (arg) {
      case '--url':
      case '--base-url':
      case '-u':
        opts.baseUrl = next() || opts.baseUrl;
        i += 1;
        break;
      case '--iterations':
      case '-n':
        opts.iterations = Number(next()) || opts.iterations;
        i += 1;
        break;
      case '--concurrency':
      case '-c':
        opts.concurrency = Number(next()) || opts.concurrency;
        i += 1;
        break;
      case '--list-only':
        opts.listOnly = true;
        break;
      case '--meta-only':
        opts.metaOnly = true;
        break;
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
        break;
      default:
        // Ignore unknown flags.
        break;
    }
  }

  return opts;
}

function printUsage() {
  // eslint-disable-next-line no-console
  console.log(
    [
      'Usage: node scripts/benchmarkProductApi.js [options]',
      '',
      'Options:',
      "  --url, --base-url, -u <url>   Base URL (env BENCHMARK_BASE_URL)",
      '  --iterations, -n <int>        Requests per endpoint (env BENCHMARK_ITERATIONS)',
      '  --concurrency, -c <int>       Parallel requests per batch (env BENCHMARK_CONCURRENCY)',
      '  --list-only                   Benchmark only GET /products',
      '  --meta-only                   Benchmark only GET /products/meta',
      '  --help, -h                    Show this help',
    ].join('\n'),
  );
}

function sortNumbers(arr) {
  return arr.slice().sort((a, b) => a - b);
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function median(sorted) {
  return percentile(sorted, 50);
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return 'n/a';
  return `${(bytes / 1024).toFixed(2)} KB`;
}

function formatMs(ms) {
  return `${ms.toFixed(2)} ms`;
}

async function runEndpoint(baseUrl, endpoint, iterations, concurrency) {
  const url = baseUrl.replace(/\/$/, '') + endpoint.path;
  const durations = [];
  let successCount = 0;
  let failCount = 0;
  let statusErrors = 0;
  let totalBytes = 0;

  let completed = 0;
  async function worker() {
    while (completed < iterations) {
      // Consume the next iteration index atomically.
      const start = performance.now();
      let duration;
      let bytes = 0;

      try {
        const res = await fetch(url);
        if (res.ok) {
          successCount += 1;
        } else {
          statusErrors += 1;
        }
        // Approximate bytes via Content-Length when available, else 0.
        const contentLength = res.headers.get('content-length');
        if (contentLength) {
          bytes = Number(contentLength) || 0;
          totalBytes += bytes;
        }
      } catch (error) {
        failCount += 1;
      }

      duration = performance.now() - start;
      durations.push(duration);
      completed += 1;
    }
  }

  const workers = Array.from({ length: Math.max(1, concurrency) }, () => worker());
  await Promise.all(workers);

  const sorted = sortNumbers(durations);
  const sum = durations.reduce((a, b) => a + b, 0);

  const header = `\n${endpoint.name}`;
  const rows = [
    `  Success: ${successCount}  Failed: ${failCount}  Non-2xx: ${statusErrors}`,
    `  Requests: ${durations.length}  Concurrency: ${concurrency}`,
    `  Min: ${formatMs(sorted[0] ?? 0)}`,
    `  Avg: ${formatMs(sum / (durations.length || 1))}`,
    `  p50: ${formatMs(median(sorted))}`,
    `  p95: ${formatMs(percentile(sorted, 95))}`,
    `  Max: ${formatMs(sorted[sorted.length - 1] ?? 0)}`,
    `  Total response bytes: ${formatBytes(totalBytes)} (when Content-Length present)`,
  ];

  // eslint-disable-next-line no-console
  console.log(header + '\n' + rows.join('\n'));
}

async function main() {
  const opts = parseArgs(process.argv);

  // eslint-disable-next-line no-console
  console.log(
    `Benchmarking ${opts.baseUrl}\nIterations: ${opts.iterations}  Concurrency: ${opts.concurrency}\n` +
      'NOTE: local/dev results are NOT production latency. Cache state and network vary.',
  );

  const jobs = [];
  if (!opts.metaOnly) jobs.push(ENDPOINTS.list);
  if (!opts.listOnly) jobs.push(ENDPOINTS.meta);

  for (const endpoint of jobs) {
    await runEndpoint(opts.baseUrl, endpoint, opts.iterations, opts.concurrency);
  }

  // eslint-disable-next-line no-console
  console.log('\nDone.');
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Benchmark failed:', error.message);
  process.exit(1);
});