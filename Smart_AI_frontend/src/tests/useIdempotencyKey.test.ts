import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useIdempotencyKey } from '@/features/orders/hooks/useIdempotencyKey';
import type { CartItem } from '@/types/cart.type';
import type { ShippingAddress } from '@/types/order.type';

const mockUUIDs = ['aaa', 'bbb', 'ccc', 'ddd', 'eee'];
let uuidIndex = 0;
vi.stubGlobal('crypto', {
  randomUUID: () => mockUUIDs[uuidIndex++ % mockUUIDs.length],
});

function makeProduct(id: string) {
  return {
    _id: id,
    name: 'Test',
    brand: 'TestBrand',
    price: 100,
    image: 'test.jpg',
    inStock: 10,
    isActive: true,
    description: 'Test description',
    colors: ['Black', 'White'],
    tags: ['test'],
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  };
}

function makeCartItem(overrides: Partial<CartItem> = {}): CartItem {
  return {
    _id: 'item-1',
    product: makeProduct('prod-1'),
    quantity: 1,
    color: 'Black',
    addedAt: '2024-01-01',
    ...overrides,
  };
}

function makeAddress(overrides: Partial<ShippingAddress> = {}): ShippingAddress {
  return {
    fullName: 'User',
    phone: '0123456789',
    address: '123 St',
    ward: 'Ward',
    district: 'Dist',
    city: 'City',
    ...overrides,
  };
}

beforeEach(() => {
  uuidIndex = 0;
});

describe('useIdempotencyKey', () => {
  it('returns { key, rotateKey } structure', () => {
    const { result } = renderHook(() => useIdempotencyKey([], null, undefined));
    expect(result.current).toHaveProperty('key');
    expect(result.current).toHaveProperty('rotateKey');
    expect(typeof result.current.key).toBe('string');
    expect(typeof result.current.rotateKey).toBe('function');
  });

  it('generates a key on first mount', () => {
    const { result } = renderHook(() => useIdempotencyKey([], null, undefined));
    expect(result.current.key).toBe('aaa');
  });

  it('does not rotate on first mount (stable key stays)', () => {
    const items = [makeCartItem()];
    const { result, rerender } = renderHook(
      ({ cart, addr, promo }) => useIdempotencyKey(cart, addr, promo),
      { initialProps: { cart: items, addr: makeAddress(), promo: 'PROMO' } }
    );
    const initialKey = result.current.key;

    rerender({ cart: items, addr: makeAddress(), promo: 'PROMO' });

    expect(result.current.key).toBe(initialKey);
  });

  it('rotates key when cart items change', () => {
    const { result, rerender } = renderHook(
      ({ cart, addr, promo }) => useIdempotencyKey(cart, addr, promo),
      { initialProps: { cart: [makeCartItem()], addr: makeAddress(), promo: 'PROMO' } }
    );
    const keyA = result.current.key;

    uuidIndex = 1;
    rerender({
      cart: [makeCartItem({ product: makeProduct('prod-2') })],
      addr: makeAddress(),
      promo: 'PROMO',
    });

    expect(result.current.key).toBe('bbb');
    expect(result.current.key).not.toBe(keyA);
  });

  it('rotates key when quantity changes', () => {
    const { result, rerender } = renderHook(
      ({ cart, addr, promo }) => useIdempotencyKey(cart, addr, promo),
      { initialProps: { cart: [makeCartItem({ quantity: 1 })], addr: makeAddress(), promo: undefined } }
    );
    const keyA = result.current.key;

    uuidIndex = 1;
    rerender({
      cart: [makeCartItem({ quantity: 2 })],
      addr: makeAddress(),
      promo: undefined,
    });

    expect(result.current.key).not.toBe(keyA);
  });

  it('rotates key when color changes', () => {
    const { result, rerender } = renderHook(
      ({ cart, addr, promo }) => useIdempotencyKey(cart, addr, promo),
      { initialProps: { cart: [makeCartItem({ color: 'Black' })], addr: makeAddress(), promo: undefined } }
    );
    const keyA = result.current.key;

    uuidIndex = 1;
    rerender({
      cart: [makeCartItem({ color: 'White' })],
      addr: makeAddress(),
      promo: undefined,
    });

    expect(result.current.key).not.toBe(keyA);
  });

  it('rotates key when address changes', () => {
    const { result, rerender } = renderHook(
      ({ cart, addr, promo }) => useIdempotencyKey(cart, addr, promo),
      { initialProps: { cart: [makeCartItem()], addr: makeAddress({ city: 'CityA' }), promo: undefined } }
    );
    const keyA = result.current.key;

    uuidIndex = 1;
    rerender({
      cart: [makeCartItem()],
      addr: makeAddress({ city: 'CityB' }),
      promo: undefined,
    });

    expect(result.current.key).not.toBe(keyA);
  });

  it('rotates key when promotion code changes', () => {
    const { result, rerender } = renderHook(
      ({ cart, addr, promo }) => useIdempotencyKey(cart, addr, promo),
      { initialProps: { cart: [makeCartItem()], addr: makeAddress(), promo: 'PROMO1' } }
    );
    const keyA = result.current.key;

    uuidIndex = 1;
    rerender({
      cart: [makeCartItem()],
      addr: makeAddress(),
      promo: 'PROMO2',
    });

    expect(result.current.key).not.toBe(keyA);
  });

  it('does not rotate when address changes back to original', () => {
    const { result, rerender } = renderHook(
      ({ cart, addr, promo }) => useIdempotencyKey(cart, addr, promo),
      { initialProps: { cart: [makeCartItem()], addr: makeAddress(), promo: undefined } }
    );
    const keyA = result.current.key;

    uuidIndex = 2;
    rerender({ cart: [makeCartItem()], addr: makeAddress({ city: 'Other' }), promo: undefined });
    const keyB = result.current.key;

    uuidIndex = 3;
    rerender({ cart: [makeCartItem()], addr: makeAddress(), promo: undefined });
    const keyC = result.current.key;

    expect(keyA).toBe('aaa');
    expect(keyB).toBe('ccc');
    expect(keyC).toBe('ddd');
    expect(keyC).not.toBe(keyA);
  });

  it('rotateKey() explicitly rotates the key', () => {
    const { result } = renderHook(() => useIdempotencyKey([], null, undefined));
    const keyA = result.current.key;

    uuidIndex = 1;
    act(() => {
      result.current.rotateKey();
    });

    expect(result.current.key).toBe('bbb');
    expect(result.current.key).not.toBe(keyA);
  });

  it('rotateKey() is stable reference', () => {
    const { result, rerender } = renderHook(
      ({ cart }) => useIdempotencyKey(cart, null, undefined),
      { initialProps: { cart: [makeCartItem()] } }
    );
    const fn1 = result.current.rotateKey;

    rerender({ cart: [makeCartItem({ quantity: 2 })] });

    expect(result.current.rotateKey).toBe(fn1);
  });
});
