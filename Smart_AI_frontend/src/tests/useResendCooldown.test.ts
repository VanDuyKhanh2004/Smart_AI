import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useResendCooldown, readRetryAfterSeconds } from '@/hooks/useResendCooldown';

describe('useResendCooldown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts idle with no cooldown or sending state', () => {
    const { result } = renderHook(() => useResendCooldown());

    expect(result.current.remainingSeconds).toBe(0);
    expect(result.current.isOnCooldown).toBe(false);
    expect(result.current.isSending).toBe(false);
  });

  it('counts down from the full duration and clears at zero', () => {
    const { result } = renderHook(() => useResendCooldown());

    act(() => result.current.startCooldown(3));

    expect(result.current.isOnCooldown).toBe(true);
    expect(result.current.remainingSeconds).toBe(3);

    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.remainingSeconds).toBe(2);

    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.remainingSeconds).toBe(0);
    expect(result.current.isOnCooldown).toBe(false);
  });

  it('exposes sending state through startSending/stopSending', () => {
    const { result } = renderHook(() => useResendCooldown());

    act(() => result.current.startSending());
    expect(result.current.isSending).toBe(true);

    act(() => result.current.stopSending());
    expect(result.current.isSending).toBe(false);
  });

  it('reads retryAfterSeconds from the backend 429 error shape', () => {
    expect(
      readRetryAfterSeconds({ response: { data: { data: { retryAfterSeconds: 42 } } } })
    ).toBe(42);
    expect(
      readRetryAfterSeconds({ response: { data: { error: { code: 'COOLDOWN' } } } })
    ).toBeNull();
    expect(readRetryAfterSeconds(new Error('boom'))).toBeNull();
  });
});