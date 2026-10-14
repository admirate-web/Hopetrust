// @vitest-environment node
import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { verifyAdminToken } from '@/netlify/functions/_shared/admin.mts';
import { DuplicateEmailError, chunked, searchPattern } from '@/netlify/functions/_shared/newsletter-db.mts';
import { liveDeps } from '@/netlify/functions/_shared/newsletter-deps.mts';
import { SEGMENT, makeDeps } from './fakes';

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
