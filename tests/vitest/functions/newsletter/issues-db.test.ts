// @vitest-environment node
import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createNewsletterDb } from '@/netlify/functions/_shared/newsletter-db.mts';
import { createImageStorage, createIssuesDb } from '@/netlify/functions/_shared/newsletter-issues-db.mts';
import { createClock, createMemoryIssues } from './fakes';

/** A Supabase client that records every call and answers each query with `result`. */
function recording(result: { data: unknown; error: { code?: string; message: string } | null } = { data: null, error: null }) {
  const calls: unknown[][] = [];
  const builder: object = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') return (resolve: (value: unknown) => void) => resolve(result);
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
  return { client: client as unknown as SupabaseClient, calls };
}

const DRAFT = {
  subject: 'S',
  preheader: '',
  issue_date: '2026-10-14',
  title: 'T',
  hero_image_url: null,
  hero_image_alt: '',
  body: { type: 'doc' as const, content: [] },
  share_url: null,
};

const SLOT = '2026-10-20T04:30:00.000Z';
const BLOG = {
  ...DRAFT,
  kicker: 'A moment for yourself',
  intro: 'Before you can love, trust or know another person, you must first reconcile with yourself.',
  question: '',
  kind: 'blog' as const,
  post_slug: 'the-most-important-connection-you-can-have-with-yourself',
  reading_minutes: 9,
  scheduled_for: SLOT,
  status: 'scheduled' as const,
  reason: null,
};

describe('createIssuesDb queries', () => {
  it('lists the newest issues first, with the list columns only', async () => {
    const { client, calls } = recording({ data: [], error: null });
    await createIssuesDb(client).list();
    expect(calls).toEqual([
      ['from', 'newsletter_issues'],
      ['select', 'id, subject, issue_date, status, recipient_count, sent_at, last_error, updated_at, kind, scheduled_for, reason'],
      ['order', 'created_at', { ascending: false }],
      ['order', 'id', { ascending: false }],
      ['limit', 200],
    ]);
  });

  it('saves an issue only while it is a draft or scheduled, and unchanged since it was read', async () => {
    const { client, calls } = recording();
    await createIssuesDb(client).saveDraft('id-1', DRAFT, 'admin@x', '2026-10-14T10:00:00.000Z');
    expect(calls).toEqual([
      ['from', 'newsletter_issues'],
      ['update', { ...DRAFT, updated_by: 'admin@x' }],
      ['eq', 'id', 'id-1'],
      ['in', 'status', ['draft', 'scheduled']],
      ['eq', 'updated_at', '2026-10-14T10:00:00.000Z'],
      ['select', '*'],
      ['maybeSingle'],
    ]);
  });

  it('starts a send only from a draft, and finishes it only from sending or needs_check', async () => {
    const { client, calls } = recording();
    const db = createIssuesDb(client);
    await db.lockForSend('id-1', 'admin@x', 4, 'draft');
    await db.markSent('id-1', { resend_broadcast_id: 'b-1', recipient_count: 3, sent_at: '2026-10-14T10:00:00.000Z' });
    await db.backToDraft('id-1', 'x'.repeat(2500));
    await db.markNeedsCheck('id-1', 'unclear');
    expect(calls).toEqual([
      ['from', 'newsletter_issues'],
      ['update', { status: 'sending', sent_by: 'admin@x', last_error: null, issue_number: 4 }],
      ['eq', 'id', 'id-1'],
      ['eq', 'status', 'draft'],
      ['select', '*'],
      ['maybeSingle'],
      ['from', 'newsletter_issues'],
      ['update', { resend_broadcast_id: 'b-1', recipient_count: 3, sent_at: '2026-10-14T10:00:00.000Z', status: 'sent', last_error: null }],
      ['eq', 'id', 'id-1'],
      ['in', 'status', ['sending', 'needs_check']],
      ['select', '*'],
      ['maybeSingle'],
      ['from', 'newsletter_issues'],
      ['update', { status: 'draft', sent_by: null, last_error: 'x'.repeat(2000), issue_number: null }],
      ['eq', 'id', 'id-1'],
      ['in', 'status', ['sending', 'needs_check']],
      ['select', '*'],
      ['maybeSingle'],
      ['from', 'newsletter_issues'],
      ['update', { status: 'needs_check', last_error: 'unclear' }],
      ['eq', 'id', 'id-1'],
      ['eq', 'status', 'sending'],
      ['select', '*'],
      ['maybeSingle'],
    ]);
  });

  it('creates one blog row per send time, and answers null when another run made it first', async () => {
    const { client, calls } = recording({ data: { id: 'id-1' }, error: null });
    await createIssuesDb(client).createBlog(BLOG);
    expect(calls).toEqual([
      ['from', 'newsletter_issues'],
      ['insert', { ...BLOG, created_by: 'automatic', updated_by: 'automatic' }],
      ['select', '*'],
      ['single'],
    ]);
    const taken = recording({ data: null, error: { code: '23505', message: 'duplicate key value' } });
    expect(await createIssuesDb(taken.client).createBlog(BLOG)).toBeNull();
  });

  it('claims a preview only while no run has claimed it', async () => {
    const { client, calls } = recording({ data: [{ id: 'id-1' }], error: null });
    expect(await createIssuesDb(client).claimPreview('id-1', '2026-10-18T04:30:00.000Z')).toBe(true);
    expect(calls).toEqual([
      ['from', 'newsletter_issues'],
      ['update', { preview_sent_at: '2026-10-18T04:30:00.000Z' }],
      ['eq', 'id', 'id-1'],
      ['is', 'preview_sent_at', null],
      ['select', 'id'],
    ]);
  });

  it('deletes only drafts', async () => {
    const { client, calls } = recording({ data: [{ id: 'id-1' }], error: null });
    expect(await createIssuesDb(client).deleteDraft('id-1')).toBe(true);
    expect(calls).toEqual([
      ['from', 'newsletter_issues'],
      ['delete'],
      ['eq', 'id', 'id-1'],
      ['eq', 'status', 'draft'],
      ['select', 'id'],
    ]);
  });
});

