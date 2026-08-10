/* ------------------------------------------------------------------ */
/*  Login rate limiter — atomic Lua contract                            */
/*                                                                     */
/*  The old limiter did a non-atomic GET -> mutate -> SET (two network  */
/*  round trips), letting concurrent requests overwrite each other's    */
/*  increments (lost updates). The replacement runs the whole           */
/*  read-modify-write in a single EVAL. On a real server Redis executes */
/*  one EVAL atomically (commands of a running script are not          */
/*  interleaved), so no increment can be lost and the TTL is set in the */
/*  same script that creates the key (no permanent keys).              */
/*                                                                     */
/*  No real Redis server is used in this file: `makeFakeEval` mirrors   */
/*  the steps of LOGIN_RATE_LIMIT_SCRIPT in JS so the limiter's         */
/*  algorithm can be exercised under many concurrent callers. That      */
/*  proves the middleware/script contract, not Redis's on-server        */
/*  serialization — production atomicity comes from Redis executing     */
/*  EVAL, which this test does not replicate.                          */
/* ------------------------------------------------------------------ */

jest.mock('../configs/redis', () => ({
  getRedisClient: jest.fn(),
}));

const express = require('express');
const request = require('supertest');

const { getRedisClient } = require('../configs/redis');
const {
  loginRateLimit,
  runLoginLimitCheck,
  LOGIN_RATE_LIMIT_SCRIPT,
} = require('../middlewares/loginRateLimitMiddleware');

// In-memory evaluator implementing the same steps as LOGIN_RATE_LIMIT_SCRIPT
// (GET existing -> early blocked -> INCR -> EXPIRE-on-count-1 -> PTTL), so the
// limiter's algorithm and contract can be exercised under many concurrent
// callers without a real Redis server. It is NOT a stand-in for Redis's
// execution model: atomicity in production comes from Redis running EVAL.
const makeFakeEval = (ttlSeconds) => {
  const store = new Map(); // key -> { count, ttlMs }
  let increments = 0; // total INCR executions the fake has performed
  const evalFn = jest.fn(async (script, { keys, arguments: args }) => {
    const key = keys[0];
    const windowSec = Number(args[0]);
    const max = Number(args[1]);
    const entry = store.get(key);
    const existing = entry ? entry.count : 0;

    if (existing > max) {
      return [1, entry.ttlMs || windowSec * 1000];
    }

    increments += 1;
    const count = existing + 1;
    const ttlMs = count === 1 ? ttlSeconds * 1000 : entry.ttlMs;
    store.set(key, { count, ttlMs });

    if (count > max) {
      return [1, ttlMs];
    }

    return [0, count];
  });

  return { evalFn, store, increments: () => increments };
};

const makeReadyClient = (evalFn) => ({
  isOpen: true,
  isReady: true,
  eval: evalFn,
});

const buildApp = () => {
  const app = express();
  app.post('/api/auth/login', loginRateLimit, (req, res) => res.json({ ok: 'login' }));
  return app;
};

