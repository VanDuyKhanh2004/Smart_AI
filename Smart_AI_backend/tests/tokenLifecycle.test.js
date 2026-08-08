"use strict";

const { hashToken } = require('../utils/tokenHash');

const HOUR = 60 * 60 * 1000;

describe('hashToken', () => {
  it('returns a 64-character lowercase hex digest', () => {
    const digest = hashToken('abc');
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic for the same raw token', () => {
    expect(hashToken('same-token')).toBe(hashToken('same-token'));
  });

  it('differs for different raw tokens', () => {
    expect(hashToken('token-a')).not.toBe(hashToken('token-b'));
  });

  it('never stores the raw token in plain text', () => {
    expect(hashToken('super-secret-token')).not.toContain('super-secret-token');
  });

  it('differentiates raw tokens whose hash shares the same length', () => {
    const a = hashToken('b'.repeat(64));
    const b = hashToken('c'.repeat(64));
    expect(a).not.toBe(b);
    expect(hashToken('b'.repeat(64))).toBe(a);
  });
});

describe('tokenConfig', () => {
  const ORIG_ENV = process.env;

  afterEach(() => {
    process.env = { ...ORIG_ENV };
    jest.resetModules();
  });

  it('defaults email verification TTL to 24 hours', () => {
    delete process.env.EMAIL_VERIFICATION_TOKEN_TTL_HOURS;
    jest.resetModules();
    const cfg = require('../configs/tokenConfig');
    expect(cfg.EMAIL_VERIFICATION_TOKEN_TTL_MS).toBe(24 * HOUR);
  });

  it('honours the email verification TTL env override', () => {
    process.env.EMAIL_VERIFICATION_TOKEN_TTL_HOURS = '48';
    jest.resetModules();
    const cfg = require('../configs/tokenConfig');
    expect(cfg.EMAIL_VERIFICATION_TOKEN_TTL_MS).toBe(48 * HOUR);
  });

  it('defaults password-reset and unlock TTLs to 1 hour', () => {
    jest.resetModules();
    const cfg = require('../configs/tokenConfig');
    expect(cfg.PASSWORD_RESET_TOKEN_TTL_MS).toBe(HOUR);
    expect(cfg.UNLOCK_TOKEN_TTL_MS).toBe(HOUR);
  });
});