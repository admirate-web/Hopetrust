// @vitest-environment node
// The automatic fortnightly newsletter (fortnightly spec §5.3–5.6, plan Task 7).
// First send date Tue 20 Oct 2026: the preview window opens Sun 18 Oct 04:30 UTC
// (10:00 India), the send is Tue 20 Oct 04:30 UTC, and it may run until 07:30.
import { afterEach, describe, it, expect, vi } from 'vitest';
import { runAutomatic } from '@/netlify/functions/_shared/newsletter-auto.mts';
import { DEFAULT_SETTINGS } from '@/lib/newsletter/settings';
import { POSTS, makeDeps } from './fakes';

const SLOT = '2026-10-20T04:30:00.000Z';
const PREVIEW_AT = '2026-10-18T04:30:00.000Z';
const NEXT_SLOT = '2026-11-03T04:30:00.000Z';

afterEach(() => {
  vi.restoreAllMocks();
});

async function setup(opts: { subscribers?: boolean; on?: boolean } = {}) {
  const t = makeDeps();
  if (opts.subscribers !== false) {
    t.memory.seed({ email: 'asha@example.com', status: 'subscribed', consent_at: '2026-10-01T00:00:00.000Z' });
  }
  await t.deps.settings.save({ ...DEFAULT_SETTINGS, auto_enabled: opts.on !== false, first_send_date: '2026-10-20' }, 'admin@x');
  const goTo = (iso: string) => t.clock.advance(Date.parse(iso) - t.clock.now().getTime());
  const run = (env: Record<string, string | undefined> = {}) => runAutomatic(t.deps, env);
  const blogRows = () => Array.from(t.issueStore.rows.values()).filter((r) => r.kind === 'blog');
  const subjects = () => t.resend.sent.map((e) => e.subject);
  return { ...t, goTo, run, blogRows, subjects };
}

/** Runs the preview, then moves to the send time. */
async function previewed(opts: { subscribers?: boolean } = {}) {
  const t = await setup(opts);
  t.goTo(PREVIEW_AT);
  await t.run();
  return t;
}

describe('the preview window', () => {
  it('does nothing before it opens', async () => {
    const t = await setup();
    t.goTo('2026-10-18T04:29:00.000Z');
    expect((await t.run()).actions).toEqual([]);
    expect(t.blogRows()).toHaveLength(0);
    expect(t.resend.sent).toHaveLength(0);
  });

  it('schedules the newest unsent post with a photo, and emails the preview to the preview list', async () => {
    const t = await setup();
    t.goTo(PREVIEW_AT);
    await t.run();
    const [row] = t.blogRows();
    expect(row).toMatchObject({
      status: 'scheduled',
      scheduled_for: SLOT,
      post_slug: POSTS[1].slug,
      title: POSTS[1].title,
      intro: POSTS[1].intro,
      issue_date: '2026-10-20',
      preview_sent_at: PREVIEW_AT,
      created_by: 'automatic',
    });
    expect(t.resend.sent).toHaveLength(1);
    expect(t.resend.sent[0]).toMatchObject({
      to: ['essentials@admirate.in'],
      subject: `[Preview] Tue 20 Oct: ${POSTS[1].title}`,
    });
    expect(t.resend.sent[0].html).toContain('This goes to 1 subscriber on Tue 20 Oct, 10:00 am India time.');
    expect(t.resend.sent[0].html).toContain('ISSUE 01');
    expect(t.memory.audits).toContainEqual(expect.objectContaining({ action: 'NEWSLETTER_AUTO_PREVIEW', actorEmail: 'automatic' }));
  });

  it('makes one row and one preview when two runs overlap, and nothing more on a later run', async () => {
    const t = await setup();
    t.goTo(PREVIEW_AT);
    await Promise.all([t.run(), t.run()]);
    t.goTo('2026-10-18T04:45:00.000Z');
    await t.run();
    expect(t.blogRows()).toHaveLength(1);
    expect(t.resend.sent).toHaveLength(1);
  });

  it('gives the claim back when the preview email fails, so the next run retries', async () => {
    const t = await setup();
    t.goTo(PREVIEW_AT);
    t.resend.failNext('sendEmail');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await t.run();
    expect(t.blogRows()[0].preview_sent_at).toBeNull();
    t.goTo('2026-10-18T04:45:00.000Z');
    await t.run();
    expect(t.blogRows()[0].preview_sent_at).toBe('2026-10-18T04:45:00.000Z');
    expect(t.resend.sent).toHaveLength(1);
  });

  it('sends a skip note when a newsletter went out less than 14 days before, then previews the next one normally', async () => {
    const t = await setup();
    t.issueStore.seed({ status: 'sent', sent_at: '2026-10-12T10:00:00.000Z', issue_number: 1, subject: 'By hand' });
    t.goTo(PREVIEW_AT);
    await t.run();
    expect(t.blogRows()[0]).toMatchObject({ status: 'skipped', reason: 'A newsletter went out on Mon 12 Oct, less than 14 days before.' });
    expect(t.subjects()).toEqual(['[The Hope Letter] No newsletter on Tue 20 Oct']);
    expect(t.resend.sent[0].html).toContain('A newsletter went out on Mon 12 Oct, less than 14 days before.');
    t.goTo('2026-11-01T04:30:00.000Z');
    await t.run();
    const next = t.blogRows().find((r) => r.scheduled_for === NEXT_SLOT);
    expect(next).toMatchObject({ status: 'scheduled', post_slug: POSTS[1].slug });
    expect(t.subjects()[1]).toBe(`[Preview] Tue 3 Nov: ${POSTS[1].title}`);
  });

  it('sends a skip note when there are no subscribers', async () => {
    const t = await previewed({ subscribers: false });
    expect(t.blogRows()[0]).toMatchObject({ status: 'skipped', reason: 'There are no subscribers.' });
    expect(t.subjects()).toEqual(['[The Hope Letter] No newsletter on Tue 20 Oct']);
  });
});

