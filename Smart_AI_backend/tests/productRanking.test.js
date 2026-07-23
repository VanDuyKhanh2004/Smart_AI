const {
  rankProducts,
  scoreProduct,
  buildRankingExplanation,
  extractProductSignals,
  scoreCamera,
  scoreBattery,
  scorePerformance,
  scoreCompact,
} = require('../utils/productRanking');

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const cameraPhone = {
  _id: 'cp1',
  name: 'Camera Pro',
  brand: 'samsung',
  price: 15_000_000,
  inStock: 3,
  isActive: true,
  specs: {
    camera: {
      rear: {
        primary: '200 MP',
        secondary: '12 MP ultrawide',
        tertiary: '12 MP telephoto',
      },
      front: '12 MP',
      features: ['OIS', 'Night mode', 'Portrait mode', '4K video', 'Optical zoom'],
    },
    memory: { ram: '8 GB', storage: '256 GB' },
    processor: { chipset: 'Snapdragon 8 Gen 3' },
    battery: { capacity: '5000 mAh', charging: { wired: '45W' } },
    screen: { size: '6.8 inch' },
    weight: '210 g',
  },
  description: 'Camera flagship',
};

const batteryPhone = {
  _id: 'bp1',
  name: 'Battery Beast',
  brand: 'xiaomi',
  price: 10_000_000,
  inStock: 5,
  isActive: true,
  specs: {
    camera: {
      rear: { primary: '64 MP' },
      front: '20 MP',
      features: ['Night mode'],
    },
    memory: { ram: '8 GB', storage: '128 GB' },
    processor: { chipset: 'Dimensity 8300' },
    battery: { capacity: '6000 mAh', charging: { wired: '67W', wireless: '50W' } },
    screen: { size: '6.7 inch' },
    weight: '205 g',
  },
  description: 'Battery flagship',
};

const performancePhone = {
  _id: 'pp1',
  name: 'Gaming Beast',
  brand: 'oneplus',
  price: 22_000_000,
  inStock: 2,
  isActive: true,
  specs: {
    camera: {
      rear: { primary: '50 MP' },
      front: '16 MP',
      features: ['Night mode'],
    },
    memory: { ram: '16 GB', storage: '512 GB' },
    processor: { chipset: 'Snapdragon 8 Gen 3', cpu: '8-core', gpu: 'Adreno 750' },
    battery: { capacity: '5500 mAh', charging: { wired: '100W', wireless: '50W' } },
    screen: { size: '6.8 inch', technology: 'AMOLED 120Hz' },
    weight: '225 g',
  },
  description: 'Gaming flagship',
};

const compactPhone = {
  _id: 'cop1',
  name: 'Mini Phone',
  brand: 'apple',
  price: 18_000_000,
  inStock: 4,
  isActive: true,
  specs: {
    camera: {
      rear: { primary: '12 MP' },
      front: '8 MP',
      features: ['Portrait mode'],
    },
    memory: { ram: '6 GB', storage: '128 GB' },
    processor: { chipset: 'A16 Bionic' },
    battery: { capacity: '3200 mAh', charging: { wired: '20W', wireless: '15W' } },
    screen: { size: '5.4 inch' },
    weight: '140 g',
  },
  description: 'Compact phone',
};

const basicPhone = {
  _id: 'basic1',
  name: 'Budget Phone',
  brand: 'nokia',
  price: 2_000_000,
  inStock: 10,
  isActive: true,
  specs: {
    camera: { rear: { primary: '8 MP' }, front: '2 MP', features: [] },
    memory: { ram: '2 GB', storage: '32 GB' },
    battery: { capacity: '2500 mAh', charging: { wired: '10W' } },
    screen: { size: '5.0 inch' },
    weight: '160 g',
  },
  description: 'Budget phone',
};

const noSpecsPhone = {
  _id: 'nospec1',
  name: 'No Specs',
  brand: 'generic',
  price: 1_000_000,
  inStock: 5,
  isActive: true,
  specs: null,
  description: 'No specs',
};

