// @vitest-environment node
import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createNewsletterDb } from '@/netlify/functions/_shared/newsletter-db.mts';
import { createImageStorage, createIssuesDb } from '@/netlify/functions/_shared/newsletter-issues-db.mts';
import { createClock, createMemoryIssues } from './fakes';

/** A Supabase client that records every call and answers each query with `result`. */
function recording(result: { data: unknown; error: null } = { data: null, error: null }) {
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

describe('createIssuesDb queries', () => {
  it('lists the newest issues first, with the list columns only', async () => {
    const { client, calls } = recording({ data: [], error: null });
    await createIssuesDb(client).list();
    expect(calls).toEqual([
      ['from', 'newsletter_issues'],
      ['select', 'id, subject, issue_date, status, recipient_count, sent_at, last_error, updated_at'],
      ['order', 'created_at', { ascending: false }],
      ['order', 'id', { ascending: false }],
      ['limit', 200],
    ]);
  });

  it('saves a draft only while it is a draft, and unchanged since it was read', async () => {
    const { client, calls } = recording();
    await createIssuesDb(client).saveDraft('id-1', DRAFT, 'admin@x', '2026-10-14T10:00:00.000Z');
    expect(calls).toEqual([
      ['from', 'newsletter_issues'],
      ['update', { ...DRAFT, updated_by: 'admin@x' }],
      ['eq', 'id', 'id-1'],
      ['eq', 'status', 'draft'],
      ['eq', 'updated_at', '2026-10-14T10:00:00.000Z'],
      ['select', '*'],
      ['maybeSingle'],
    ]);
  });

  it('starts a send only from a draft, and finishes it only from sending or needs_check', async () => {
    const { client, calls } = recording();
    const db = createIssuesDb(client);
    await db.lockForSend('id-1', 'admin@x');
    await db.markSent('id-1', { resend_broadcast_id: 'b-1', recipient_count: 3, sent_at: '2026-10-14T10:00:00.000Z' });
    await db.backToDraft('id-1', 'x'.repeat(2500));
    await db.markNeedsCheck('id-1', 'unclear');
    expect(calls).toEqual([
      ['from', 'newsletter_issues'],
      ['update', { status: 'sending', sent_by: 'admin@x', last_error: null }],
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
      ['update', { status: 'draft', sent_by: null, last_error: 'x'.repeat(2000) }],
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
    const locked = await issues.lockForSend(draft.id, 'admin@x');
    expect(locked?.status).toBe('sending');
    expect(await issues.lockForSend(draft.id, 'admin@x')).toBeNull();
    expect(await issues.saveDraft(draft.id, DRAFT, 'admin@x', locked!.updated_at)).toBeNull();
    expect(await issues.deleteDraft(draft.id)).toBe(false);
    expect((await issues.markSent(draft.id, sent))?.status).toBe('sent');
  });
});
