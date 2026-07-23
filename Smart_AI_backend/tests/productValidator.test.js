const { matchesProductConstraints, parseGB, normalizeProductColor } = require('../utils/productValidator');

function makeProduct(overrides = {}) {
  return {
    _id: 'p1',
    name: 'Test Phone',
    brand: 'samsung',
    price: 10_000_000,
    inStock: 5,
    specs: {
      memory: { ram: '8 GB', storage: '256 GB' },
      colors: ['Titanium Black', 'Silver'],
    },
    isActive: true,
    ...overrides,
  };
}

describe('parseGB', () => {
  it('"8 GB" → 8', () => expect(parseGB('8 GB')).toBe(8));
  it('"256 GB" → 256', () => expect(parseGB('256 GB')).toBe(256));
  it('"16GB" → 16', () => expect(parseGB('16GB')).toBe(16));
  it('null → null', () => expect(parseGB(null)).toBeNull());
  it('undefined → null', () => expect(parseGB(undefined)).toBeNull());
});

describe('normalizeProductColor', () => {
  it('Titanium Black → black', () => expect(normalizeProductColor('Titanium Black')).toBe('black'));
  it('Silver → silver', () => expect(normalizeProductColor('Silver')).toBe('silver'));
  it('Natural Titanium → gray', () => expect(normalizeProductColor('Natural Titanium')).toBe('gray'));
  it('Midnight → black', () => expect(normalizeProductColor('Midnight')).toBe('black'));
  it('Starlight → white', () => expect(normalizeProductColor('Starlight')).toBe('white'));
});

describe('matchesProductConstraints — brand', () => {
  it('allows matching brand', () => {
    expect(matchesProductConstraints(makeProduct(), { brands: ['samsung'] })).toBe(true);
  });

  it('rejects non-matching brand', () => {
    expect(matchesProductConstraints(makeProduct(), { brands: ['apple'] })).toBe(false);
  });

  it('rejects excluded brand', () => {
    expect(matchesProductConstraints(makeProduct({ brand: 'apple' }), { excludedBrands: ['apple'] })).toBe(false);
  });
});

describe('matchesProductConstraints — price', () => {
  it('allows product within range', () => {
    expect(matchesProductConstraints(makeProduct({ price: 10_000_000 }), { minPrice: 5_000_000, maxPrice: 15_000_000 })).toBe(true);
  });

  it('rejects product below minPrice', () => {
    expect(matchesProductConstraints(makeProduct({ price: 4_000_000 }), { minPrice: 5_000_000 })).toBe(false);
  });

  it('rejects product above maxPrice', () => {
    expect(matchesProductConstraints(makeProduct({ price: 20_000_000 }), { maxPrice: 15_000_000 })).toBe(false);
  });
});

describe('matchesProductConstraints — stock', () => {
  it('allows in-stock when inStock=true', () => {
    expect(matchesProductConstraints(makeProduct({ inStock: 5 }), { inStock: true })).toBe(true);
  });

  it('rejects out-of-stock when inStock=true', () => {
    expect(matchesProductConstraints(makeProduct({ inStock: 0 }), { inStock: true })).toBe(false);
  });
});

describe('matchesProductConstraints — RAM', () => {
  it('allows matching RAM', () => {
    expect(matchesProductConstraints(makeProduct(), { minRamGB: 8 })).toBe(true);
  });

  it('allows RAM above minimum', () => {
    expect(matchesProductConstraints(makeProduct(), { minRamGB: 4 })).toBe(true);
  });

  it('rejects RAM below minimum', () => {
    expect(matchesProductConstraints(makeProduct(), { minRamGB: 12 })).toBe(false);
  });

  it('rejects RAM above maximum', () => {
    expect(matchesProductConstraints(makeProduct(), { maxRamGB: 6 })).toBe(false);
  });

  it('RAM alternatives accepts 8 and 12, rejects 6 and 16', () => {
    const p8 = makeProduct({ specs: { memory: { ram: '8 GB', storage: '256 GB' }, colors: ['Black'] } });
    const p12 = makeProduct({ specs: { memory: { ram: '12 GB', storage: '256 GB' }, colors: ['Black'] } });
    const p6 = makeProduct({ specs: { memory: { ram: '6 GB', storage: '256 GB' }, colors: ['Black'] } });
    const p16 = makeProduct({ specs: { memory: { ram: '16 GB', storage: '256 GB' }, colors: ['Black'] } });
    const filter = { ramGB: [8, 12] };
    expect(matchesProductConstraints(p8, filter)).toBe(true);
    expect(matchesProductConstraints(p12, filter)).toBe(true);
    expect(matchesProductConstraints(p6, filter)).toBe(false);
    expect(matchesProductConstraints(p16, filter)).toBe(false);
  });

  it('RAM alternatives array takes precedence over stale min/max', () => {
    const p8 = makeProduct({ specs: { memory: { ram: '8 GB', storage: '256 GB' }, colors: ['Black'] } });
    const p12 = makeProduct({ specs: { memory: { ram: '12 GB', storage: '256 GB' }, colors: ['Black'] } });
    // Legacy malformed filters with both array AND conflicting min
    const filter = { ramGB: [8, 12], minRamGB: 12 };
    expect(matchesProductConstraints(p8, filter)).toBe(true);
    expect(matchesProductConstraints(p12, filter)).toBe(true);
  });

  it('RAM exact min=max works', () => {
    const p8 = makeProduct({ specs: { memory: { ram: '8 GB', storage: '256 GB' }, colors: ['Black'] } });
    const p6 = makeProduct({ specs: { memory: { ram: '6 GB', storage: '256 GB' }, colors: ['Black'] } });
    expect(matchesProductConstraints(p8, { minRamGB: 8, maxRamGB: 8 })).toBe(true);
    expect(matchesProductConstraints(p6, { minRamGB: 8, maxRamGB: 8 })).toBe(false);
  });

  it('RAM range min/max', () => {
    const p8 = makeProduct({ specs: { memory: { ram: '8 GB', storage: '256 GB' }, colors: ['Black'] } });
    const p16 = makeProduct({ specs: { memory: { ram: '16 GB', storage: '256 GB' }, colors: ['Black'] } });
    expect(matchesProductConstraints(p8, { minRamGB: 8, maxRamGB: 16 })).toBe(true);
    expect(matchesProductConstraints(p16, { minRamGB: 8, maxRamGB: 16 })).toBe(true);
  });

  it('handles missing RAM field', () => {
    const product = makeProduct();
    delete product.specs.memory.ram;
    expect(matchesProductConstraints(product, { minRamGB: 8 })).toBe(false);
  });

  it('handles missing specs entirely', () => {
    expect(matchesProductConstraints(makeProduct({ specs: null }), { minRamGB: 8 })).toBe(false);
  });
});