describe('the send', () => {
  it('sends at its time with the next number, tells staff, and does nothing more on a later run', async () => {
    const t = await previewed();
    t.goTo(SLOT);
    await t.run();
    expect(t.blogRows()[0]).toMatchObject({ status: 'sent', issue_number: 1, sent_by: 'automatic' });
    expect(t.resend.broadcasts).toHaveLength(1);
    expect(t.resend.broadcasts[0].input?.html).toContain('ISSUE 01');
    expect(t.subjects()[1]).toBe('[The Hope Letter] Sent to 1 subscriber');
    expect(t.memory.audits).toContainEqual(expect.objectContaining({ action: 'NEWSLETTER_SEND', actorEmail: 'automatic' }));
    t.goTo('2026-10-20T04:45:00.000Z');
    await t.run();
    expect(t.resend.broadcasts).toHaveLength(1);
  });

  it('sends nothing when switched off after the preview: the issue becomes a draft', async () => {
    const t = await previewed();
    await t.deps.settings.save({ ...(await t.deps.settings.get()), auto_enabled: false }, 'admin@x');
    t.goTo(SLOT);
    await t.run();
    expect(t.blogRows()[0]).toMatchObject({ status: 'draft', reason: 'Automatic sending was switched off.' });
    expect(t.resend.broadcasts).toHaveLength(0);
  });

  it('counts a send still unconfirmed for the 14-day gap: an unclear manual send the day before stops it', async () => {
    const t = await previewed();
    t.goTo('2026-10-19T10:00:00.000Z');
    t.issueStore.seed({ status: 'needs_check', subject: 'By hand' });
    t.goTo(SLOT);
    await t.run();
    expect(t.blogRows()[0]).toMatchObject({ status: 'skipped', reason: 'A newsletter went out on Mon 19 Oct, less than 14 days before.' });
    expect(t.resend.broadcasts).toHaveLength(0);
  });

  it("marks an issue whose preview never went out as missed, and doesn't send it", async () => {
    const t = await setup();
    t.issueStore.seed({ kind: 'blog', status: 'scheduled', scheduled_for: SLOT, preview_sent_at: null, subject: 'S', title: 'T' });
    t.goTo(SLOT);
    await t.run();
    expect(t.blogRows()[0]).toMatchObject({ status: 'missed', reason: "The preview email didn't go out, so it wasn't sent." });
    expect(t.resend.broadcasts).toHaveLength(0);
    expect(t.subjects()).toEqual(['[The Hope Letter] Missed: Tue 20 Oct']);
  });

  it('marks an issue more than 3 hours late as missed', async () => {
    const t = await previewed();
    t.goTo('2026-10-20T07:31:00.000Z');
    await t.run();
    expect(t.blogRows()[0]).toMatchObject({ status: 'missed', reason: "It was more than 3 hours late, so it wasn't sent." });
    expect(t.resend.broadcasts).toHaveLength(0);
  });

  it('puts an issue with a problem back to draft and tells staff why', async () => {
    const t = await previewed();
    const row = t.blogRows()[0];
    t.issueStore.rows.set(row.id, { ...row, intro: '' });
    t.goTo(SLOT);
    await t.run();
    expect(t.blogRows()[0]).toMatchObject({ status: 'draft', last_error: 'Add an intro.' });
    expect(t.subjects()[1]).toBe('[The Hope Letter] Not sent: Add an intro.');
  });

  it("leaves an unclear send for the next run, which finds it in Resend's list", async () => {
    const t = await previewed();
    t.goTo(SLOT);
    t.resend.loseNextReply();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await t.run();
    expect(t.blogRows()[0].status).toBe('needs_check');
    t.goTo('2026-10-20T04:45:00.000Z');
    await t.run();
    expect(t.blogRows()[0]).toMatchObject({ status: 'sent', resend_broadcast_id: 'broadcast-1' });
    expect(t.resend.broadcasts).toHaveLength(1);
  });
});

describe('the clock', () => {
  it('honours NEWSLETTER_AUTO_NOW only under netlify dev', async () => {
    const t = await setup();
    await t.run({ NEWSLETTER_AUTO_NOW: '2026-10-18T05:00:00.000Z' });
    expect(t.blogRows()).toHaveLength(0);
    await t.run({ NEWSLETTER_AUTO_NOW: '2026-10-18T05:00:00.000Z', NETLIFY_DEV: 'true' });
    expect(t.blogRows()).toHaveLength(1);
    expect(t.blogRows()[0].preview_sent_at).toBe('2026-10-18T05:00:00.000Z');
  });
});