describe('createImageStorage', () => {
  it('asks the image bucket for a signed upload URL and gives the public address', async () => {
    const asked: string[] = [];
    const client = {
      storage: {
        from(bucket: string) {
          asked.push(bucket);
          return {
            async createSignedUploadUrl(path: string) {
              asked.push(path);
              return { data: { path, token: 'tok', signedUrl: `https://abc.supabase.co/sign/${path}?token=tok` }, error: null };
            },
          };
        },
      },
    };
    const storage = createImageStorage(
      client as unknown as SupabaseClient,
      'https://abc.supabase.co/storage/v1/object/public/newsletter-images/',
    );
    expect(await storage.createUploadUrl('issues/i/a.jpg')).toEqual({
      path: 'issues/i/a.jpg',
      token: 'tok',
      signedUrl: 'https://abc.supabase.co/sign/issues/i/a.jpg?token=tok',
      publicUrl: 'https://abc.supabase.co/storage/v1/object/public/newsletter-images/issues/i/a.jpg',
    });
    expect(asked).toEqual(['newsletter-images', 'issues/i/a.jpg']);
  });
});

describe('the audit log', () => {
  it('records what kind of thing an entry is about', async () => {
    const { client, calls } = recording();
    await createNewsletterDb(client).audit({
      action: 'NEWSLETTER_SEND',
      actorEmail: 'a@x',
      resourceType: 'newsletter_issue',
      resourceId: 'id-1',
    });
    await createNewsletterDb(client).audit({ action: 'NEWSLETTER_EXPORT', actorEmail: 'a@x' });
    const inserts = calls.filter(([method]) => method === 'insert').map(([, row]) => (row as { resource_type: string }).resource_type);
    expect(inserts).toEqual(['newsletter_issue', 'newsletter_subscriber']);
  });
});

