const express = require('express');
const request = require('supertest');
const cors = require('cors');

const PRODUCTION_ORIGIN = 'https://smart-ai-six-liard.vercel.app';

function buildApp(corsOrigin = PRODUCTION_ORIGIN) {
  const app = express();
  app.use(cors({
    origin: corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'Idempotency-Key'],
  }));
  app.get('/api/orders', (_req, res) => res.json({ ok: true }));
  return app;
}

describe('CORS — Idempotency-Key header preflight', () => {
  it('OPTIONS /api/orders from production origin accepts Idempotency-Key', async () => {
    const app = buildApp();
    const res = await request(app)
      .options('/api/orders')
      .set('Origin', PRODUCTION_ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'idempotency-key');

    const allowed = res.headers['access-control-allow-headers'] || '';
    expect(allowed.split(/,\s*/).map(h => h.toLowerCase())).toContain('idempotency-key');
    expect(res.status).toBe(204);
  });

  it('OPTIONS /api/orders from production origin still accepts existing headers', async () => {
    const app = buildApp();
    const res = await request(app)
      .options('/api/orders')
      .set('Origin', PRODUCTION_ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type, authorization, x-request-id');

    const allowed = res.headers['access-control-allow-headers'] || '';
    expect(allowed.split(/,\s*/).map(h => h.toLowerCase())).toContain('content-type');
    expect(allowed.split(/,\s*/).map(h => h.toLowerCase())).toContain('authorization');
    expect(allowed.split(/,\s*/).map(h => h.toLowerCase())).toContain('x-request-id');
  });

  it('OPTIONS /api/orders from unauthorized origin does not reflect that origin', async () => {
    const app = buildApp();
    const res = await request(app)
      .options('/api/orders')
      .set('Origin', 'https://evil.example.com')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'idempotency-key');

    const acao = res.headers['access-control-allow-origin'];
    expect(acao).toBe(PRODUCTION_ORIGIN);
    expect(acao).not.toBe('https://evil.example.com');
    expect(acao).not.toBe('*');
  });

  it('GET /api/orders from production origin succeeds with Idempotency-Key header', async () => {
    const app = buildApp();
    const res = await request(app)
      .get('/api/orders')
      .set('Origin', PRODUCTION_ORIGIN)
      .set('Idempotency-Key', 'test-key');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(PRODUCTION_ORIGIN);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('GET /api/orders from unauthorized origin sets ACAO to configured origin, not request origin', async () => {
    const app = buildApp();
    const res = await request(app)
      .get('/api/orders')
      .set('Origin', 'https://evil.example.com');

    expect(res.headers['access-control-allow-origin']).toBe(PRODUCTION_ORIGIN);
    expect(res.headers['access-control-allow-origin']).not.toBe('https://evil.example.com');
    expect(res.headers['access-control-allow-origin']).not.toBe('*');
  });

  it('OPTIONS /api/orders with all three old + new headers passes', async () => {
    const app = buildApp();
    const res = await request(app)
      .options('/api/orders')
      .set('Origin', PRODUCTION_ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type, authorization, x-request-id, idempotency-key');

    const allowed = (res.headers['access-control-allow-headers'] || '').split(/,\s*/).map(h => h.toLowerCase());
    expect(allowed).toContain('idempotency-key');
    expect(allowed).toContain('content-type');
    expect(allowed).toContain('authorization');
    expect(allowed).toContain('x-request-id');
    expect(res.status).toBe(204);
  });
});
