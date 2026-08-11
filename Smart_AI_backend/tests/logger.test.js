describe('logger test-safe mode', () => {
  const TRANSPORT_SYMBOL = Symbol.for('pino.transport');

  afterEach(() => {
    jest.resetModules();
    jest.dontMock('pino');
  });

  it('does not create a worker transport under NODE_ENV=test', () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';

    const logger = require('../utils/logger');
    expect(logger[TRANSPORT_SYMBOL]).toBeUndefined();

    if (original) process.env.NODE_ENV = original;
    else delete process.env.NODE_ENV;
  });

  it('does not create a worker transport under JEST_WORKER_ID', () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    process.env.JEST_WORKER_ID = '1';

    const logger = require('../utils/logger');
    expect(logger[TRANSPORT_SYMBOL]).toBeUndefined();

    if (original) process.env.NODE_ENV = original;
    else delete process.env.NODE_ENV;
    delete process.env.JEST_WORKER_ID;
  });

  it('logs structured JSON to stdout under test mode', () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';

    const writeSpy = jest.spyOn(process.stdout, 'write');
    const logger = require('../utils/logger');
    logger.info({ marker: 'logger-test-mode' }, 'hello');

    const line = writeSpy.mock.calls.map((c) => c[0].toString()).find((s) => s.includes('logger-test-mode'));
    expect(line).toBeDefined();
    const parsed = JSON.parse(line);
    expect(parsed.msg).toBe('hello');
    expect(parsed.marker).toBe('logger-test-mode');

    writeSpy.mockRestore();
    if (original) process.env.NODE_ENV = original;
    else delete process.env.NODE_ENV;
  });

  it('redacts cookie, set-cookie, and verification/reset/unlock tokens', () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';

    const writeSpy = jest.spyOn(process.stdout, 'write');
    const logger = require('../utils/logger');
    logger.info({
      marker: 'redaction-check',
      cookie: 'sid=abc123',
      setCookie: 'sid=abc123',
      emailVerificationToken: 'verify-token-value',
      passwordResetToken: 'reset-token-value',
      unlockToken: 'unlock-token-value',
    }, 'redact me');

    const line = writeSpy.mock.calls.map((c) => c[0].toString()).find((s) => s.includes('redaction-check'));
    const parsed = JSON.parse(line);
    expect(parsed.cookie).toBe('[REDACTED]');
    expect(parsed.setCookie).toBe('[REDACTED]');
    expect(parsed.emailVerificationToken).toBe('[REDACTED]');
    expect(parsed.passwordResetToken).toBe('[REDACTED]');
    expect(parsed.unlockToken).toBe('[REDACTED]');

    writeSpy.mockRestore();
    if (original) process.env.NODE_ENV = original;
    else delete process.env.NODE_ENV;
  });

  it('redacts API key env-style fields', () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';

    const writeSpy = jest.spyOn(process.stdout, 'write');
    const logger = require('../utils/logger');
    logger.info({
      marker: 'key-check',
      OPENAI_API_KEY: 'sk-123456',
      BREVO_API_KEY: 'brevo-123456',
      GOOGLE_CLIENT_SECRET: 'google-secret-value',
    }, 'keys');

    const line = writeSpy.mock.calls.map((c) => c[0].toString()).find((s) => s.includes('key-check'));
    const parsed = JSON.parse(line);
    expect(parsed.OPENAI_API_KEY).toBe('[REDACTED]');
    expect(parsed.BREVO_API_KEY).toBe('[REDACTED]');
    expect(parsed.GOOGLE_CLIENT_SECRET).toBe('[REDACTED]');

    writeSpy.mockRestore();
    if (original) process.env.NODE_ENV = original;
    else delete process.env.NODE_ENV;
  });

  it('redacts authorization header in nested request objects', () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';

    const writeSpy = jest.spyOn(process.stdout, 'write');
    const logger = require('../utils/logger');
    logger.info({
      marker: 'req-check',
      req: { headers: { authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.abc' } },
    }, 'req');

    const line = writeSpy.mock.calls.map((c) => c[0].toString()).find((s) => s.includes('req-check'));
    const parsed = JSON.parse(line);
    expect(parsed.req.headers.authorization).toBe('[REDACTED]');

    writeSpy.mockRestore();
    if (original) process.env.NODE_ENV = original;
    else delete process.env.NODE_ENV;
  });

  it('keeps pre-existing redaction for token/password/credential/apiKey', () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';

    const writeSpy = jest.spyOn(process.stdout, 'write');
    const logger = require('../utils/logger');
    logger.info({
      marker: 'legacy-redaction',
      token: 'abc',
      password: 'secret',
      credential: 'google-jwt',
      apiKey: 'sk-key',
    }, 'legacy');

    const line = writeSpy.mock.calls.map((c) => c[0].toString()).find((s) => s.includes('legacy-redaction'));
    const parsed = JSON.parse(line);
    expect(parsed.token).toBe('[REDACTED]');
    expect(parsed.password).toBe('[REDACTED]');
    expect(parsed.credential).toBe('[REDACTED]');
    expect(parsed.apiKey).toBe('[REDACTED]');

    writeSpy.mockRestore();
    if (original) process.env.NODE_ENV = original;
    else delete process.env.NODE_ENV;
  });
});
