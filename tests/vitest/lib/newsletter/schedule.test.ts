import { describe, it, expect } from 'vitest';
import { addDays, dueSlot, formatSlot, gapAllows, nextAllowedDate, nextSlot, sendTimeOn } from '@/lib/newsletter/schedule';

const at = (iso: string) => new Date(iso);
const iso = (date: Date | null) => (date ? date.toISOString() : null);
const FIRST = '2026-10-20';

describe('sendTimeOn', () => {
  it('is 10:00 in India, which is 04:30 UTC', () => {
    expect(sendTimeOn('2026-10-20').toISOString()).toBe('2026-10-20T04:30:00.000Z');
  });
});

describe('dueSlot', () => {
  it('opens 48 hours before a send and closes 3 hours after it', () => {
    expect(dueSlot(FIRST, at('2026-10-18T04:29:00Z'))).toBeNull();
    expect(iso(dueSlot(FIRST, at('2026-10-18T04:30:00Z')))).toBe('2026-10-20T04:30:00.000Z');
    expect(iso(dueSlot(FIRST, at('2026-10-20T07:29:00Z')))).toBe('2026-10-20T04:30:00.000Z');
    expect(dueSlot(FIRST, at('2026-10-20T07:30:00Z'))).toBeNull();
  });

  it('repeats every 14 days, and has nothing before the first preview', () => {
    expect(iso(dueSlot(FIRST, at('2026-11-01T04:30:00Z')))).toBe('2026-11-03T04:30:00.000Z');
    expect(dueSlot(FIRST, at('2026-10-27T04:30:00Z'))).toBeNull();
    expect(dueSlot(FIRST, at('2026-10-01T00:00:00Z'))).toBeNull();
  });
});

describe('nextSlot', () => {
  it('is the first send at or after now, across a year end', () => {
    expect(nextSlot(FIRST, at('2026-10-01T00:00:00Z')).toISOString()).toBe('2026-10-20T04:30:00.000Z');
    expect(nextSlot(FIRST, at('2026-10-20T04:30:00Z')).toISOString()).toBe('2026-10-20T04:30:00.000Z');
    expect(nextSlot(FIRST, at('2026-10-20T04:31:00Z')).toISOString()).toBe('2026-11-03T04:30:00.000Z');
    expect(nextSlot('2026-12-29', at('2026-12-30T00:00:00Z')).toISOString()).toBe('2027-01-12T04:30:00.000Z');
  });
});

describe('the 14-day gap', () => {
  it('counts India dates', () => {
    expect(addDays('2026-12-25', 14)).toBe('2027-01-08');
    expect(nextAllowedDate('2026-10-20T04:35:00Z')).toBe('2026-11-03');
    expect(nextAllowedDate(null)).toBeNull();
  });

  it('allows a send 14 India days after the last one, and not a minute before India midnight', () => {
    expect(gapAllows('2026-10-20T04:35:00Z', at('2026-11-03T04:30:00Z'))).toBe(true);
    expect(gapAllows('2026-10-20T04:35:00Z', at('2026-11-02T18:29:00Z'))).toBe(false);
    expect(gapAllows('2026-10-20T04:35:00Z', at('2026-11-02T18:30:00Z'))).toBe(true);
  });

  it('uses the India date even when the UTC date differs', () => {
    // 19 Oct 19:00 UTC is 20 Oct 00:30 in India; 2 Nov 19:00 UTC is 3 Nov 00:30.
    expect(gapAllows('2026-10-19T19:00:00Z', at('2026-11-02T19:00:00Z'))).toBe(true);
    expect(gapAllows('2026-10-19T19:00:00Z', at('2026-11-02T18:00:00Z'))).toBe(false);
  });

  it('allows anything when nothing has been sent', () => {
    expect(gapAllows(null, at('2026-10-20T04:30:00Z'))).toBe(true);
  });
});

describe('formatSlot', () => {
  it('names the India day', () => {
    expect(formatSlot(at('2026-10-20T04:30:00Z'))).toBe('Tue 20 Oct');
    expect(formatSlot(at('2026-10-18T19:00:00Z'))).toBe('Mon 19 Oct');
  });
});
