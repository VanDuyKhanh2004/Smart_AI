const { computeRequestFingerprint, computeCartFingerprint, computeCheckoutFingerprint, normalizeAddress, normalizePromotionCode } = require('../utils/checkoutFingerprint');

const defaultAddress = { fullName: 'A', phone: '1', address: 'S', ward: 'W', district: 'D', city: 'C' };
const defaultItems = [{ product: { _id: 'p1' }, quantity: 1, color: 'Black' }];

describe('normalizeAddress', () => {
  it('returns null for null/undefined', () => {
    expect(normalizeAddress(null)).toBeNull();
    expect(normalizeAddress(undefined)).toBeNull();
  });

  it('trims all fields and returns canonical order', () => {
    const result = normalizeAddress({
      fullName: '  John  ',
      phone: ' 0123456789 ',
      address: ' 123 St ',
      ward: ' Ward ',
      district: ' Dist ',
      city: ' City ',
    });
    expect(result).toEqual({
      fullName: 'John',
      phone: '0123456789',
      address: '123 St',
      ward: 'Ward',
      district: 'Dist',
      city: 'City',
    });
    expect(Object.keys(result)).toEqual(['fullName', 'phone', 'address', 'ward', 'district', 'city']);
  });

  it('handles missing fields', () => {
    const result = normalizeAddress({ fullName: 'Test' });
    expect(result.fullName).toBe('Test');
    expect(result.phone).toBe('');
  });
});

describe('normalizePromotionCode', () => {
  it('returns uppercase trimmed code', () => {
    expect(normalizePromotionCode(' test10 ')).toBe('TEST10');
  });

  it('returns null for empty/falsy', () => {
    expect(normalizePromotionCode('')).toBeNull();
    expect(normalizePromotionCode(null)).toBeNull();
    expect(normalizePromotionCode(undefined)).toBeNull();
    expect(normalizePromotionCode('   ')).toBeNull();
  });
});

describe('computeCartFingerprint', () => {
  it('produces same hash for same items regardless of order', () => {
    const itemsA = [
      { product: { _id: 'p1' }, quantity: 2, color: 'Black' },
      { product: { _id: 'p2' }, quantity: 1, color: 'White' },
    ];
    const itemsB = [
      { product: { _id: 'p2' }, quantity: 1, color: 'White' },
      { product: { _id: 'p1' }, quantity: 2, color: 'Black' },
    ];
    expect(computeCartFingerprint(itemsA)).toBe(computeCartFingerprint(itemsB));
  });

  it('includes color in hash', () => {
    const withColor = computeCartFingerprint([{ product: { _id: 'p1' }, quantity: 1, color: 'Red' }]);
    const withoutColor = computeCartFingerprint([{ product: { _id: 'p1' }, quantity: 1, color: null }]);
    expect(withColor).not.toBe(withoutColor);
  });

  it('normalizes null/empty color to null', () => {
    const a = computeCartFingerprint([{ product: { _id: 'p1' }, quantity: 1, color: null }]);
    const b = computeCartFingerprint([{ product: { _id: 'p1' }, quantity: 1, color: '' }]);
    expect(a).toBe(b);
  });

  it('produces different hash for different quantities', () => {
    const q1 = computeCartFingerprint([{ product: { _id: 'p1' }, quantity: 1, color: null }]);
    const q2 = computeCartFingerprint([{ product: { _id: 'p1' }, quantity: 2, color: null }]);
    expect(q1).not.toBe(q2);
  });

  it('handles empty items', () => {
    const result = computeCartFingerprint([]);
    expect(typeof result).toBe('string');
    expect(result).toHaveLength(64);
  });

  it('handles undefined', () => {
    const result = computeCartFingerprint(undefined);
    expect(typeof result).toBe('string');
    expect(result).toHaveLength(64);
  });
});