describe('matchesProductConstraints — storage', () => {
  it('allows matching storage', () => {
    expect(matchesProductConstraints(makeProduct(), { storageGB: [256] })).toBe(true);
  });

  it('rejects non-matching storage', () => {
    expect(matchesProductConstraints(makeProduct(), { storageGB: [128] })).toBe(false);
  });

  it('storage alternatives accepts 128 and 256, rejects 64 and 512', () => {
    const p128 = makeProduct({ specs: { memory: { ram: '8 GB', storage: '128 GB' }, colors: ['Black'] } });
    const p256 = makeProduct({ specs: { memory: { ram: '8 GB', storage: '256 GB' }, colors: ['Black'] } });
    const p64 = makeProduct({ specs: { memory: { ram: '8 GB', storage: '64 GB' }, colors: ['Black'] } });
    const p512 = makeProduct({ specs: { memory: { ram: '8 GB', storage: '512 GB' }, colors: ['Black'] } });
    const filter = { storageGB: [128, 256] };
    expect(matchesProductConstraints(p128, filter)).toBe(true);
    expect(matchesProductConstraints(p256, filter)).toBe(true);
    expect(matchesProductConstraints(p64, filter)).toBe(false);
    expect(matchesProductConstraints(p512, filter)).toBe(false);
  });

  it('storage alternatives array takes precedence over stale min/max', () => {
    const p128 = makeProduct({ specs: { memory: { ram: '8 GB', storage: '128 GB' }, colors: ['Black'] } });
    const p256 = makeProduct({ specs: { memory: { ram: '8 GB', storage: '256 GB' }, colors: ['Black'] } });
    // Legacy malformed filters with both array AND conflicting min
    const filter = { storageGB: [128, 256], minStorageGB: 256 };
    expect(matchesProductConstraints(p128, filter)).toBe(true);
    expect(matchesProductConstraints(p256, filter)).toBe(true);
  });

  it('storage exact min=max works', () => {
    const p256 = makeProduct({ specs: { memory: { ram: '8 GB', storage: '256 GB' }, colors: ['Black'] } });
    const p128 = makeProduct({ specs: { memory: { ram: '8 GB', storage: '128 GB' }, colors: ['Black'] } });
    expect(matchesProductConstraints(p256, { minStorageGB: 256, maxStorageGB: 256 })).toBe(true);
    expect(matchesProductConstraints(p128, { minStorageGB: 256, maxStorageGB: 256 })).toBe(false);
  });

  it('storage range min/max', () => {
    const p128 = makeProduct({ specs: { memory: { ram: '8 GB', storage: '128 GB' }, colors: ['Black'] } });
    const p512 = makeProduct({ specs: { memory: { ram: '8 GB', storage: '512 GB' }, colors: ['Black'] } });
    expect(matchesProductConstraints(p128, { minStorageGB: 128, maxStorageGB: 512 })).toBe(true);
    expect(matchesProductConstraints(p512, { minStorageGB: 128, maxStorageGB: 512 })).toBe(true);
  });
});

describe('matchesProductConstraints — color', () => {
  it('allows matching color', () => {
    expect(matchesProductConstraints(makeProduct(), { colors: ['black'] })).toBe(true);
  });

  it('allows alternative matching color', () => {
    expect(matchesProductConstraints(makeProduct(), { colors: ['silver'] })).toBe(true);
  });

  it('rejects non-matching color', () => {
    expect(matchesProductConstraints(makeProduct(), { colors: ['purple'] })).toBe(false);
  });
});

describe('matchesProductConstraints — combined constraints', () => {
  const product = makeProduct({
    brand: 'samsung',
    price: 10_000_000,
    inStock: 3,
  });

  it('passes all matching constraints', () => {
    const filters = {
      brands: ['samsung'],
      maxPrice: 15_000_000,
      inStock: true,
      minRamGB: 8,
      storageGB: [256],
      colors: ['black'],
    };
    expect(matchesProductConstraints(product, filters)).toBe(true);
  });

  it('fails if any single constraint fails', () => {
    expect(matchesProductConstraints(product, { brands: ['apple'], maxPrice: 15_000_000 })).toBe(false);
    expect(matchesProductConstraints(product, { brands: ['samsung'], maxPrice: 5_000_000 })).toBe(false);
  });
});

describe('matchesProductConstraints — edge cases', () => {
  it('null filters returns true', () => {
    expect(matchesProductConstraints(makeProduct(), null)).toBe(true);
  });

  it('null product returns false', () => {
    expect(matchesProductConstraints(null, { brands: ['samsung'] })).toBe(false);
  });

  it('empty brands array does not filter', () => {
    expect(matchesProductConstraints(makeProduct(), { brands: [] })).toBe(true);
  });
});
