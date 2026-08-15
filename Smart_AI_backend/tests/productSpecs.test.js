const { normalizeProductSpecs } = require('../utils/productSpecs');

describe('normalizeProductSpecs', () => {
  it('returns undefined for non-object input', () => {
    expect(normalizeProductSpecs(null)).toBeUndefined();
    expect(normalizeProductSpecs(undefined)).toBeUndefined();
    expect(normalizeProductSpecs('specs')).toBeUndefined();
    expect(normalizeProductSpecs(42)).toBeUndefined();
    expect(normalizeProductSpecs(['screen'])).toBeUndefined();
  });

  it('returns undefined for an empty object', () => {
    expect(normalizeProductSpecs({})).toBeUndefined();
  });

  it('keeps a fully populated canonical spec object', () => {
    const input = {
      screen: { size: '6.7 inch', resolution: '2796 x 1290', technology: 'OLED' },
      processor: { chipset: 'Apple A17 Pro', cpu: '6-core', gpu: '6-core GPU' },
      memory: { ram: '8 GB', storage: '256 GB', expandable: false },
      camera: {
        rear: { primary: '48 MP', secondary: '12 MP ultrawide', tertiary: '12 MP telephoto' },
        front: '12 MP',
        features: ['Night mode', 'Portrait mode'],
      },
      battery: { capacity: '4422 mAh', charging: { wired: '27W', wireless: '15W' } },
      connectivity: { network: ['5G', 'Wi-Fi 6E'], ports: ['USB-C'] },
      os: 'iOS 17',
      dimensions: '159.9 x 76.7 x 8.25 mm',
      weight: '221g',
      colors: ['Natural Titanium'],
    };

    expect(normalizeProductSpecs(input)).toEqual(input);
  });

  it('trims string values and drops empty strings', () => {
    const result = normalizeProductSpecs({
      screen: { size: '  6.7 inch  ', resolution: '', technology: '   ' },
      os: 'iOS 17',
    });

    expect(result).toEqual({ screen: { size: '6.7 inch' }, os: 'iOS 17' });
  });

  it('coerces numeric/boolean scalars to strings for text fields', () => {
    const result = normalizeProductSpecs({
      screen: { size: 6.7 },
      battery: { capacity: 4422 },
      memory: { expandable: 'true' },
    });

    expect(result).toEqual({
      screen: { size: '6.7' },
      battery: { capacity: '4422' },
      memory: { expandable: true },
    });
  });

  it('normalizes expandable to a strict boolean', () => {
    expect(normalizeProductSpecs({ memory: { expandable: 1 } })).toEqual({ memory: { expandable: true } });
    expect(normalizeProductSpecs({ memory: { expandable: 'false' } })).toEqual({ memory: { expandable: false } });
    expect(normalizeProductSpecs({ memory: { expandable: 0 } })).toEqual({ memory: { expandable: false } });
    expect(normalizeProductSpecs({ memory: { expandable: 'yes' } })).toBeUndefined();
    expect(normalizeProductSpecs({ memory: { expandable: undefined } })).toBeUndefined();
  });

  it('cleans string arrays (trim, drop empties, de-duplicate)', () => {
    const result = normalizeProductSpecs({
      connectivity: { network: ['5G', ' 4G LTE ', '', '5G'] },
      camera: { features: ['Night mode', 'Night mode', '  ', 'Portrait mode'] },
      colors: ['Black', 'Black', ' Blue '],
    });

    expect(result).toEqual({
      connectivity: { network: ['5G', '4G LTE'] },
      camera: { features: ['Night mode', 'Portrait mode'] },
      colors: ['Black', 'Blue'],
    });
  });

  it('strips unknown top-level and nested keys', () => {
    const result = normalizeProductSpecs({
      screen: { size: '6.7 inch', brightness: '2000 nits', refreshRate: '120Hz' },
      processor: { chipset: 'A17', lithography: '3nm' },
      battery: { capacity: '4422 mAh', charging: { wired: '27W', quickCharge: '9V' } },
      infraredPort: 'yes',
    });

    expect(result).toEqual({
      screen: { size: '6.7 inch' },
      processor: { chipset: 'A17' },
      battery: { capacity: '4422 mAh', charging: { wired: '27W' } },
    });
  });

  it('drops empty camera rear sub-object', () => {
    const result = normalizeProductSpecs({
      camera: { rear: { primary: '', secondary: '  ' }, front: '12 MP' },
    });

    expect(result).toEqual({ camera: { front: '12 MP' } });
  });

  it('does not emit empty battery charging sub-object', () => {
    const result = normalizeProductSpecs({
      battery: { capacity: '4422 mAh', charging: { wired: '', wireless: '' } },
    });

    expect(result).toEqual({ battery: { capacity: '4422 mAh' } });
  });

  it('rejects non-object nested values', () => {
    const result = normalizeProductSpecs({
      screen: '6.7 inch',
      memory: '8 GB',
      camera: { front: '12 MP' },
      battery: ['4422 mAh'],
    });

    expect(result).toEqual({ camera: { front: '12 MP' } });
  });

  it('preserves a memory object with only expandable set', () => {
    const result = normalizeProductSpecs({ memory: { expandable: false } });

    expect(result).toEqual({ memory: { expandable: false } });
  });

  it('returns a fresh object (no mutation of input)', () => {
    const input = { screen: { size: '6.7 inch' } };
    const result = normalizeProductSpecs(input);

    expect(result).not.toBe(input);
    expect(result).toEqual({ screen: { size: '6.7 inch' } });
  });
});
