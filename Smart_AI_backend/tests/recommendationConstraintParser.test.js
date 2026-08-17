const {
  parseRecommendationConstraints,
  normalize,
  extractInteger,
  amountFromMatch,
  findBrand,
  parseBudget,
  findPriorities,
} = require('../utils/recommendationConstraintParser');

const EMPTY = { budgetMin: null, budgetMax: null, brand: null, priorities: [] };

describe('parseRecommendationConstraints — empty / null / malformed input', () => {
  it('null input returns empty constraint object', () => {
    expect(parseRecommendationConstraints(null)).toEqual(EMPTY);
  });

  it('undefined input returns empty constraint object', () => {
    expect(parseRecommendationConstraints(undefined)).toEqual(EMPTY);
  });

  it('empty string returns empty constraint object', () => {
    expect(parseRecommendationConstraints('')).toEqual(EMPTY);
  });

  it('whitespace-only string returns empty constraint object', () => {
    expect(parseRecommendationConstraints('   ')).toEqual(EMPTY);
  });

  it('non-string input returns empty constraint object', () => {
    expect(parseRecommendationConstraints(42)).toEqual(EMPTY);
    expect(parseRecommendationConstraints({})).toEqual(EMPTY);
    expect(parseRecommendationConstraints([])).toEqual(EMPTY);
  });

  it('does not crash on unusual input', () => {
    expect(() => parseRecommendationConstraints('!!!@@@$$$')).not.toThrow();
    expect(() => parseRecommendationConstraints('<>?/:{}[]')).not.toThrow();
    expect(() => parseRecommendationConstraints('--- --- ...')).not.toThrow();
  });
});

describe('parseRecommendationConstraints — normalization', () => {
  it('is case-insensitive', () => {
    const lower = parseRecommendationConstraints('samsung dưới 15 triệu');
    const upper = parseRecommendationConstraints('SAMSUNG DƯỚI 15 TRIỆU');
    expect(upper).toEqual(lower);
  });

  it('collapses repeated whitespace', () => {
    const result = parseRecommendationConstraints('Samsung   dưới    15   triệu');
    expect(result.brand).toBe('samsung');
    expect(result.budgetMax).toBe(15_000_000);
  });

  it('trims leading/trailing whitespace', () => {
    const result = parseRecommendationConstraints('  pin trâu  ');
    expect(result.priorities).toEqual(['battery']);
  });

  it('normalize() lowercases, collapses whitespace and trims', () => {
    expect(normalize('  SAM SUNG   DƯỚI  ')).toBe('sam sung dưới');
    expect(normalize('')).toBe('');
  });
});

describe('parseRecommendationConstraints — brands', () => {
  it('iPhone maps to apple', () => {
    expect(parseRecommendationConstraints('iPhone dưới 20 triệu').brand).toBe('apple');
  });

  it('Apple maps to apple', () => {
    expect(parseRecommendationConstraints('Apple khoảng 20 triệu').brand).toBe('apple');
  });

  it('Samsung maps to samsung', () => {
    expect(parseRecommendationConstraints('Samsung dưới 15 triệu').brand).toBe('samsung');
  });

  it('Xiaomi maps to xiaomi', () => {
    expect(parseRecommendationConstraints('Xiaomi tầm 15 triệu').brand).toBe('xiaomi');
  });

  it('Redmi alias maps to xiaomi', () => {
    expect(parseRecommendationConstraints('Redmi dưới 10 triệu').brand).toBe('xiaomi');
  });

  it('OPPO maps to oppo', () => {
    expect(parseRecommendationConstraints('OPPO chụp ảnh đẹp').brand).toBe('oppo');
  });

  it('OnePlus maps to oneplus', () => {
    expect(parseRecommendationConstraints('OnePlus khoảng 20 triệu').brand).toBe('oneplus');
  });

  it('Google Pixel maps to google', () => {
    expect(parseRecommendationConstraints('Google Pixel dưới 15 triệu').brand).toBe('google');
  });

  it('Pixel alias maps to google', () => {
    expect(parseRecommendationConstraints('Pixel tầm 15 triệu').brand).toBe('google');
  });

  it('Google alone maps to google', () => {
    expect(parseRecommendationConstraints('Google dưới 15 triệu').brand).toBe('google');
  });

  it('no brand present returns null', () => {
    expect(parseRecommendationConstraints('điện thoại pin trâu').brand).toBeNull();
  });

  it('does not match brand inside a longer word', () => {
    // "pixel" inside "pixels" should not match google
    expect(parseRecommendationConstraints('sản phẩm pixels của họ').brand).toBeNull();
  });
});

