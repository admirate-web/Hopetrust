// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import type { SupabaseClient } from '@supabase/supabase-js';
import { verifyAdminToken } from '@/netlify/functions/_shared/admin.mts';
import {
  DuplicateEmailError,
  chunked,
  createNewsletterDb,
  searchPattern,
} from '@/netlify/functions/_shared/newsletter-db.mts';
import { liveDeps } from '@/netlify/functions/_shared/newsletter-deps.mts';
import { SEGMENT, makeDeps } from './fakes';

/** A Supabase client that answers every query with no rows and records the query-builder calls. */
function recordingSupabase() {
  const calls: unknown[][] = [];
  const builder: object = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') return (resolve: (value: unknown) => void) => resolve({ data: [], error: null, count: 0 });
        return (...args: unknown[]) => {
          calls.push([prop, ...args]);
          return builder;
        };
      },
    },
  );
  const client = {
    from(table: string) {
      calls.push(['from', table]);
      return builder;
    },
  };
  return { db: createNewsletterDb(client as unknown as SupabaseClient), calls };
}

describe('createNewsletterDb queries', () => {
  it('counts sign-up requests since a time, from every IP or from one', async () => {
    const { db, calls } = recordingSupabase();
    await db.countRequestsSince('2026-10-14T09:00:00.000Z');
    expect(calls).toEqual([
      ['from', 'newsletter_signup_requests'],
      ['select', 'id', { count: 'exact', head: true }],
      ['gte', 'requested_at', '2026-10-14T09:00:00.000Z'],
    ]);
    calls.length = 0;
    await db.countRequestsSince('2026-10-14T09:45:00.000Z', '203.0.113.7');
    expect(calls).toEqual([
      ['from', 'newsletter_signup_requests'],
      ['select', 'id', { count: 'exact', head: true }],
      ['gte', 'requested_at', '2026-10-14T09:45:00.000Z'],
      ['eq', 'ip', '203.0.113.7'],
    ]);
  });

  it('records a sign-up request with its IP and time, and no address', async () => {
    const { db, calls } = recordingSupabase();
    await db.recordRequest('203.0.113.7', '2026-10-14T10:00:00.000Z');
    await db.recordRequest(null, '2026-10-14T10:00:01.000Z');
    expect(calls).toEqual([
      ['from', 'newsletter_signup_requests'],
      ['insert', { ip: '203.0.113.7', requested_at: '2026-10-14T10:00:00.000Z' }],
      ['from', 'newsletter_signup_requests'],
      ['insert', { ip: null, requested_at: '2026-10-14T10:00:01.000Z' }],
    ]);
  });

  it('deletes sign-up requests from before a time', async () => {
    const { db, calls } = recordingSupabase();
    expect(await db.deleteRequestsBefore('2026-10-13T10:00:00.000Z')).toBe(0);
    expect(calls).toEqual([
      ['from', 'newsletter_signup_requests'],
      ['delete'],
      ['lt', 'requested_at', '2026-10-13T10:00:00.000Z'],
      ['select', 'id'],
    ]);
  });

  it('orders the list and the export by creation time, then id', async () => {
    const { db, calls } = recordingSupabase();
    const orders = () => calls.filter(([name]) => name === 'order');
    await db.list({}, 25, 0);
    expect(orders()).toEqual([
      ['order', 'created_at', { ascending: false }],
      ['order', 'id', { ascending: false }],
    ]);
    calls.length = 0;
    await db.listAll({});
    expect(orders()).toEqual([
      ['order', 'created_at', { ascending: true }],
      ['order', 'id', { ascending: true }],
    ]);
  });

  it('marks pulled unsubscribes only on rows last synced before the segment was read', async () => {
    const { db, calls } = recordingSupabase();
    await db.markPulledUnsubscribed(['r1'], '2026-10-14T10:00:05.000Z', '2026-10-14T10:00:00.000Z');
    expect(calls).toContainEqual(['in', 'id', ['r1']]);
    expect(calls).toContainEqual(['eq', 'status', 'subscribed']);
    expect(calls).toContainEqual(['lt', 'resend_synced_at', '2026-10-14T10:00:00.000Z']);
  });
});

const SECRET = 'test-secret-that-is-long-enough!!';
const withAuth = (token: string) =>
  new Request('https://hopetrustindia.com/api/admin-newsletter-subscribers', { headers: { authorization: `Bearer ${token}` } });

describe('verifyAdminToken', () => {
  it('accepts a token from admin-login', () => {
    const token = jwt.sign({ sub: 'u1', email: 'admin@hopetrustindia.com', role: 'admin' }, SECRET, { expiresIn: '1h' });
    expect(verifyAdminToken(withAuth(token), SECRET)).toEqual({ email: 'admin@hopetrustindia.com' });
  });

  it('rejects expired, wrongly signed, non-admin and missing tokens', () => {
    const expired = jwt.sign({ email: 'a@x.com', role: 'admin' }, SECRET, { expiresIn: -10 });
    const forged = jwt.sign({ email: 'a@x.com', role: 'admin' }, 'another-secret');
    const notAdmin = jwt.sign({ email: 'a@x.com', role: 'viewer' }, SECRET);
    expect(verifyAdminToken(withAuth(expired), SECRET)).toBeNull();
    expect(verifyAdminToken(withAuth(forged), SECRET)).toBeNull();
    expect(verifyAdminToken(withAuth(notAdmin), SECRET)).toBeNull();
    expect(verifyAdminToken(new Request('https://hopetrustindia.com/'), SECRET)).toBeNull();
    expect(verifyAdminToken(withAuth('x'), undefined)).toBeNull();
  });
});

