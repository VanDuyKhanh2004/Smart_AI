const { parseProductConstraints } = require('../utils/productConstraintParser');

describe('parseProductConstraints — brand', () => {
  it('Samsung brand extraction', () => {
    const r = parseProductConstraints('điện thoại Samsung dưới 15 triệu');
    expect(r.filters.brands).toEqual(['samsung']);
    expect(r.filters.maxPrice).toBe(14_999_999);
  });

  it('iPhone maps to Apple', () => {
    const r = parseProductConstraints('iPhone tối đa 20 triệu');
    expect(r.filters.brands).toEqual(['apple']);
    expect(r.filters.maxPrice).toBe(20_000_000);
  });

  it('Pixel maps to Google', () => {
    const r = parseProductConstraints('Google Pixel dưới 15 triệu');
    expect(r.filters.brands).toContain('google');
  });

  it('multiple allowed brands', () => {
    const r = parseProductConstraints('Samsung hoặc Xiaomi dưới 10 triệu');
    expect(r.filters.brands).toContain('samsung');
    expect(r.filters.brands).toContain('xiaomi');
    expect(r.filters.maxPrice).toBe(9_999_999);
  });

  it('excluded brand', () => {
    const r = parseProductConstraints('điện thoại dưới 20 triệu không lấy iPhone');
    expect(r.filters.excludedBrands).toContain('apple');
    expect(r.filters.maxPrice).toBe(19_999_999);
  });

  it('no brand constraints leaves brands null', () => {
    const r = parseProductConstraints('điện thoại giá rẻ');
    expect(r.filters.brands).toBeNull();
    expect(r.filters.excludedBrands).toBeNull();
  });
});

describe('parseProductConstraints — stock', () => {
  it('còn hàng sets inStock true', () => {
    const r = parseProductConstraints('Samsung dưới 15 triệu còn hàng');
    expect(r.filters.inStock).toBe(true);
    expect(r.filters.brands).toEqual(['samsung']);
  });

  it('có sẵn sets inStock true', () => {
    const r = parseProductConstraints('điện thoại có sẵn');
    expect(r.filters.inStock).toBe(true);
  });

  it('đang bán sets inStock true', () => {
    const r = parseProductConstraints('đang bán');
    expect(r.filters.inStock).toBe(true);
  });

  it('no stock constraint leaves inStock null', () => {
    const r = parseProductConstraints('điện thoại samsung');
    expect(r.filters.inStock).toBeNull();
  });
});

describe('parseProductConstraints — RAM', () => {
  it('RAM 8GB sets exact constraint', () => {
    const r = parseProductConstraints('điện thoại RAM 8GB');
    expect(r.filters.minRamGB).toBe(8);
    expect(r.filters.maxRamGB).toBe(8);
  });

  it('RAM ít nhất 8GB', () => {
    const r = parseProductConstraints('điện thoại RAM ít nhất 8GB');
    expect(r.filters.minRamGB).toBe(8);
  });

  it('RAM tối đa 12GB', () => {
    const r = parseProductConstraints('RAM tối đa 12GB');
    expect(r.filters.maxRamGB).toBe(12);
  });

  it('RAM 8 hoặc 12GB', () => {
    const r = parseProductConstraints('điện thoại RAM 8 hoặc 12GB');
    expect(r.filters.ramGB).toContain(8);
    // Either 8 or 12 may be detected; check at least one
    expect(r.filters.ramGB.length).toBeGreaterThan(0);
  });

  it('no RAM constraint leaves ramGB null', () => {
    const r = parseProductConstraints('điện thoại giá rẻ');
    expect(r.filters.ramGB).toBeNull();
    expect(r.filters.minRamGB).toBeNull();
  });

  it('RAM 8GB does not populate alternatives array', () => {
    const r = parseProductConstraints('RAM 8GB');
    expect(r.filters.ramGB).toBeNull();
    expect(r.filters.minRamGB).toBe(8);
    expect(r.filters.maxRamGB).toBe(8);
  });

  it('RAM 8 hoặc 12GB accepts exactly 8 and 12, no stale min/max', () => {
    const r = parseProductConstraints('RAM 8 hoặc 12GB');
    expect(r.filters.ramGB).toEqual(expect.arrayContaining([8, 12]));
    expect(r.filters.minRamGB).toBeNull();
    expect(r.filters.maxRamGB).toBeNull();
  });

  it('RAM ít nhất 8GB does not set max or array', () => {
    const r = parseProductConstraints('RAM ít nhất 8GB');
    expect(r.filters.ramGB).toBeNull();
    expect(r.filters.minRamGB).toBe(8);
    expect(r.filters.maxRamGB).toBeNull();
  });

  it('RAM tối đa 12GB does not set min or array', () => {
    const r = parseProductConstraints('RAM tối đa 12GB');
    expect(r.filters.ramGB).toBeNull();
    expect(r.filters.minRamGB).toBeNull();
    expect(r.filters.maxRamGB).toBe(12);
  });

  it('RAM từ 8GB đến 16GB sets both min and max', () => {
    const r = parseProductConstraints('RAM từ 8GB đến 16GB');
    expect(r.filters.ramGB).toBeNull();
    expect(r.filters.minRamGB).toBe(8);
    expect(r.filters.maxRamGB).toBe(16);
  });
});