describe('computeRequestFingerprint', () => {
  it('excludes cart — only userId, address, promo', () => {
    const r1 = computeRequestFingerprint('user-1', defaultAddress, 'PROMO');
    const r2 = computeRequestFingerprint('user-1', defaultAddress, 'PROMO');
    expect(r1).toBe(r2);
  });

  it('is deterministic for same inputs', () => {
    const r1 = computeRequestFingerprint('user-1', defaultAddress, 'PROMO');
    const r2 = computeRequestFingerprint('user-1', defaultAddress, 'PROMO');
    expect(r1).toBe(r2);
  });

  it('changes when userId changes', () => {
    expect(
      computeRequestFingerprint('user-1', defaultAddress, 'PROMO')
    ).not.toBe(
      computeRequestFingerprint('user-2', defaultAddress, 'PROMO')
    );
  });

  it('changes when shipping address changes', () => {
    const addrB = { ...defaultAddress, city: 'Z' };
    expect(
      computeRequestFingerprint('user-1', defaultAddress, 'PROMO')
    ).not.toBe(
      computeRequestFingerprint('user-1', addrB, 'PROMO')
    );
  });

  it('changes when promotion code changes', () => {
    expect(
      computeRequestFingerprint('user-1', defaultAddress, 'PROMO1')
    ).not.toBe(
      computeRequestFingerprint('user-1', defaultAddress, 'PROMO2')
    );
  });

  it('is case-insensitive for promotion code', () => {
    expect(
      computeRequestFingerprint('user-1', defaultAddress, 'promo')
    ).toBe(
      computeRequestFingerprint('user-1', defaultAddress, 'PROMO')
    );
  });

  it('is whitespace-insensitive for address fields', () => {
    const spaced = { fullName: ' A ', phone: ' 1 ', address: ' S ', ward: ' W ', district: ' D ', city: ' C ' };
    expect(
      computeRequestFingerprint('user-1', spaced, null)
    ).toBe(
      computeRequestFingerprint('user-1', defaultAddress, null)
    );
  });

  it('handles null promotion code', () => {
    const result = computeRequestFingerprint('user-1', defaultAddress, null);
    expect(typeof result).toBe('string');
    expect(result).toHaveLength(64);
  });

  it('handles null shipping address', () => {
    const result = computeRequestFingerprint('user-1', null, null);
    expect(typeof result).toBe('string');
    expect(result).toHaveLength(64);
  });

  it('does not depend on cart items (no cart read needed)', () => {
    const withCart = computeRequestFingerprint('user-1', defaultAddress, null);
    const withoutCart = computeRequestFingerprint('user-1', defaultAddress, null);
    expect(withCart).toBe(withoutCart);
  });
});

describe('computeCheckoutFingerprint', () => {
  it('produces deterministic hash for same inputs', () => {
    const reqFp = computeRequestFingerprint('user-1', defaultAddress, 'PROMO');
    const items = [{ product: { _id: 'p1' }, quantity: 2, color: 'Black' }];
    expect(
      computeCheckoutFingerprint(reqFp, items)
    ).toBe(
      computeCheckoutFingerprint(reqFp, items)
    );
  });

  it('includes requestFingerprint — different address changes hash', () => {
    const reqFpA = computeRequestFingerprint('user-1', defaultAddress, null);
    const reqFpB = computeRequestFingerprint('user-1', { ...defaultAddress, city: 'Z' }, null);
    const items = [{ product: { _id: 'p1' }, quantity: 1, color: null }];
    expect(
      computeCheckoutFingerprint(reqFpA, items)
    ).not.toBe(
      computeCheckoutFingerprint(reqFpB, items)
    );
  });

  it('changes when cart items change', () => {
    const reqFp = computeRequestFingerprint('user-1', defaultAddress, null);
    const itemsA = [{ product: { _id: 'p1' }, quantity: 1, color: null }];
    const itemsB = [{ product: { _id: 'p1' }, quantity: 2, color: null }];
    expect(
      computeCheckoutFingerprint(reqFp, itemsA)
    ).not.toBe(
      computeCheckoutFingerprint(reqFp, itemsB)
    );
  });

  it('changes when color changes', () => {
    const reqFp = computeRequestFingerprint('user-1', defaultAddress, null);
    const itemsA = [{ product: { _id: 'p1' }, quantity: 1, color: 'Red' }];
    const itemsB = [{ product: { _id: 'p1' }, quantity: 1, color: 'Blue' }];
    expect(
      computeCheckoutFingerprint(reqFp, itemsA)
    ).not.toBe(
      computeCheckoutFingerprint(reqFp, itemsB)
    );
  });

  it('is insensitive to cart item order', () => {
    const reqFp = computeRequestFingerprint('user-1', defaultAddress, null);
    const itemsA = [
      { product: { _id: 'p3' }, quantity: 1, color: 'Blue' },
      { product: { _id: 'p1' }, quantity: 2, color: 'Black' },
    ];
    const itemsB = [
      { product: { _id: 'p1' }, quantity: 2, color: 'Black' },
      { product: { _id: 'p3' }, quantity: 1, color: 'Blue' },
    ];
    expect(
      computeCheckoutFingerprint(reqFp, itemsA)
    ).toBe(
      computeCheckoutFingerprint(reqFp, itemsB)
    );
  });

  it('handles empty cart items', () => {
    const reqFp = computeRequestFingerprint('user-1', defaultAddress, null);
    const result = computeCheckoutFingerprint(reqFp, []);
    expect(typeof result).toBe('string');
    expect(result).toHaveLength(64);
  });
});
