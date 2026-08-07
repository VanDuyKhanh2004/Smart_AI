import { describe, it, expect } from 'vitest';
import {
  getStoreOpenStatus,
  STORE_TIMEZONE,
} from '@/features/stores/utils/openingHours';
import type { BusinessHours } from '@/features/stores/types';

function buildBusinessHours(
  overrides: Partial<Record<keyof BusinessHours, Partial<{ open: string; close: string; isClosed: boolean }>>> = {}
): BusinessHours {
  const defaults = { open: '08:00', close: '21:00', isClosed: false };
  const days: (keyof BusinessHours)[] = [
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
  ];
  const businessHours = {} as BusinessHours;
  for (const day of days) {
    businessHours[day] = { ...defaults, ...(overrides[day] ?? {}) };
  }
  return businessHours;
}

// 2026-08-07 is a Friday in both UTC and Asia/Ho_Chi_Minh.
// Vietnam is UTC+7, no DST: a UTC instant of HH:MM on day D is (HH+7):MM on day D.

describe('getStoreOpenStatus', () => {
  const fridayHours = buildBusinessHours();

  it('closed before opening time (Friday 07:59 VN)', () => {
    const status = getStoreOpenStatus(
      fridayHours,
      new Date('2026-08-07T00:59:00.000Z')
    );
    expect(status.isOpen).toBe(false);
    expect(status.today).toBe('friday');
  });

  it('open at opening time boundary (Friday 08:00 VN)', () => {
    const status = getStoreOpenStatus(
      fridayHours,
      new Date('2026-08-07T01:00:00.000Z')
    );
    expect(status.isOpen).toBe(true);
  });

  it('open mid-day (Friday 14:02 VN)', () => {
    const status = getStoreOpenStatus(
      fridayHours,
      new Date('2026-08-07T07:02:00.000Z')
    );
    expect(status.isOpen).toBe(true);
  });

  it('open before closing time (Friday 20:59 VN)', () => {
    const status = getStoreOpenStatus(
      fridayHours,
      new Date('2026-08-07T13:59:00.000Z')
    );
    expect(status.isOpen).toBe(true);
  });

  it('closed at closing time boundary (Friday 21:00 VN)', () => {
    const status = getStoreOpenStatus(
      fridayHours,
      new Date('2026-08-07T14:00:00.000Z')
    );
    expect(status.isOpen).toBe(false);
  });

  it('closed when the current day is marked isClosed', () => {
    const sundayHours = buildBusinessHours({ sunday: { isClosed: true } });
    // Sunday 2026-08-09 at 13:00 VN
    const status = getStoreOpenStatus(
      sundayHours,
      new Date('2026-08-09T06:00:00.000Z')
    );
    expect(status.isOpen).toBe(false);
    expect(status.today).toBe('sunday');
  });

  it('maps weekday correctly for a Saturday', () => {
    const saturdayHours = buildBusinessHours();
    // Saturday 2026-08-08 at 10:00 VN
    const status = getStoreOpenStatus(
      saturdayHours,
      new Date('2026-08-08T03:00:00.000Z')
    );
    expect(status.today).toBe('saturday');
    expect(status.isOpen).toBe(true);
  });

  it('computes the right status for a UTC-host instants (Asia/Ho_Chi_Minh)', () => {
    // 21:30 VN Friday = 14:30 UTC Friday -> closed
    expect(
      getStoreOpenStatus(fridayHours, new Date('2026-08-07T14:30:00.000Z')).isOpen
    ).toBe(false);
    // 01:00 VN Friday = 18:00 UTC Thursday -> closed (before 08:00 VN)
    expect(
      getStoreOpenStatus(fridayHours, new Date('2026-08-06T18:00:00.000Z')).isOpen
    ).toBe(false);
  });

  it('returns the configured timezone when not overridden', () => {
    expect(STORE_TIMEZONE).toBe('Asia/Ho_Chi_Minh');
    const status = getStoreOpenStatus(
      fridayHours,
      new Date('2026-08-07T07:02:00.000Z')
    );
    expect(status.isOpen).toBe(true);
  });

  it('treats missing businessHours as closed', () => {
    const status = getStoreOpenStatus(undefined, new Date('2026-08-07T07:02:00.000Z'));
    expect(status.isOpen).toBe(false);
    expect(status.today).toBe('friday');
  });

  it('treats malformed schedule as closed without throwing', () => {
    const malformed = buildBusinessHours({ friday: { open: 'invalid', close: '25:99' } });
    expect(() =>
      getStoreOpenStatus(malformed, new Date('2026-08-07T07:02:00.000Z'))
    ).not.toThrow();
    expect(
      getStoreOpenStatus(malformed, new Date('2026-08-07T07:02:00.000Z')).isOpen
    ).toBe(false);
  });

  it('treats a missing day entry as closed', () => {
    const noFriday: BusinessHours = {
      ...buildBusinessHours(),
      friday: undefined as unknown as BusinessHours['friday'],
    };
    expect(
      getStoreOpenStatus(noFriday, new Date('2026-08-07T07:02:00.000Z')).isOpen
    ).toBe(false);
  });

  it('does not throw for an invalid Date argument', () => {
    expect(() =>
      getStoreOpenStatus(fridayHours, new Date('not-a-date'))
    ).not.toThrow();
    expect(getStoreOpenStatus(fridayHours, new Date('not-a-date')).isOpen).toBe(false);
  });
});