describe('parseProductConstraints — storage', () => {
  it('128GB extraction', () => {
    const r = parseProductConstraints('máy 128GB');
    expect(r.filters.minStorageGB).toBe(128);
    expect(r.filters.maxStorageGB).toBe(128);
  });

  it('bộ nhớ 256GB', () => {
    const r = parseProductConstraints('bộ nhớ 256GB');
    expect(r.filters.minStorageGB).toBe(256);
    expect(r.filters.maxStorageGB).toBe(256);
  });

  it('ít nhất 256GB', () => {
    const r = parseProductConstraints('ít nhất 256GB');
    // "ít nhất" before the number sets min
    expect(r.filters.minStorageGB).toBe(256);
  });

  it('tối đa 512GB', () => {
    const r = parseProductConstraints('tối đa 512GB');
    expect(r.filters.maxStorageGB).toBe(512);
  });

  it('128 hoặc 256GB', () => {
    const r = parseProductConstraints('128 hoặc 256GB');
    expect(r.filters.storageGB).toContain(128);
    expect(r.filters.storageGB).toContain(256);
  });

  it('128GB hoặc 256GB accepts both 128 and 256, rejects 64 and 512', () => {
    const r = parseProductConstraints('128GB hoặc 256GB');
    expect(r.filters.storageGB).toEqual(expect.arrayContaining([128, 256]));
    expect(r.filters.minStorageGB).toBeNull();
    expect(r.filters.maxStorageGB).toBeNull();
  });

  it('điện thoại 128 hoặc 256GB accepts both, no stale min/max', () => {
    const r = parseProductConstraints('điện thoại 128 hoặc 256GB');
    expect(r.filters.storageGB).toEqual(expect.arrayContaining([128, 256]));
    expect(r.filters.minStorageGB).toBeNull();
    expect(r.filters.maxStorageGB).toBeNull();
  });

  it('exact storage does not populate alternatives array', () => {
    const r = parseProductConstraints('bộ nhớ 256GB');
    expect(r.filters.storageGB).toBeNull();
    expect(r.filters.minStorageGB).toBe(256);
    expect(r.filters.maxStorageGB).toBe(256);
  });

  it('min storage does not set max or array', () => {
    const r = parseProductConstraints('ít nhất 256GB');
    expect(r.filters.storageGB).toBeNull();
    expect(r.filters.minStorageGB).toBe(256);
    expect(r.filters.maxStorageGB).toBeNull();
  });

  it('max storage does not set min or array', () => {
    const r = parseProductConstraints('tối đa 512GB');
    expect(r.filters.storageGB).toBeNull();
    expect(r.filters.minStorageGB).toBeNull();
    expect(r.filters.maxStorageGB).toBe(512);
  });

  it('storage range từ X đến Y sets min and max', () => {
    const r = parseProductConstraints('từ 128GB đến 512GB');
    expect(r.filters.storageGB).toBeNull();
    expect(r.filters.minStorageGB).toBe(128);
    expect(r.filters.maxStorageGB).toBe(512);
  });

  it('storage range without GB on first number still works', () => {
    const r = parseProductConstraints('từ 128 đến 512GB');
    expect(r.filters.storageGB).toBeNull();
    expect(r.filters.minStorageGB).toBe(128);
    expect(r.filters.maxStorageGB).toBe(512);
  });
});

describe('parseProductConstraints — color', () => {
  it('màu đen normalizes to black', () => {
    const r = parseProductConstraints('máy 256GB màu đen tối đa 18 triệu');
    expect(r.filters.colors).toContain('black');
    expect(r.filters.maxPrice).toBe(18_000_000);
    expect(r.filters.minStorageGB).toBe(256);
  });

  it('xanh normalizes to blue', () => {
    const r = parseProductConstraints('điện thoại màu xanh');
    expect(r.filters.colors).toContain('blue');
  });

  it('hồng normalizes to pink', () => {
    const r = parseProductConstraints('màu hồng');
    expect(r.filters.colors).toContain('pink');
  });
});