describe('parseRecommendationConstraints — budget expressions', () => {
  it('dưới 20 triệu → budgetMax 20,000,000', () => {
    const r = parseRecommendationConstraints('điện thoại dưới 20 triệu');
    expect(r.budgetMax).toBe(20_000_000);
    expect(r.budgetMin).toBeNull();
  });

  it('dưới 20tr → budgetMax 20,000,000', () => {
    expect(parseRecommendationConstraints('dưới 20tr').budgetMax).toBe(20_000_000);
  });

  it('dưới 20 triệu đồng → budgetMax 20,000,000', () => {
    expect(parseRecommendationConstraints('dưới 20 triệu đồng').budgetMax).toBe(20_000_000);
  });

  it('tối đa 20 triệu → budgetMax 20,000,000', () => {
    expect(parseRecommendationConstraints('tối đa 20 triệu').budgetMax).toBe(20_000_000);
  });

  it('khoảng 20 triệu → budgetMax 20,000,000', () => {
    expect(parseRecommendationConstraints('khoảng 20 triệu').budgetMax).toBe(20_000_000);
  });

  it('tầm 20 triệu → budgetMax 20,000,000', () => {
    expect(parseRecommendationConstraints('tầm 20 triệu').budgetMax).toBe(20_000_000);
  });

  it('dưới 15.000.000 → budgetMax 15,000,000', () => {
    expect(parseRecommendationConstraints('dưới 15.000.000').budgetMax).toBe(15_000_000);
  });

  it('dưới 15000000 → budgetMax 15,000,000', () => {
    expect(parseRecommendationConstraints('dưới 15000000').budgetMax).toBe(15_000_000);
  });

  it('15 triệu → 15,000,000 (unit conversion)', () => {
    expect(amountFromMatch('15', 'triệu')).toBe(15_000_000);
  });

  it('20tr → 20,000,000 (unit conversion)', () => {
    expect(amountFromMatch('20', 'tr')).toBe(20_000_000);
  });

  it('triệu đồng unit conversion', () => {
    expect(amountFromMatch('20', 'triệu đồng')).toBe(20_000_000);
  });

  it('no unit → value passes through', () => {
    expect(amountFromMatch('15000000', '')).toBe(15_000_000);
  });

  it('extractInteger strips separators', () => {
    expect(extractInteger('15.000.000')).toBe(15_000_000);
    expect(extractInteger('15000000')).toBe(15_000_000);
    expect(extractInteger('20')).toBe(20);
  });

  it('malformed budget does not crash and yields null', () => {
    const r = parseRecommendationConstraints('dưới triệu');
    expect(r.budgetMax).toBeNull();
    expect(r.budgetMin).toBeNull();
  });

  it('budget keyword without number yields null', () => {
    expect(parseRecommendationConstraints('khoảng').budgetMax).toBeNull();
  });
});

describe('parseRecommendationConstraints — priorities', () => {
  it('pin trâu → battery', () => {
    expect(parseRecommendationConstraints('pin trâu').priorities).toEqual(['battery']);
  });

  it('pin tốt → battery', () => {
    expect(parseRecommendationConstraints('pin tốt').priorities).toEqual(['battery']);
  });

  it('pin lâu → battery', () => {
    expect(parseRecommendationConstraints('pin lâu').priorities).toEqual(['battery']);
  });

  it('pin khỏe → battery', () => {
    expect(parseRecommendationConstraints('pin khỏe').priorities).toEqual(['battery']);
  });

  it('thời lượng pin → battery', () => {
    expect(parseRecommendationConstraints('thời lượng pin').priorities).toEqual(['battery']);
  });

  it('chụp ảnh → camera', () => {
    expect(parseRecommendationConstraints('chụp ảnh đẹp').priorities).toEqual(['camera']);
  });

  it('camera tốt → camera', () => {
    expect(parseRecommendationConstraints('camera tốt').priorities).toEqual(['camera']);
  });

  it('chụp hình → camera', () => {
    expect(parseRecommendationConstraints('chụp hình').priorities).toEqual(['camera']);
  });

  it('quay phim → camera', () => {
    expect(parseRecommendationConstraints('quay phim').priorities).toEqual(['camera']);
  });

  it('nhiếp ảnh → camera', () => {
    expect(parseRecommendationConstraints('nhiếp ảnh').priorities).toEqual(['camera']);
  });

  it('chơi game → gaming', () => {
    expect(parseRecommendationConstraints('chơi game').priorities).toEqual(['gaming']);
  });

  it('gaming → gaming', () => {
    expect(parseRecommendationConstraints('gaming').priorities).toEqual(['gaming']);
  });

  it('game → gaming', () => {
    expect(parseRecommendationConstraints('game').priorities).toEqual(['gaming']);
  });

  it('game mạnh → gaming', () => {
    expect(parseRecommendationConstraints('game mạnh').priorities).toEqual(['gaming']);
  });

  it('hiệu năng → performance', () => {
    expect(parseRecommendationConstraints('hiệu năng').priorities).toEqual(['performance']);
  });

  it('mạnh → performance', () => {
    expect(parseRecommendationConstraints('mạnh').priorities).toEqual(['performance']);
  });

  it('hiệu năng cao → performance', () => {
    expect(parseRecommendationConstraints('hiệu năng cao').priorities).toEqual(['performance']);
  });

  it('máy mạnh → performance', () => {
    expect(parseRecommendationConstraints('máy mạnh').priorities).toEqual(['performance']);
  });

  it('multiple priorities preserved in order', () => {
    expect(parseRecommendationConstraints('pin trâu, camera tốt').priorities).toEqual(['battery', 'camera']);
    expect(parseRecommendationConstraints('chơi game, pin trâu').priorities).toEqual(['gaming', 'battery']);
  });

  it('duplicate priority keywords do not duplicate', () => {
    expect(parseRecommendationConstraints('pin trâu, pin tốt').priorities).toEqual(['battery']);
    expect(parseRecommendationConstraints('chụp ảnh, camera tốt').priorities).toEqual(['camera']);
  });

  it('no priorities present returns empty array', () => {
    expect(parseRecommendationConstraints('điện thoại mới').priorities).toEqual([]);
  });

  it('findPriorities is deterministic', () => {
    expect(findPriorities('pin trâu chơi game pin lâu')).toEqual(['battery', 'gaming']);
  });
});

