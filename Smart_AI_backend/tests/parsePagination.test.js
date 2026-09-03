const parsePagination = require('../utils/parsePagination');
const { parsePage, parseLimit, DEFAULT_PAGE, DEFAULT_LIMIT, MAX_LIMIT } = parsePagination;

describe('parsePagination', () => {
  describe('parsePage', () => {
    test('returns default for missing value', () => {
      expect(parsePage(undefined)).toBe(DEFAULT_PAGE);
      expect(parsePage(null)).toBe(DEFAULT_PAGE);
      expect(parsePage('')).toBe(DEFAULT_PAGE);
    });

    test('returns 1 for "1"', () => {
      expect(parsePage('1')).toBe(1);
    });

    test('returns 2 for "2"', () => {
      expect(parsePage('2')).toBe(2);
    });

    test('returns default for "0"', () => {
      expect(parsePage('0')).toBe(DEFAULT_PAGE);
    });

    test('returns default for "-1"', () => {
      expect(parsePage('-1')).toBe(DEFAULT_PAGE);
    });

    test('returns default for "abc"', () => {
      expect(parsePage('abc')).toBe(DEFAULT_PAGE);
    });

    test('returns default for "1.5"', () => {
      expect(parsePage('1.5')).toBe(DEFAULT_PAGE);
    });

    test('returns default for "10abc" (partial parse)', () => {
      expect(parsePage('10abc')).toBe(DEFAULT_PAGE);
    });

    test('returns large integer as-is (no max cap)', () => {
      expect(parsePage('999999')).toBe(999999);
    });

    test('returns default for Infinity', () => {
      expect(parsePage('Infinity')).toBe(DEFAULT_PAGE);
    });

    test('returns default for -Infinity', () => {
      expect(parsePage('-Infinity')).toBe(DEFAULT_PAGE);
    });

    test('handles numeric input (not string)', () => {
      expect(parsePage(2)).toBe(2);
      expect(parsePage(0)).toBe(DEFAULT_PAGE);
      expect(parsePage(-1)).toBe(DEFAULT_PAGE);
      expect(parsePage(1.5)).toBe(DEFAULT_PAGE);
    });
  });

  describe('parseLimit', () => {
    test('returns default for missing value', () => {
      expect(parseLimit(undefined)).toBe(DEFAULT_LIMIT);
      expect(parseLimit(null)).toBe(DEFAULT_LIMIT);
      expect(parseLimit('')).toBe(DEFAULT_LIMIT);
    });

    test('returns 10 for "10"', () => {
      expect(parseLimit('10')).toBe(10);
    });

    test('clamps to MAX_LIMIT for large values', () => {
      expect(parseLimit('100')).toBe(MAX_LIMIT);
      expect(parseLimit('999')).toBe(MAX_LIMIT);
    });

    test('returns default for "0"', () => {
      expect(parseLimit('0')).toBe(DEFAULT_LIMIT);
    });

    test('returns default for "-1"', () => {
      expect(parseLimit('-1')).toBe(DEFAULT_LIMIT);
    });

    test('returns default for "abc"', () => {
      expect(parseLimit('abc')).toBe(DEFAULT_LIMIT);
    });

    test('returns default for "1.5"', () => {
      expect(parseLimit('1.5')).toBe(DEFAULT_LIMIT);
    });

    test('returns default for "10abc" (partial parse)', () => {
      expect(parseLimit('10abc')).toBe(DEFAULT_LIMIT);
    });

    test('returns MAX_LIMIT for "50"', () => {
      expect(parseLimit('50')).toBe(MAX_LIMIT);
    });

    test('returns default for Infinity', () => {
      expect(parseLimit('Infinity')).toBe(DEFAULT_LIMIT);
    });

    test('returns default for -Infinity', () => {
      expect(parseLimit('-Infinity')).toBe(DEFAULT_LIMIT);
    });

    test('handles numeric input (not string)', () => {
      expect(parseLimit(10)).toBe(10);
      expect(parseLimit(0)).toBe(DEFAULT_LIMIT);
      expect(parseLimit(-1)).toBe(DEFAULT_LIMIT);
      expect(parseLimit(1.5)).toBe(DEFAULT_LIMIT);
      expect(parseLimit(100)).toBe(MAX_LIMIT);
    });
  });

  describe('parsePagination (full)', () => {
    test('returns defaults for empty query', () => {
      const result = parsePagination({});
      expect(result).toEqual({
        page: DEFAULT_PAGE,
        limit: DEFAULT_LIMIT,
        skip: 0
      });
    });

    test('returns defaults for undefined query', () => {
      const result = parsePagination();
      expect(result).toEqual({
        page: DEFAULT_PAGE,
        limit: DEFAULT_LIMIT,
        skip: 0
      });
    });

    test('computes correct skip for page 2, limit 10', () => {
      const result = parsePagination({ page: '2', limit: '10' });
      expect(result).toEqual({ page: 2, limit: 10, skip: 10 });
    });

    test('computes correct skip for page 3, limit 20', () => {
      const result = parsePagination({ page: '3', limit: '20' });
      expect(result).toEqual({ page: 3, limit: 20, skip: 40 });
    });

    test('computes skip = 0 for page 1', () => {
      const result = parsePagination({ page: '1', limit: '10' });
      expect(result.skip).toBe(0);
    });

    test('clamps limit to MAX_LIMIT', () => {
      const result = parsePagination({ page: '1', limit: '200' });
      expect(result.limit).toBe(MAX_LIMIT);
    });

    test('normalizes invalid page to default', () => {
      const result = parsePagination({ page: '-5', limit: '10' });
      expect(result.page).toBe(DEFAULT_PAGE);
      expect(result.skip).toBe(0);
    });

    test('normalizes invalid limit to default', () => {
      const result = parsePagination({ page: '1', limit: 'abc' });
      expect(result.limit).toBe(DEFAULT_LIMIT);
    });

    test('never produces negative skip', () => {
      const result = parsePagination({ page: '-10', limit: '-5' });
      expect(result.skip).toBeGreaterThanOrEqual(0);
      expect(result.page).toBeGreaterThanOrEqual(1);
      expect(result.limit).toBeGreaterThanOrEqual(1);
    });

    test('never produces NaN skip', () => {
      const result = parsePagination({ page: 'abc', limit: 'xyz' });
      expect(Number.isFinite(result.skip)).toBe(true);
      expect(result.skip).toBe(0);
    });

    test('never produces zero limit', () => {
      const result = parsePagination({ page: '1', limit: '0' });
      expect(result.limit).toBeGreaterThanOrEqual(1);
    });

    test('never produces unbounded limit', () => {
      const result = parsePagination({ page: '1', limit: '999999999' });
      expect(result.limit).toBeLessThanOrEqual(MAX_LIMIT);
    });
  });
});