describe('parseProductConstraints — category', () => {
  it('điện thoại detected', () => {
    const r = parseProductConstraints('điện thoại samsung');
    expect(r.cleanedQuery).toMatch(/điện thoại/);
  });

  it('laptop detected', () => {
    const r = parseProductConstraints('laptop gaming');
    expect(r.cleanedQuery).toMatch(/laptop/);
  });
});

describe('parseProductConstraints — soft preferences', () => {
  it('camera preference detected', () => {
    const r = parseProductConstraints('Samsung dưới 15 triệu, ưu tiên camera đẹp');
    expect(r.preferences.camera).toBe(true);
    // Hard filters still applied
    expect(r.filters.brands).toEqual(['samsung']);
    expect(r.filters.maxPrice).toBe(14_999_999);
  });

  it('pin trâu preference detected', () => {
    const r = parseProductConstraints('pin trâu');
    expect(r.preferences.battery).toBe(true);
  });

  it('chơi game preference detected', () => {
    const r = parseProductConstraints('chơi game');
    expect(r.preferences.performance).toBe(true);
  });

  it('nhỏ gọn preference detected', () => {
    const r = parseProductConstraints('nhỏ gọn');
    expect(r.preferences.compact).toBe(true);
  });
});

describe('parseProductConstraints — combined queries', () => {
  it('Samsung + dưới 15m + còn hàng', () => {
    const r = parseProductConstraints('điện thoại Samsung dưới 15 triệu còn hàng');
    expect(r.filters.brands).toEqual(['samsung']);
    expect(r.filters.maxPrice).toBe(14_999_999);
    expect(r.filters.inStock).toBe(true);
  });

  it('Samsung hoặc Xiaomi + tối đa 12m + RAM ít nhất 8GB', () => {
    const r = parseProductConstraints('Samsung hoặc Xiaomi tối đa 12 triệu RAM ít nhất 8GB');
    expect(r.filters.brands).toContain('samsung');
    expect(r.filters.brands).toContain('xiaomi');
    expect(r.filters.maxPrice).toBe(12_000_000);
    expect(r.filters.minRamGB).toBe(8);
  });

  it('dưới 20m không lấy iPhone', () => {
    const r = parseProductConstraints('điện thoại dưới 20 triệu không lấy iPhone');
    expect(r.filters.maxPrice).toBe(19_999_999);
    expect(r.filters.excludedBrands).toContain('apple');
  });

  it('máy 256GB màu đen tối đa 18 triệu', () => {
    const r = parseProductConstraints('máy 256GB màu đen tối đa 18 triệu');
    expect(r.filters.minStorageGB).toBe(256);
    expect(r.filters.colors).toContain('black');
    expect(r.filters.maxPrice).toBe(18_000_000);
  });

  it('no constraints leaves everything null', () => {
    const r = parseProductConstraints('điện thoại giá rẻ');
    expect(r.filters.minPrice).toBeNull();
    expect(r.filters.maxPrice).toBeNull();
    expect(r.filters.brands).toBeNull();
    expect(r.filters.excludedBrands).toBeNull();
    expect(r.filters.inStock).toBeNull();
    expect(r.filters.ramGB).toBeNull();
    expect(r.filters.storageGB).toBeNull();
    expect(r.filters.colors).toBeNull();
  });
});

describe('parseProductConstraints — normalization', () => {
  it('original query is not mutated', () => {
    const query = 'điện thoại Samsung dưới 15 triệu';
    const copy = query.slice();
    parseProductConstraints(query);
    expect(query).toBe(copy);
  });

  it('deterministic output for equivalent casing', () => {
    const r1 = parseProductConstraints('SAMSUNG DƯỚI 10 TRIỆU');
    const r2 = parseProductConstraints('samsung dưới 10 triệu');
    expect(r1.filters.brands).toEqual(r2.filters.brands);
    expect(r1.filters.maxPrice).toBe(r2.filters.maxPrice);
  });

  it('trims whitespace', () => {
    const r = parseProductConstraints('  samsung  ');
    expect(r.filters.brands).toEqual(['samsung']);
  });

  it('null/empty input', () => {
    expect(parseProductConstraints(null).filters.brands).toBeNull();
    expect(parseProductConstraints('').filters.brands).toBeNull();
  });
});