/* ------------------------------------------------------------------ */
/*  Tests: Numeric parsing (via extractProductSignals)                 */
/* ------------------------------------------------------------------ */

describe('Signal extraction — numeric parsing', () => {

  it('parses camera MP from primary', () => {
    const s = extractProductSignals(cameraPhone);
    expect(s.camera.rearPrimaryMP).toBe(200);
  });

  it('parses battery mAh', () => {
    const s = extractProductSignals(batteryPhone);
    expect(s.battery.capacityMAh).toBe(6000);
  });

  it('parses charging watts', () => {
    const s = extractProductSignals(performancePhone);
    expect(s.battery.wiredWatts).toBe(100);
  });

  it('parses RAM GB', () => {
    const s = extractProductSignals(performancePhone);
    expect(s.performance.ramGB).toBe(16);
  });

  it('parses screen inches', () => {
    const s = extractProductSignals(compactPhone);
    expect(s.compact.screenSizeInches).toBe(5.4);
  });

  it('parses weight grams', () => {
    const s = extractProductSignals(compactPhone);
    expect(s.compact.weightGrams).toBe(140);
  });

  it('malformed/missing values return null safely — null specs', () => {
    const s = extractProductSignals(noSpecsPhone);
    expect(s.camera.rearPrimaryMP).toBeNull();
    expect(s.battery.capacityMAh).toBeNull();
    expect(s.performance.ramGB).toBeNull();
    expect(s.compact.screenSizeInches).toBeNull();
  });

  it('extractProductSignals returns null for non-object', () => {
    expect(extractProductSignals(null)).toBeNull();
    expect(extractProductSignals('string')).toBeNull();
    expect(extractProductSignals(undefined)).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: No-preference behavior                                      */
/* ------------------------------------------------------------------ */

describe('No-preference behavior', () => {
  const products = [cameraPhone, batteryPhone, performancePhone, compactPhone];
  const prefs = { camera: false, battery: false, performance: false, compact: false };

  it('preserves exact original order', () => {
    const { ranked } = rankProducts(products, prefs);
    expect(ranked.map(p => p._id)).toEqual(products.map(p => p._id));
  });

  it('does not mutate input array', () => {
    const original = products.map(p => ({ ...p }));
    rankProducts(products, prefs);
    expect(products.length).toBe(original.length);
  });

  it('does not mutate product objects', () => {
    const originalPrices = products.map(p => p.price);
    rankProducts(products, prefs);
    products.forEach((p, i) => {
      expect(p.price).toBe(originalPrices[i]);
    });
  });

  it('returns empty explanations', () => {
    const { explanations } = rankProducts(products, prefs);
    expect(explanations).toEqual([[], [], [], []]);
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: Camera ranking                                              */
/* ------------------------------------------------------------------ */

describe('Camera ranking', () => {

  it('ranks a product with richer camera signals above a weaker one', () => {
    const scoreHigh = scoreProduct(cameraPhone, { camera: true, battery: false, performance: false, compact: false });
    const scoreLow = scoreProduct(basicPhone, { camera: true, battery: false, performance: false, compact: false });
    expect(scoreHigh).toBeGreaterThan(scoreLow);
  });

  it('OIS/telephoto signals contribute without overriding every other field', () => {
    const scoreWithOIS = scoreCamera(extractProductSignals(cameraPhone));
    const scoreWithout = scoreCamera(extractProductSignals(basicPhone));
    expect(scoreWithOIS).toBeGreaterThan(scoreWithout);
  });

  it('missing camera specs do not crash', () => {
    const s = extractProductSignals(noSpecsPhone);
    const score = scoreCamera(s);
    expect(score).toBe(0);
  });

  it('scoreCamera returns 0 for null signals', () => {
    expect(scoreCamera(null)).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: Battery ranking                                             */
/* ------------------------------------------------------------------ */

describe('Battery ranking', () => {

  it('higher capacity and charging capability rank appropriately', () => {
    const scoreHigh = scoreProduct(batteryPhone, { camera: false, battery: true, performance: false, compact: false });
    const scoreLow = scoreProduct(basicPhone, { camera: false, battery: true, performance: false, compact: false });
    expect(scoreHigh).toBeGreaterThan(scoreLow);
  });

  it('missing battery values remain valid candidates', () => {
    const s = extractProductSignals(noSpecsPhone);
    const score = scoreBattery(s);
    expect(score).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: Performance ranking                                         */
/* ------------------------------------------------------------------ */

describe('Performance ranking', () => {

  it('higher RAM plus explicit chipset/CPU/GPU signals rank appropriately', () => {
    const scoreHigh = scoreProduct(performancePhone, { camera: false, battery: false, performance: true, compact: false });
    const scoreLow = scoreProduct(basicPhone, { camera: false, battery: false, performance: true, compact: false });
    expect(scoreHigh).toBeGreaterThan(scoreLow);
  });

  it('storage alone does not dominate performance', () => {
    const highStorageLowRAM = {
      ...basicPhone,
      specs: { ...basicPhone.specs, memory: { ram: '2 GB', storage: '1024 GB' } },
    };
    const lowStorageHighRAM = {
      ...basicPhone,
      specs: { ...basicPhone.specs, memory: { ram: '12 GB', storage: '64 GB' } },
    };
    const s1 = scoreProduct(highStorageLowRAM, { camera: false, battery: false, performance: true, compact: false });
    const s2 = scoreProduct(lowStorageHighRAM, { camera: false, battery: false, performance: true, compact: false });
    expect(s2).toBeGreaterThan(s1);
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: Compact ranking                                             */
/* ------------------------------------------------------------------ */

describe('Compact ranking', () => {

  it('smaller screen/lower weight ranks higher', () => {
    const scoreHigh = scoreProduct(compactPhone, { camera: false, battery: false, performance: false, compact: true });
    const scoreLow = scoreProduct(performancePhone, { camera: false, battery: false, performance: false, compact: true });
    expect(scoreHigh).toBeGreaterThan(scoreLow);
  });

  it('missing weight/dimensions do not crash', () => {
    const s = extractProductSignals(noSpecsPhone);
    const score = scoreCompact(s);
    expect(score).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: Multiple preferences                                        */
/* ------------------------------------------------------------------ */

describe('Multiple preferences', () => {

  it('combines component scores deterministically', () => {
    const prefs = { camera: true, battery: true, performance: false, compact: false };
    const cameraOnly = scoreProduct(cameraPhone, { camera: true, battery: false, performance: false, compact: false });
    const batteryOnly = scoreProduct(cameraPhone, { camera: false, battery: true, performance: false, compact: false });
    const combined = scoreProduct(cameraPhone, prefs);
    expect(combined).toBeGreaterThan(cameraOnly);
    expect(combined).toBeGreaterThan(batteryOnly);
  });

  it('changing preferences changes ranking where fixtures support it', () => {
    const cameraPref = { camera: true, battery: false, performance: false, compact: false };
    const batteryPref = { camera: false, battery: true, performance: false, compact: false };

    const products = [cameraPhone, batteryPhone];
    const { ranked: cameraRanked } = rankProducts(products, cameraPref);
    const { ranked: batteryRanked } = rankProducts(products, batteryPref);

    // Camera preference should rank cameraPhone first
    expect(cameraRanked[0]._id).toBe('cp1');
    // Battery preference should rank batteryPhone first
    expect(batteryRanked[0]._id).toBe('bp1');
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: Stability                                                   */
/* ------------------------------------------------------------------ */

describe('Stability', () => {

  it('equal scores preserve original order', () => {
    const identical1 = { ...basicPhone, _id: 'a1' };
    const identical2 = { ...basicPhone, _id: 'a2' };
    const products = [identical1, identical2];
    const prefs = { camera: true, battery: false, performance: false, compact: false };
    const { ranked } = rankProducts(products, prefs);
    expect(ranked[0]._id).toBe('a1');
    expect(ranked[1]._id).toBe('a2');
  });

  it('repeated calls return identical output', () => {
    const products = [cameraPhone, batteryPhone, performancePhone, compactPhone];
    const prefs = { camera: true, battery: true, performance: true, compact: false };
    const result1 = rankProducts(products, prefs);
    const result2 = rankProducts(products, prefs);
    expect(result1.ranked.map(p => p._id)).toEqual(result2.ranked.map(p => p._id));
    expect(result1.explanations).toEqual(result2.explanations);
  });

  it('extreme numeric values are clamped and cannot dominate unexpectedly', () => {
    const extremePhone = {
      _id: 'extreme',
      name: 'Extreme',
      brand: 'samsung',
      price: 15_000_000,
      inStock: 1,
      specs: {
        camera: { rear: { primary: '999 MP' }, features: ['OIS', 'Telephoto'] },
        battery: { capacity: '50000 mAh', charging: { wired: '500W' } },
        memory: { ram: '128 GB', storage: '10000 GB' },
        processor: { chipset: 'Snapdragon', cpu: '128-core', gpu: 'Ultra GPU' },
        screen: { size: '15 inch' },
        weight: '1000 g',
      },
    };
    const s = extractProductSignals(extremePhone);
    const camScore = scoreCamera(s);
    const batScore = scoreBattery(s);
    const perfScore = scorePerformance(s);
    const compScore = scoreCompact(s);
    // All should be clamped at 5
    expect(camScore).toBeLessThanOrEqual(5);
    expect(batScore).toBeLessThanOrEqual(5);
    expect(perfScore).toBeLessThanOrEqual(5);
    expect(compScore).toBeLessThanOrEqual(5);
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: Explanations                                                */
/* ------------------------------------------------------------------ */

describe('Explanations', () => {

  it('reasons contain only fields present on the product', () => {
    const reasons = buildRankingExplanation(cameraPhone, { camera: true, battery: false, performance: false, compact: false });
    expect(reasons.length).toBeGreaterThan(0);
    const allText = reasons.join(' ');
    expect(allText).toContain('200 MP');
    expect(allText).toContain('OIS');
  });

  it('missing data does not generate fabricated reasons', () => {
    const reasons = buildRankingExplanation(noSpecsPhone, { camera: true, battery: true, performance: true, compact: true });
    expect(reasons).toEqual([]);
  });

  it('reasons do not contain unsupported superlatives', () => {
    const reasons = buildRankingExplanation(batteryPhone, { camera: false, battery: true, performance: false, compact: false });
    const allText = reasons.join(' ').toLowerCase();
    expect(allText).not.toContain('tốt nhất');
    expect(allText).not.toContain('mạnh nhất');
    expect(allText).not.toContain('xuất sắc nhất');
    expect(allText).not.toContain('dùng được hai ngày');
  });

  it('returns empty array when no preferences active', () => {
    const reasons = buildRankingExplanation(cameraPhone, { camera: false, battery: false, performance: false, compact: false });
    expect(reasons).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: rankProducts edge cases                                     */
/* ------------------------------------------------------------------ */

describe('rankProducts edge cases', () => {

  it('handles non-array products', () => {
    const { ranked, explanations } = rankProducts(null, { camera: true });
    expect(ranked).toEqual([]);
    expect(explanations).toEqual([]);
  });

  it('handles empty array', () => {
    const { ranked, explanations } = rankProducts([], { camera: true });
    expect(ranked).toEqual([]);
    expect(explanations).toEqual([]);
  });

  it('handles null preferences', () => {
    const products = [cameraPhone, batteryPhone];
    const { ranked } = rankProducts(products, null);
    expect(ranked.map(p => p._id)).toEqual(products.map(p => p._id));
  });

  it('does not mutate input when ranking', () => {
    const products = [cameraPhone, batteryPhone];
    const originalIds = products.map(p => p._id);
    rankProducts(products, { camera: true, battery: false, performance: false, compact: false });
    expect(products.map(p => p._id)).toEqual(originalIds);
  });
});
