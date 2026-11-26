import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface Rewrite {
  source: string;
  destination: string;
}

function getConfigPath(): string {
  const fromFrontendRoot = resolve(process.cwd(), 'vercel.json');
  if (existsSync(fromFrontendRoot)) {
    return fromFrontendRoot;
  }
  return resolve(process.cwd(), 'Smart_AI_frontend', 'vercel.json');
}

function loadConfig(): { rewrites: Rewrite[] } {
  return JSON.parse(readFileSync(getConfigPath(), 'utf8')) as { rewrites: Rewrite[] };
}

/**
 * Static checks for the committed Vercel configuration. These prove the file is
 * valid JSON and ordered correctly; they do NOT prove Vercel's deployed runtime
 * behavior (see the manual verification plan in the Wave 3 report).
 */
describe('Vercel API proxy configuration', () => {
  it('is valid JSON', () => {
    expect(() => loadConfig()).not.toThrow();
  });

  it('rewrites /api/* to the backend before the SPA fallback', () => {
    const { rewrites } = loadConfig();
    const apiIndex = rewrites.findIndex((rewrite) => rewrite.source === '/api/:path*');
    const spaIndex = rewrites.findIndex((rewrite) => rewrite.source === '/(.*)');

    expect(apiIndex).toBeGreaterThanOrEqual(0);
    expect(spaIndex).toBeGreaterThanOrEqual(0);
    expect(apiIndex).toBeLessThan(spaIndex);
  });

  it('preserves the /api prefix and forwards the full sub-path', () => {
    const { rewrites } = loadConfig();
    const apiRewrite = rewrites.find((rewrite) => rewrite.source === '/api/:path*');

    expect(apiRewrite?.destination).toBe(
      'https://smart-ai-backend-twe5.onrender.com/api/:path*'
    );
  });

  it('keeps the SPA fallback intact', () => {
    const { rewrites } = loadConfig();

    expect(rewrites).toContainEqual({ source: '/(.*)', destination: '/index.html' });
  });
});
