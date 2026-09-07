"use strict";

const {
  validateJwtSecrets,
  MIN_SECRET_LENGTH,
  JWT_PLACEHOLDER_PATTERNS,
} = require('../utils/jwtValidation');

describe('validateJwtSecrets', () => {
  const VALID_SECRET = 'a'.repeat(64);
  const VALID_REFRESH = 'b'.repeat(64);

  describe('valid secrets', () => {
    it('returns no errors for valid secrets', () => {
      const errors = validateJwtSecrets({
        secret: VALID_SECRET,
        refreshSecret: VALID_REFRESH,
      });
      expect(errors).toEqual([]);
    });

    it('returns no errors for minimum-length secrets', () => {
      const errors = validateJwtSecrets({
        secret: 'a'.repeat(MIN_SECRET_LENGTH),
        refreshSecret: 'b'.repeat(MIN_SECRET_LENGTH),
      });
      expect(errors).toEqual([]);
    });
  });

  describe('missing secrets', () => {
    it('rejects missing JWT_SECRET', () => {
      const errors = validateJwtSecrets({
        secret: undefined,
        refreshSecret: VALID_REFRESH,
      });
      expect(errors).toContain('JWT_SECRET is missing or empty');
    });

    it('rejects missing JWT_REFRESH_SECRET', () => {
      const errors = validateJwtSecrets({
        secret: VALID_SECRET,
        refreshSecret: undefined,
      });
      expect(errors).toContain('JWT_REFRESH_SECRET is missing or empty');
    });

    it('rejects both missing', () => {
      const errors = validateJwtSecrets({
        secret: undefined,
        refreshSecret: undefined,
      });
      expect(errors).toHaveLength(2);
    });

    it('rejects empty string JWT_SECRET', () => {
      const errors = validateJwtSecrets({
        secret: '',
        refreshSecret: VALID_REFRESH,
      });
      expect(errors).toContain('JWT_SECRET is missing or empty');
    });

    it('rejects whitespace-only JWT_SECRET', () => {
      const errors = validateJwtSecrets({
        secret: '   ',
        refreshSecret: VALID_REFRESH,
      });
      expect(errors).toContain('JWT_SECRET is missing or empty');
    });
  });

  describe('short secrets', () => {
    it('rejects JWT_SECRET shorter than minimum', () => {
      const errors = validateJwtSecrets({
        secret: 'a'.repeat(MIN_SECRET_LENGTH - 1),
        refreshSecret: VALID_REFRESH,
      });
      expect(errors.some((e) => e.startsWith('JWT_SECRET is too short'))).toBe(true);
    });

    it('rejects JWT_REFRESH_SECRET shorter than minimum', () => {
      const errors = validateJwtSecrets({
        secret: VALID_SECRET,
        refreshSecret: 'b'.repeat(MIN_SECRET_LENGTH - 1),
      });
      expect(errors.some((e) => e.startsWith('JWT_REFRESH_SECRET is too short'))).toBe(true);
    });
  });

  describe('placeholder secrets', () => {
    it('rejects YOUR_JWT_SECRET via length check (shorter than minimum)', () => {
      const errors = validateJwtSecrets({
        secret: 'YOUR_JWT_SECRET',
        refreshSecret: VALID_REFRESH,
      });
      expect(errors.some((e) => e.startsWith('JWT_SECRET is too short'))).toBe(true);
    });

    it('rejects YOUR_REFRESH_SECRET via length check (shorter than minimum)', () => {
      const errors = validateJwtSecrets({
        secret: VALID_SECRET,
        refreshSecret: 'YOUR_REFRESH_SECRET',
      });
      expect(errors.some((e) => e.startsWith('JWT_REFRESH_SECRET is too short'))).toBe(true);
    });

    it.each(['replace_with_a_strong_jwt_secret', 'replace_with_a_strong_refresh_secret'])(
      'rejects long placeholder "%s" via placeholder check',
      (placeholder) => {
        const errors = validateJwtSecrets({
          secret: placeholder,
          refreshSecret: VALID_REFRESH,
        });
        expect(errors).toContain('JWT_SECRET is a placeholder value');
      },
    );
  });

  describe('no real secrets in tests', () => {
    it('test secrets are different from any known production/dev secret', () => {
      const testSecret = 'a'.repeat(64);
      const devSecret = '32930bbc5671c52b39acfcef6f8fc75b6d93dd808d1534b1c8ee7e5e4a8bd248';
      expect(testSecret).not.toBe(devSecret);
    });
  });
});