describe('searchPattern', () => {
  it('escapes LIKE wildcards and drops characters that break PostgREST filters', () => {
    expect(searchPattern('asha_rao')).toBe('%asha\\_rao%');
    expect(searchPattern('a,b(c)"d%e')).toBe('%abcde%');
    expect(searchPattern('  ')).toBeNull();
    expect(searchPattern(undefined)).toBeNull();
  });

  it('keeps Indian-language letters, @, dots and plus signs', () => {
    expect(searchPattern('आशा')).toBe('%आशा%');
    expect(searchPattern('a.b+x@y.com')).toBe('%a.b+x@y.com%');
  });
});

describe('chunked', () => {
  it('splits a list into groups', () => {
    expect(chunked([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunked([], 2)).toEqual([]);
  });
});

describe('liveDeps', () => {
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    RESEND_API_KEY: 're_test',
    RESEND_NEWSLETTER_SEGMENT_ID: 'seg-1',
    NEWSLETTER_FROM_EMAIL: 'Hope Trust <newsletter@hopetrustindia.com>',
  };

  it('returns null when a variable is missing', () => {
    expect(liveDeps({ ...env, RESEND_NEWSLETTER_SEGMENT_ID: undefined })).toBeNull();
  });

  it('builds the settings from the environment', () => {
    const deps = liveDeps(env);
    expect(deps?.config).toEqual({
      segmentId: 'seg-1',
      fromEmail: 'Hope Trust <newsletter@hopetrustindia.com>',
      replyTo: 'frontoffice@hopetrustindia.com',
      siteUrl: 'https://hopetrustindia.com',
      imagesBase: 'https://abc.supabase.co/storage/v1/object/public/newsletter-images',
    });
  });

  it('sleeps on a real timer', async () => {
    vi.useFakeTimers();
    try {
      let woke = false;
      void liveDeps(env)!.sleep(2500).then(() => {
        woke = true;
      });
      await vi.advanceTimersByTimeAsync(2499);
      expect(woke).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(woke).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

// The fakes stand in for Supabase and Resend in every handler test, so they
// must keep the same rules.
describe('test fakes', () => {
  it('refuse a second row for the same address', async () => {
    const { deps } = makeDeps();
    await deps.db.insert({ email: 'a@example.com', status: 'pending', source: 'website' });
    await expect(deps.db.insert({ email: 'a@example.com', status: 'pending', source: 'website' })).rejects.toBeInstanceOf(
      DuplicateEmailError,
    );
  });

  it('refuse text containing \\u0000, as Postgres does', async () => {
    const { deps } = makeDeps();
    await expect(
      deps.db.insert({ email: 'a@example.com', status: 'pending', source: 'website', full_name: 'Asha\u0000' }),
    ).rejects.toThrow('unsupported Unicode escape sequence');
    const row = await deps.db.insert({ email: 'a@example.com', status: 'pending', source: 'website' });
    await expect(deps.db.update(row.id, { signup_page: '/blogs/\u0000' })).rejects.toThrow('unsupported Unicode escape sequence');
    expect((await deps.db.findById(row.id))?.signup_page).toBeNull();
  });

  it('count and delete sign-up requests by time, from every IP or from one', async () => {
    const { deps, memory } = makeDeps();
    await deps.db.recordRequest('203.0.113.7', '2026-10-13T09:00:00.000Z');
    await deps.db.recordRequest('203.0.113.7', '2026-10-14T09:30:00.000Z');
    await deps.db.recordRequest('198.51.100.1', '2026-10-14T09:40:00.000Z');
    await deps.db.recordRequest(null, '2026-10-14T09:50:00.000Z');
    expect(await deps.db.countRequestsSince('2026-10-14T09:00:00.000Z')).toBe(3);
    expect(await deps.db.countRequestsSince('2026-10-14T09:00:00.000Z', '203.0.113.7')).toBe(1);
    expect(await deps.db.countRequestsSince('2026-10-13T09:00:00.000Z', '203.0.113.7')).toBe(2);
    expect(await deps.db.deleteRequestsBefore('2026-10-14T09:00:00.000Z')).toBe(1);
    expect(memory.requests.map((r) => r.requested_at)).toEqual([
      '2026-10-14T09:30:00.000Z',
      '2026-10-14T09:40:00.000Z',
      '2026-10-14T09:50:00.000Z',
    ]);
  });

  it('skip a guarded update when the row changed since it was read', async () => {
    const { deps } = makeDeps();
    const row = await deps.db.insert({ email: 'a@example.com', status: 'pending', source: 'website' });
    await deps.db.update(row.id, { full_name: 'First' });
    expect(await deps.db.update(row.id, { full_name: 'Second' }, row.updated_at)).toBeNull();
    expect((await deps.db.findById(row.id))?.full_name).toBe('First');
  });

  it('put created contacts in the segment and page through it', async () => {
    const { deps, resend } = makeDeps();
    for (let i = 0; i < 150; i++) await deps.resend.createContact(`p${i}@example.com`, SEGMENT);
    const first = await deps.resend.listSegmentContacts(SEGMENT);
    const second = await deps.resend.listSegmentContacts(SEGMENT, first.contacts.at(-1)!.id);
    expect(first).toMatchObject({ hasMore: true });
    expect(first.contacts).toHaveLength(100);
    expect(second.contacts).toHaveLength(50);
    expect(second.hasMore).toBe(false);
    expect(resend.contacts.size).toBe(150);
  });
});