describe('parseRecommendationConstraints — combined constraints', () => {
  it('brand + budget', () => {
    const r = parseRecommendationConstraints('iPhone khoảng 20 triệu');
    expect(r).toEqual({ budgetMin: null, budgetMax: 20_000_000, brand: 'apple', priorities: [] });
  });

  it('brand + priorities', () => {
    const r = parseRecommendationConstraints('Samsung chụp ảnh đẹp');
    expect(r).toEqual({ budgetMin: null, budgetMax: null, brand: 'samsung', priorities: ['camera'] });
  });

  it('budget + priorities', () => {
    const r = parseRecommendationConstraints('dưới 15 triệu chơi game');
    expect(r).toEqual({ budgetMin: null, budgetMax: 15_000_000, brand: null, priorities: ['gaming'] });
  });

  it('brand + budget + priorities', () => {
    const r = parseRecommendationConstraints('Samsung dưới 15 triệu chụp ảnh đẹp');
    expect(r).toEqual({
      budgetMin: null,
      budgetMax: 15_000_000,
      brand: 'samsung',
      priorities: ['camera'],
    });
  });

  it('full natural sentence with all three', () => {
    const r = parseRecommendationConstraints('Tôi muốn điện thoại dưới 20 triệu, pin trâu, chơi game');
    expect(r).toEqual({
      budgetMin: null,
      budgetMax: 20_000_000,
      brand: null,
      priorities: ['battery', 'gaming'],
    });
  });

  it('range budget from X đến Y', () => {
    const r = parseRecommendationConstraints('từ 10 đến 20 triệu');
    expect(r.budgetMin).toBe(10_000_000);
    expect(r.budgetMax).toBe(20_000_000);
  });

  it('minimum budget expression (trên)', () => {
    const r = parseRecommendationConstraints('trên 10 triệu');
    expect(r.budgetMin).toBe(10_000_000);
    expect(r.budgetMax).toBeNull();
  });
});

describe('parseRecommendationConstraints — unrelated / robustness', () => {
  it('unrelated natural language returns empty constraints', () => {
    expect(parseRecommendationConstraints('Tôi muốn mua một chiếc điện thoại mới')).toEqual(EMPTY);
  });

  it('multiple constraints in one sentence', () => {
    const r = parseRecommendationConstraints('Tìm Samsung dưới 15 triệu, pin trâu, camera tốt, chơi game');
    expect(r.brand).toBe('samsung');
    expect(r.budgetMax).toBe(15_000_000);
    expect(r.priorities).toEqual(['battery', 'camera', 'gaming']);
  });

  it('budget + brand when brand precedes budget', () => {
    const r = parseRecommendationConstraints('Samsung dưới 15 triệu');
    expect(r.brand).toBe('samsung');
    expect(r.budgetMax).toBe(15_000_000);
  });

  it('budget + brand when budget precedes brand', () => {
    const r = parseRecommendationConstraints('dưới 15 triệu Samsung');
    expect(r.brand).toBe('samsung');
    expect(r.budgetMax).toBe(15_000_000);
  });

  it('repeated whitespace between budget parts', () => {
    expect(parseRecommendationConstraints('dưới   20   triệu').budgetMax).toBe(20_000_000);
  });

  it('standalone bare amount without keyword', () => {
    const r = parseRecommendationConstraints('điện thoại 20 triệu');
    expect(r.budgetMax).toBe(20_000_000);
  });

  it('output is deterministic across repeated calls', () => {
    const a = parseRecommendationConstraints('Samsung dưới 15 triệu chụp ảnh đẹp');
    const b = parseRecommendationConstraints('Samsung dưới 15 triệu chụp ảnh đẹp');
    expect(a).toEqual(b);
  });

  it('input string is not mutated', () => {
    const q = '  Samsung dưới 15 triệu  ';
    const copy = q.slice();
    parseRecommendationConstraints(q);
    expect(q).toBe(copy);
  });
});