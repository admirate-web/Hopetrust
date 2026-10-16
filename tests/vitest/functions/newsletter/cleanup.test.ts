// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { runCleanup } from '@/netlify/functions/_shared/newsletter-signup.mts';
import { config } from '@/netlify/functions/newsletter-cleanup.mts';
import { makeDeps } from './fakes';

const DAY = 24 * 60 * 60_000;

describe('newsletter-cleanup', () => {
  it('runs every hour', () => {
    expect(config).toEqual({ schedule: '@hourly' });
  });

  it('deletes sign-ups left unconfirmed for 30 days and request IPs older than a day, and nothing else', async () => {
    const t = makeDeps();
    const now = t.clock.now().getTime();
    const iso = (ms: number) => new Date(ms).toISOString();
    t.memory.seed({ email: 'stale@example.com', status: 'pending', confirm_sent_at: iso(now - 31 * DAY) });
    t.memory.seed({ email: 'recent@example.com', status: 'pending', confirm_sent_at: iso(now - 29 * DAY) });
    t.memory.seed({ email: 'left@example.com', status: 'unsubscribed', created_at: iso(now - 90 * DAY) });
    await t.deps.db.recordRequest('198.51.100.1', iso(now - DAY - 60_000));
    await t.deps.db.recordRequest('198.51.100.2', iso(now - DAY + 60_000));
    expect(await runCleanup(t.deps)).toEqual({ pending: 1, requests: 1 });
    expect(t.memory.byEmail('stale@example.com')).toBeUndefined();
    expect(t.memory.byEmail('recent@example.com')).toBeDefined();
    expect(t.memory.byEmail('left@example.com')).toBeDefined();
    expect(t.memory.requests.map((r) => r.ip)).toEqual(['198.51.100.2']);
  });
});
