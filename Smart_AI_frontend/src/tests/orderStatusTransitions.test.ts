import { describe, it, expect } from 'vitest';
import { getAllowedNextStatuses, canTransition, isTerminal } from '@/features/orders/utils/orderStatusTransitions';

describe('getAllowedNextStatuses', () => {
  it('pending allows confirmed and cancelled', () => {
    expect(getAllowedNextStatuses('pending')).toEqual(['confirmed', 'cancelled']);
  });
  it('confirmed allows processing and cancelled', () => {
    expect(getAllowedNextStatuses('confirmed')).toEqual(['processing', 'cancelled']);
  });
  it('processing allows shipping and cancelled', () => {
    expect(getAllowedNextStatuses('processing')).toEqual(['shipping', 'cancelled']);
  });
  it('shipping allows delivered and cancelled', () => {
    expect(getAllowedNextStatuses('shipping')).toEqual(['delivered', 'cancelled']);
  });
  it('delivered allows no transitions', () => {
    expect(getAllowedNextStatuses('delivered')).toEqual([]);
  });
  it('cancelled allows no transitions', () => {
    expect(getAllowedNextStatuses('cancelled')).toEqual([]);
  });
});

describe('canTransition', () => {
  it('pending -> confirmed is valid', () => {
    expect(canTransition('pending', 'confirmed')).toBe(true);
  });
  it('pending -> delivered is invalid', () => {
    expect(canTransition('pending', 'delivered')).toBe(false);
  });
  it('delivered -> any is invalid', () => {
    expect(canTransition('delivered', 'pending')).toBe(false);
    expect(canTransition('delivered', 'confirmed')).toBe(false);
    expect(canTransition('delivered', 'processing')).toBe(false);
    expect(canTransition('delivered', 'shipping')).toBe(false);
  });
  it('cancelled -> any is invalid', () => {
    expect(canTransition('cancelled', 'pending')).toBe(false);
    expect(canTransition('cancelled', 'confirmed')).toBe(false);
  });
});

describe('isTerminal', () => {
  it('delivered is terminal', () => {
    expect(isTerminal('delivered')).toBe(true);
  });
  it('cancelled is terminal', () => {
    expect(isTerminal('cancelled')).toBe(true);
  });
  it('pending is not terminal', () => {
    expect(isTerminal('pending')).toBe(false);
  });
  it('confirmed is not terminal', () => {
    expect(isTerminal('confirmed')).toBe(false);
  });
  it('processing is not terminal', () => {
    expect(isTerminal('processing')).toBe(false);
  });
  it('shipping is not terminal', () => {
    expect(isTerminal('shipping')).toBe(false);
  });
});
