import type { BusinessHours } from '../types';

/**
 * Timezone used to compute store opening hours.
 * Stores operate in Vietnam local time (UTC+7, no DST).
 */
export const STORE_TIMEZONE = 'Asia/Ho_Chi_Minh';

export interface StoreOpenStatus {
  isOpen: boolean;
  today: keyof BusinessHours;
}

/**
 * Extract the weekday (as a BusinessHours key) and minutes-of-day in the
 * given timezone. Deterministic regardless of the host's local timezone.
 */
function getLocalTime(date: Date, timeZone: string): { today: keyof BusinessHours; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const partValue = (type: string) => parts.find((p) => p.type === type)?.value ?? '';

  const today = partValue('weekday').toLowerCase() as keyof BusinessHours;
  const hour = Number(partValue('hour')) % 24;
  const minute = Number(partValue('minute'));

  return { today, minutes: hour * 60 + minute };
}

/**
 * Parse "HH:MM" into minutes-of-day, or null when malformed.
 */
function parseTimeToMinutes(time: string | undefined): number | null {
  if (typeof time !== 'string') return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * Compute whether a store is open at a given instant, and which weekday
 * (in store time) that instant falls on.
 *
 * Semantics:
 * - Interval is half-open [open, close): the store is open at `open` and
 *   closed at `close`.
 * - A day marked `isClosed` is always closed.
 * - Missing or malformed schedules are closed (never throws).
 * - Overnight schedules (close < open, e.g. 22:00 - 02:00) are NOT
 *   supported by the single same-day interval data model; such a day is
 *   treated as closed rather than inventing cross-midnight behavior.
 *
 * @param businessHours Store's per-day schedule
 * @param now           Instant to evaluate (defaults to the current time)
 * @param timeZone      IANA timezone to interpret schedule in (defaults to store timezone)
 */
export function getStoreOpenStatus(
  businessHours: BusinessHours | null | undefined,
  now: Date = new Date(),
  timeZone: string = STORE_TIMEZONE
): StoreOpenStatus {
  if (Number.isNaN(now.getTime())) {
    return { isOpen: false, today: 'monday' };
  }

  const { today, minutes: currentMinutes } = getLocalTime(now, timeZone);

  const hours = businessHours?.[today];

  if (!hours || hours.isClosed) {
    return { isOpen: false, today };
  }

  const openMinutes = parseTimeToMinutes(hours.open);
  const closeMinutes = parseTimeToMinutes(hours.close);

  if (openMinutes === null || closeMinutes === null) {
    return { isOpen: false, today };
  }

  // close === open is a zero-length interval; close < open is an
  // unsupported overnight schedule. Both resolve deterministically to closed.
  let isOpen: boolean;
  if (closeMinutes > openMinutes) {
    isOpen = currentMinutes >= openMinutes && currentMinutes < closeMinutes;
  } else {
    isOpen = false;
  }

  return { isOpen, today };
}
