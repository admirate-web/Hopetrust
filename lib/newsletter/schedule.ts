// When The Hope Letter goes out (fortnightly spec §5.1, §5.2, §5.6): every 14
// days from the first send date, at 10:00 India time, with the preview 48 hours
// before; and the rule that no two newsletters go out less than 14 India days
// apart. India is UTC+05:30 all year, so 10:00 there is 04:30 UTC.

import { todayInIndia } from './issue';

export const PREVIEW_LEAD_MS = 48 * 3600_000;
export const LATE_LIMIT_MS = 3 * 3600_000;
export const MIN_GAP_DAYS = 14;
const DAY_MS = 86_400_000;
const PERIOD_MS = MIN_GAP_DAYS * DAY_MS;
const IST_MS = 330 * 60_000;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 10:00 India time on an India date (YYYY-MM-DD). */
export function sendTimeOn(indiaDate: string): Date {
  return new Date(`${indiaDate}T04:30:00.000Z`);
}

/** The send time S with S − 48 h ≤ now < S + 3 h, or null. Windows are 51 hours, sends 14 days apart: at most one fits. */
export function dueSlot(firstSendDate: string, now: Date): Date | null {
  const first = sendTimeOn(firstSendDate).getTime();
  const k = Math.floor((now.getTime() + PREVIEW_LEAD_MS - first) / PERIOD_MS);
  if (k < 0) return null;
  const slot = first + k * PERIOD_MS;
  return now.getTime() < slot + LATE_LIMIT_MS ? new Date(slot) : null;
}

/** The first send time at or after `now`. */
export function nextSlot(firstSendDate: string, now: Date): Date {
  const first = sendTimeOn(firstSendDate).getTime();
  if (now.getTime() <= first) return new Date(first);
  return new Date(first + Math.ceil((now.getTime() - first) / PERIOD_MS) * PERIOD_MS);
}

export function addDays(indiaDate: string, days: number): string {
  return new Date(Date.parse(`${indiaDate}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** The first India date the next newsletter may go out, or null when none has been sent. */
export function nextAllowedDate(lastSentAt: string | null): string | null {
  return lastSentAt ? addDays(todayInIndia(new Date(lastSentAt)), MIN_GAP_DAYS) : null;
}

export function gapAllows(lastSentAt: string | null, at: Date): boolean {
  const next = nextAllowedDate(lastSentAt);
  return next === null || todayInIndia(at) >= next;
}

/** "Tue 20 Oct": the India day of `at`. */
export function formatSlot(at: Date): string {
  const india = new Date(at.getTime() + IST_MS);
  return `${DAYS[india.getUTCDay()]} ${india.getUTCDate()} ${MONTHS[india.getUTCMonth()]}`;
}
