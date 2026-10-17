// @vitest-environment node
// The send core shared by the admin send and the automatic send (fortnightly
// plan Task 6). The admin path's cases stay in issues.test.ts, through the API.
import { afterEach, describe, it, expect, vi } from 'vitest';
import { findBroadcast, sendLocked } from '@/netlify/functions/_shared/newsletter-send.mts';
import { ResendError } from '@/netlify/functions/_shared/resend.mts';
import { POSTS, makeDeps } from './fakes';

const POST = POSTS[1];
const BLOG = {
  subject: POST.title,
  preheader: '',
  issue_date: '2026-10-20',
  title: POST.title,
  hero_image_url: POST.image,
  hero_image_alt: POST.title,
  body: { type: 'doc' as const, content: [] },
  share_url: POST.url,
  kind: 'blog' as const,
  kicker: POST.kicker,
  intro: POST.intro,
  question: '',
  reading_minutes: POST.readingMinutes,
  post_slug: POST.slug,
  scheduled_for: '2026-10-20T04:30:00.000Z',
  status: 'scheduled' as const,
};
const AUTO = { syncPull: true, syncBudgetMs: 15_000, retryTo: 'scheduled' as const };

afterEach(() => {
  vi.restoreAllMocks();
});

async function lockedBlog() {
  const t = makeDeps();
  t.memory.seed({ email: 'asha@example.com', status: 'subscribed', consent_at: '2026-10-01T00:00:00.000Z' });
  const row = t.issueStore.seed(BLOG);
  const sending = (await t.deps.issues.lockForSend(row.id, 'automatic', 1, 'scheduled'))!;
  return { ...t, row, sending };
}

describe('sendLocked', () => {
  it('sends a locked blog issue with its number and the book panel, and records it', async () => {
    const t = await lockedBlog();
    await t.deps.settings.save(
      {
        ...(await t.deps.settings.get()),
        panel_enabled: true,
        panel_eyebrow: 'From Rahul Luther',
        panel_title: 'I, Bhogi',
        panel_text: 'A memoir of addiction, recovery and a life of purpose.',
        panel_link_text: 'Discover the book →',
        panel_url: 'https://example.com/i-bhogi',
      },
      'admin@x',
    );
    const out = await sendLocked(t.deps, t.sending, 'automatic', AUTO);
    expect(out).toMatchObject({ kind: 'sent', broadcastId: 'broadcast-1', recipients: 1 });
    expect(t.issueStore.get(t.row.id)).toMatchObject({ status: 'sent', issue_number: 1 });
    const html = t.resend.broadcasts[0].input?.html ?? '';
    expect(html).toContain('ISSUE 01');
    expect(html).toContain('I, Bhogi');
  });

  it('puts a blog issue back to scheduled while a subscriber change waits for Resend, so the next run retries', async () => {
    const t = await lockedBlog();
    t.resend.failNext('createContact', new ResendError(422, 'validation_error', 'Invalid email'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const out = await sendLocked(t.deps, t.sending, 'automatic', AUTO);
    expect(out.kind).toBe('retry');
    expect(t.issueStore.get(t.row.id)).toMatchObject({ status: 'scheduled', issue_number: null });
    expect(t.resend.broadcasts).toHaveLength(0);
  });

  it('puts a blog issue that has a problem back to draft, with the reason', async () => {
    const t = await lockedBlog();
    const out = await sendLocked(t.deps, { ...t.sending, intro: '' }, 'automatic', AUTO);
    expect(out).toMatchObject({ kind: 'blocked', status: 400, problems: ['Add an intro.'] });
    expect(t.issueStore.get(t.row.id)).toMatchObject({ status: 'draft', last_error: 'Add an intro.' });
  });
});

describe('findBroadcast', () => {
  it('answers null when the list ends without a match', async () => {
    const t = makeDeps();
    t.resend.addBroadcast({ name: 'Old', status: 'sent' });
    expect(await findBroadcast(t.deps, '[issue nope]')).toBeNull();
  });

  it('gives up with an error after 20 full pages, instead of answering "not found"', async () => {
    const t = makeDeps();
    for (let n = 0; n < 2001; n++) t.resend.addBroadcast({ name: `Old ${n}`, status: 'sent' });
    await expect(findBroadcast(t.deps, '[issue nope]')).rejects.toThrow(/2,000 broadcasts/);
  });
});