describe('the in-memory issues', () => {
  it('follow the same guards as the real table', async () => {
    const { issues } = createMemoryIssues(createClock().now);
    const draft = await issues.create(DRAFT, 'admin@x');
    const sent = { resend_broadcast_id: 'b', recipient_count: 1, sent_at: '2026-10-14T10:00:00.000Z' };
    expect(await issues.markSent(draft.id, sent)).toBeNull();
    expect(await issues.saveDraft(draft.id, DRAFT, 'admin@x', 'stale')).toBeNull();
    const locked = await issues.lockForSend(draft.id, 'admin@x', 1, 'draft');
    expect(locked?.status).toBe('sending');
    expect(await issues.lockForSend(draft.id, 'admin@x', 1, 'draft')).toBeNull();
    expect(await issues.saveDraft(draft.id, DRAFT, 'admin@x', locked!.updated_at)).toBeNull();
    expect(await issues.deleteDraft(draft.id)).toBe(false);
    expect((await issues.markSent(draft.id, sent))?.status).toBe('sent');
  });

  it('keep one blog row per send time', async () => {
    const { issues } = createMemoryIssues(createClock().now);
    expect((await issues.createBlog(BLOG))?.status).toBe('scheduled');
    expect(await issues.createBlog(BLOG)).toBeNull();
    expect((await issues.blogSlot(SLOT))?.post_slug).toBe(BLOG.post_slug);
    expect(await issues.blogSlot('2026-11-03T04:30:00.000Z')).toBeNull();
  });

  it('let one run claim the preview, and give it back when the email fails', async () => {
    const { issues } = createMemoryIssues(createClock().now);
    const row = (await issues.createBlog(BLOG))!;
    expect(await issues.claimPreview(row.id, '2026-10-18T04:30:00.000Z')).toBe(true);
    expect(await issues.claimPreview(row.id, '2026-10-18T04:45:00.000Z')).toBe(false);
    await issues.releasePreview(row.id);
    expect(await issues.claimPreview(row.id, '2026-10-18T05:00:00.000Z')).toBe(true);
  });

  it('lock a scheduled issue only from scheduled, with its number, and clear the number when it goes back', async () => {
    const { issues } = createMemoryIssues(createClock().now);
    const draft = await issues.create(DRAFT, 'admin@x');
    const blog = (await issues.createBlog(BLOG))!;
    expect(await issues.lockForSend(draft.id, 'automatic', 7, 'scheduled')).toBeNull();
    expect(await issues.lockForSend(blog.id, 'automatic', 7, 'scheduled')).toMatchObject({ status: 'sending', issue_number: 7 });
    expect(await issues.backToDraft(blog.id, 'Try again', 'scheduled')).toMatchObject({
      status: 'scheduled',
      issue_number: null,
      last_error: 'Try again',
    });
  });

  it('set an outcome only from the given statuses', async () => {
    const { issues } = createMemoryIssues(createClock().now);
    const blog = (await issues.createBlog(BLOG))!;
    expect(await issues.setOutcome(blog.id, ['draft'], 'skipped', 'No')).toBeNull();
    expect(await issues.setOutcome(blog.id, ['scheduled'], 'skipped', 'Skipped in /arel-ops by a@x.')).toMatchObject({
      status: 'skipped',
      reason: 'Skipped in /arel-ops by a@x.',
    });
  });

  it('find blog issues that are overdue or wait for a check', async () => {
    const store = createMemoryIssues(createClock().now);
    const late = store.seed({ kind: 'blog', status: 'scheduled', scheduled_for: '2026-10-06T04:30:00.000Z' });
    store.seed({ kind: 'blog', status: 'scheduled', scheduled_for: SLOT });
    const unclear = store.seed({ kind: 'blog', status: 'needs_check', scheduled_for: '2026-09-22T04:30:00.000Z' });
    store.seed({ kind: 'manual', status: 'needs_check' });
    expect((await store.issues.overdueScheduled('2026-10-19T00:00:00.000Z')).map((r) => r.id)).toEqual([late.id]);
    expect((await store.issues.blogNeedsCheck()).map((r) => r.id)).toEqual([unclear.id]);
  });

  it('report what went out: the last send, the posts, the photos newest first and the next number', async () => {
    const store = createMemoryIssues(createClock().now);
    expect(await store.issues.lastSentAt()).toBeNull();
    expect(await store.issues.nextIssueNumber()).toBe(1);
    store.seed({ status: 'sent', sent_at: '2026-10-06T04:31:00.000Z', post_slug: 'a', hero_image_url: 'https://x/1.jpg', issue_number: 1 });
    store.seed({ status: 'sent', sent_at: '2026-10-20T04:31:00.000Z', post_slug: 'b', hero_image_url: 'https://x/2.jpg', issue_number: 2 });
    store.seed({ status: 'draft', post_slug: 'c', hero_image_url: 'https://x/3.jpg' });
    expect(await store.issues.lastSentAt()).toBe('2026-10-20T04:31:00.000Z');
    expect((await store.issues.sentPostSlugs()).sort()).toEqual(['a', 'b']);
    expect(await store.issues.recentHeroImages(6)).toEqual(['https://x/2.jpg', 'https://x/1.jpg']);
    expect(await store.issues.recentHeroImages(1)).toEqual(['https://x/2.jpg']);
    expect(await store.issues.nextIssueNumber()).toBe(3);
  });
});