describe('loginRateLimit — Lua contract (no real Redis)', () => {
  it('script only sets the TTL when the key is first created', () => {
    expect(LOGIN_RATE_LIMIT_SCRIPT).toContain("redis.call('GET', KEYS[1])");
    expect(LOGIN_RATE_LIMIT_SCRIPT).toContain("redis.call('INCR', KEYS[1])");
    expect(LOGIN_RATE_LIMIT_SCRIPT).toContain('count == 1');
    expect(LOGIN_RATE_LIMIT_SCRIPT).toContain("redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))");
    expect(LOGIN_RATE_LIMIT_SCRIPT).toContain("redis.call('PTTL', KEYS[1])");
  });

  it('allows 20 attempts, trips on the 21st, and does not count calls while blocked', async () => {
    const { evalFn, store } = makeFakeEval(900);
    const client = makeReadyClient(evalFn);
    const key = 'ratelimit:login:ip:1.2.3.4';

    let allowed = 0;
    let blocked = 0;
    for (let i = 1; i <= 22; i++) {
      const outcome = await runLoginLimitCheck(client, key);
      if (outcome.blocked) {
        blocked++;
        expect(outcome.attempts).toBeNull();
        expect(outcome.retryAfterSeconds).toBeGreaterThan(0);
        expect(outcome.retryAfterSeconds).toBeLessThanOrEqual(900);
      } else {
        allowed++;
        expect(outcome.attempts).toBe(i);
      }
    }

    expect(allowed).toBe(20);
    expect(blocked).toBe(2); // the 21st and 22nd attempts
    expect(store.get(key).count).toBe(21); // blocked calls never incremented
    expect(evalFn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ keys: [key] }));
  });

  it('keeps different client IPs on independent counters', async () => {
    const { evalFn, store } = makeFakeEval(900);
    const client = makeReadyClient(evalFn);

    await runLoginLimitCheck(client, 'ratelimit:login:ip:1.2.3.4');
    await runLoginLimitCheck(client, 'ratelimit:login:ip:1.2.3.4');
    await runLoginLimitCheck(client, 'ratelimit:login:ip:5.6.7.8');

    expect(store.get('ratelimit:login:ip:1.2.3.4').count).toBe(2);
    expect(store.get('ratelimit:login:ip:5.6.7.8').count).toBe(1);
  });

  it('concurrent callers observe the exact serialized contract (20 allowed, then blocked)', async () => {
    const { evalFn, store, increments } = makeFakeEval(900);
    const client = makeReadyClient(evalFn);
    const key = 'ratelimit:login:ip:10.0.0.1';

    const outcomes = await Promise.all(
      Array.from({ length: 500 }, () => runLoginLimitCheck(client, key)),
    );

    const allowed = outcomes.filter((o) => !o.blocked);
    const blocked = outcomes.filter((o) => o.blocked);
    const seen = allowed.map((o) => o.attempts);

    // This proves the ALGORITHM/CONTRACT under concurrent callers, not Redis
    // atomicity: every counter in the evaluator is advanced on the server side
    // of the mock eval, and the middleware never performs its own GET/SET, so
    // the run must produce exactly the canonical sequence. 20 callers were
    // allowed with unique attempt numbers 1..20, the 21st INCR tripped the
    // block, and every later caller was rejected without incrementing: 21
    // total INCRs, no lost or duplicated increments in the observable results.
    expect(store.get(key).count).toBe(21);
    expect(increments()).toBe(21);
    expect([...seen].sort((a, b) => a - b)).toEqual([...Array(20)].map((_, i) => i + 1));
    expect(allowed).toHaveLength(20);
    expect(blocked).toHaveLength(480);
    blocked.forEach((o) => expect(o.retryAfterSeconds).toBeGreaterThan(0));
  });
});

describe('loginRateLimit — middleware behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fails open when there is no Redis client', async () => {
    getRedisClient.mockReturnValue(null);
    const app = buildApp();

    for (let i = 0; i < 25; i++) {
      const res = await request(app).post('/api/auth/login').send({});
      expect(res.status).toBe(200);
    }
  });

  it('fails open when the client is open but not ready, issuing no Redis command', async () => {
    const evalFn = jest.fn();
    getRedisClient.mockReturnValue({ isOpen: true, isReady: false, eval: evalFn });
    const app = buildApp();

    for (let i = 0; i < 5; i++) {
      const res = await request(app).post('/api/auth/login').send({});
      expect(res.status).toBe(200);
    }
    expect(evalFn).not.toHaveBeenCalled();
  });

  it('allows 20 attempts then returns 429 with Retry-After and TOO_MANY_REQUESTS', async () => {
    const { evalFn, store } = makeFakeEval(900);
    getRedisClient.mockReturnValue(makeReadyClient(evalFn));
    const app = buildApp();

    for (let i = 1; i <= 20; i++) {
      const res = await request(app).post('/api/auth/login').send({});
      expect(res.status).toBe(200);
    }

    const blocked = await request(app).post('/api/auth/login').send({});
    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toBe('900');
    expect(blocked.body).toEqual({
      success: false,
      error: { code: 'TOO_MANY_REQUESTS', message: 'Ban da vuot qua gioi han dang nhap. Vui long thu lai sau.' },
    });

    const evalCall = evalFn.mock.calls[0];
    expect(evalCall[0]).toBe(LOGIN_RATE_LIMIT_SCRIPT);
    expect(evalCall[1].keys[0]).toMatch(/^ratelimit:login:ip:/);
    expect(evalCall[1].arguments[1]).toBe('20');
    expect(store.get(Array.from(store.keys())[0]).count).toBe(21);
  });

  it('reports the remaining window as Retry-After while already blocked', async () => {
    const evalFn = jest.fn().mockResolvedValue([1, 300000]);
    getRedisClient.mockReturnValue(makeReadyClient(evalFn));
    const app = buildApp();

    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBe('300');
    expect(res.body.error.code).toBe('TOO_MANY_REQUESTS');
  });

  it('fails open and never leaks the raw Redis error when eval rejects', async () => {
    const evalFn = jest.fn().mockRejectedValue(new Error('script error'));
    getRedisClient.mockReturnValue(makeReadyClient(evalFn));
    const app = buildApp();

    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('script error');
  });
});