// @vitest-environment node
import { afterEach, describe, it, expect, vi } from 'vitest';
import type { NewsletterDeps } from '@/netlify/functions/_shared/newsletter-deps.mts';
import { handleAdminIssues } from '@/netlify/functions/_shared/newsletter-issues.mts';
import { ResendError } from '@/netlify/functions/_shared/resend.mts';
import type { BodyDoc } from '@/lib/newsletter/content';
import { ADMIN_EMAIL, ADMIN_TOKEN, IMAGES_BASE, SEGMENT, jsonRequest, makeDeps } from './fakes';

const BASE = 'https://hopetrustindia.com/api/admin-newsletter-issues';
const AUTH = { authorization: `Bearer ${ADMIN_TOKEN}` };
const MISSING = '22222222-2222-4222-8222-222222222222';
const BODY = {
  type: 'doc' as const,
  content: [{ type: 'paragraph' as const, content: [{ type: 'text' as const, text: 'Before you can love, you must know yourself.' }] }],
};
/** Everything a send needs. */
const READY = {
  subject: 'Know thyself',
  preheader: '',
  issue_date: '2026-10-14',
  title: 'Know Thyself: The Start of Every Relationship',
  hero_image_url: `${IMAGES_BASE}/issues/hero.jpg`,
  hero_image_alt: 'A person by a window',
  body: BODY,
  share_url: null,
};

afterEach(() => {
  vi.restoreAllMocks();
});

async function call(deps: NewsletterDeps, method: string, query = '', body?: unknown) {
  const res = await handleAdminIssues(jsonRequest(`${BASE}${query}`, method, body, AUTH), deps);
  return { status: res.status, body: await res.json() };
}

describe('admin-newsletter-issues', () => {
  it('needs an admin token', async () => {
    const { deps } = makeDeps();
    expect((await handleAdminIssues(new Request(BASE), deps)).status).toBe(401);
    expect((await handleAdminIssues(new Request(BASE, { method: 'OPTIONS' }), deps)).status).toBe(204);
    expect((await handleAdminIssues(jsonRequest(BASE, 'GET', undefined, AUTH), null)).status).toBe(500);
  });

  it('lists issues newest first, with who is signed in, the sender and the subscriber count', async () => {
    const t = makeDeps();
    t.memory.seed({ email: 'a@example.com', status: 'subscribed' });
    t.memory.seed({ email: 'b@example.com', status: 'pending' });
    const older = t.issueStore.seed({ subject: 'September' });
    t.clock.advance(60_000);
    const newer = t.issueStore.seed({ subject: 'October' });
    const { status, body } = await call(t.deps, 'GET');
    expect(status).toBe(200);
    expect(body.issues.map((i: { id: string }) => i.id)).toEqual([newer.id, older.id]);
    expect(body.issues[0]).not.toHaveProperty('body');
    expect(body).toMatchObject({ me: ADMIN_EMAIL, from: 'Hope Trust <newsletter@hopetrustindia.com>', subscribed: 1 });
  });

  it('creates a draft dated today in India', async () => {
    const t = makeDeps();
    t.clock.advance(9 * 60 * 60_000); // 19:00 UTC on 14 Oct is 00:30 on 15 Oct in India
    const { status, body } = await call(t.deps, 'POST');
    expect(status).toBe(201);
    expect(body.issue).toMatchObject({
      status: 'draft',
      issue_date: '2026-10-15',
      subject: '',
      body: { type: 'doc', content: [] },
      created_by: ADMIN_EMAIL,
    });
  });

  it('opens one issue, or says it is missing', async () => {
    const t = makeDeps();
    const issue = t.issueStore.seed(READY);
    const found = await call(t.deps, 'GET', `?id=${issue.id}`);
    expect(found.body.issue).toMatchObject(READY);
    expect(found.body.me).toBe(ADMIN_EMAIL);
    expect((await call(t.deps, 'GET', `?id=${MISSING}`)).status).toBe(404);
    expect((await call(t.deps, 'GET', '?id=nope')).status).toBe(400);
  });

  it('saves a draft, cleaning the body and the one-line fields', async () => {
    const t = makeDeps();
    const issue = t.issueStore.seed();
    const body = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Hi', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] },
        { type: 'codeBlock', content: [{ type: 'text', text: 'x' }] },
      ],
    };
    const res = await call(t.deps, 'PATCH', `?id=${issue.id}`, {
      ...READY,
      subject: '  Know thyself\n',
      body,
      updated_at: issue.updated_at,
    });
    expect(res.status).toBe(200);
    expect(res.body.issue.subject).toBe('Know thyself');
    expect(res.body.issue.body).toEqual({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] }] });
    expect(res.body.issue.updated_by).toBe(ADMIN_EMAIL);
    expect(res.body.issue.updated_at).not.toBe(issue.updated_at);
  });

  it('refuses to overwrite a save made after the editor loaded the issue', async () => {
    const t = makeDeps();
    const issue = t.issueStore.seed();
    const mine = await call(t.deps, 'PATCH', `?id=${issue.id}`, { ...READY, title: 'Mine', updated_at: issue.updated_at });
    expect(mine.status).toBe(200);
    const theirs = await call(t.deps, 'PATCH', `?id=${issue.id}`, { ...READY, title: 'Theirs', updated_at: issue.updated_at });
    expect(theirs.status).toBe(409);
    expect(theirs.body.error).toMatch(/Reload/);
    expect(theirs.body.issue.title).toBe('Mine');
    expect(t.issueStore.get(issue.id)?.title).toBe('Mine');
  });

  it('keeps sent issues read-only', async () => {
    const t = makeDeps();
    const issue = t.issueStore.seed({ ...READY, status: 'sent' });
    const res = await call(t.deps, 'PATCH', `?id=${issue.id}`, { ...READY, title: 'Changed', updated_at: issue.updated_at });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('This issue has been sent, so it can no longer be changed.');
    expect((await call(t.deps, 'POST', `?id=${issue.id}&action=upload-url`, { content_type: 'image/jpeg' })).status).toBe(409);
  });

  it.each([
    [{ subject: 'x'.repeat(151) }, 'The subject can be at most 150 characters.'],
    [{ issue_date: '2026-02-30' }, 'Choose a real date.'],
    [{ share_url: 'javascript:alert(1)' }, 'The Share link must be a web address, such as https://hopetrustindia.com/blogs/…'],
  ])('rejects %o', async (change, error) => {
    const t = makeDeps();
    const issue = t.issueStore.seed();
    const res = await call(t.deps, 'PATCH', `?id=${issue.id}`, { ...READY, ...change, updated_at: issue.updated_at });
    expect(res).toEqual({ status: 400, body: { error } });
  });

  it('deletes drafts only, and records it', async () => {
    const t = makeDeps();
    const draft = t.issueStore.seed({ subject: 'Old idea' });
    const sent = t.issueStore.seed({ ...READY, status: 'sent' });
    expect((await call(t.deps, 'DELETE', `?id=${draft.id}`)).status).toBe(200);
    expect(t.issueStore.get(draft.id)).toBeUndefined();
    expect(t.memory.audits).toContainEqual(
      expect.objectContaining({
        action: 'NEWSLETTER_ISSUE_DELETE',
        actorEmail: ADMIN_EMAIL,
        resourceType: 'newsletter_issue',
        resourceId: draft.id,
      }),
    );
    expect((await call(t.deps, 'DELETE', `?id=${sent.id}`)).status).toBe(409);
    expect(t.issueStore.get(sent.id)).toBeDefined();
    expect((await call(t.deps, 'DELETE', `?id=${MISSING}`)).status).toBe(404);
  });

  it("hands out an upload URL inside the issue's folder, for JPEG and PNG only", async () => {
    const t = makeDeps();
    const issue = t.issueStore.seed();
    const jpeg = await call(t.deps, 'POST', `?id=${issue.id}&action=upload-url`, { content_type: 'image/jpeg' });
    expect(jpeg.status).toBe(200);
    expect(jpeg.body.path).toMatch(new RegExp(`^issues/${issue.id}/[0-9a-f-]{36}\\.jpg$`));
    expect(jpeg.body.public_url).toBe(`${IMAGES_BASE}/${jpeg.body.path}`);
    expect(jpeg.body.token).toBe('token-1');
    const png = await call(t.deps, 'POST', `?id=${issue.id}&action=upload-url`, { content_type: 'image/png' });
    expect(png.body.path).toMatch(/\.png$/);
    expect((await call(t.deps, 'POST', `?id=${issue.id}&action=upload-url`, { content_type: 'image/webp' })).status).toBe(400);
  });
});

/** An issue ready to go, and one subscriber whose consent hasn't reached Resend yet. */
function ready() {
  const t = makeDeps();
  t.memory.seed({ email: 'asha@example.com', status: 'subscribed', consent_at: '2026-10-01T00:00:00.000Z' });
  const issue = t.issueStore.seed(READY);
  return { ...t, issue };
}

describe('test send', () => {
  it('emails the test version to up to five addresses, with [TEST] in the subject', async () => {
    const t = makeDeps();
    const issue = t.issueStore.seed(READY);
    const res = await call(t.deps, 'POST', `?id=${issue.id}&action=test`, {
      to: [' Asha@Example.com ', 'asha@example.com', 'ravi@example.com'],
    });
    expect(res).toEqual({ status: 200, body: { ok: true, to: ['asha@example.com', 'ravi@example.com'] } });
    expect(t.resend.sent).toHaveLength(1);
    const email = t.resend.sent[0];
    expect(email).toMatchObject({
      from: 'Hope Trust <newsletter@hopetrustindia.com>',
      to: ['asha@example.com', 'ravi@example.com'],
      replyTo: 'frontoffice@hopetrustindia.com',
      subject: '[TEST] Know thyself',
    });
    expect(email.html).toContain('Know Thyself: The Start of Every Relationship');
    expect(email.html).not.toContain('{{{RESEND_UNSUBSCRIBE_URL}}}');
    expect(t.memory.audits).toContainEqual(
      expect.objectContaining({ action: 'NEWSLETTER_TEST_SEND', resourceId: issue.id, metadata: { recipients: 2 } }),
    );
  });

  it.each([
    [{ to: [] }, 'Add at least one address.'],
    [{ to: ['a@x.com', 'b@x.com', 'c@x.com', 'd@x.com', 'e@x.com', 'f@x.com'] }, 'Send a test to at most 5 addresses.'],
    [{ to: ['not-an-address'] }, '"not-an-address" isn\'t a valid email address.'],
  ])('refuses %o', async (body, error) => {
    const t = makeDeps();
    const issue = t.issueStore.seed(READY);
    expect(await call(t.deps, 'POST', `?id=${issue.id}&action=test`, body)).toEqual({ status: 400, body: { error } });
    expect(t.resend.sent).toHaveLength(0);
  });

  it('says so when Resend fails', async () => {
    const t = makeDeps();
    const issue = t.issueStore.seed(READY);
    t.resend.failNext('sendEmail');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await call(t.deps, 'POST', `?id=${issue.id}&action=test`, { to: ['asha@example.com'] });
    expect(res).toEqual({ status: 502, body: { error: "Resend didn't send the test: Resend is down" } });
  });
});

describe('send', () => {
  it('syncs, then sends the send version to the Newsletter segment as one broadcast', async () => {
    const t = ready();
    const res = await call(t.deps, 'POST', `?id=${t.issue.id}&action=send`);
    expect(res.status).toBe(200);
    expect(res.body.issue).toMatchObject({
      status: 'sent',
      resend_broadcast_id: 'broadcast-1',
      recipient_count: 1,
      sent_by: ADMIN_EMAIL,
      sent_at: '2026-10-14T10:00:00.000Z',
      last_error: null,
    });
    // The subscriber reached Resend before the broadcast went out.
    expect(t.resend.calls.indexOf('createContact')).toBeLessThan(t.resend.calls.indexOf('sendBroadcast'));
    const [broadcast] = t.resend.broadcasts;
    expect(broadcast.input).toMatchObject({
      segmentId: SEGMENT,
      from: 'Hope Trust <newsletter@hopetrustindia.com>',
      replyTo: 'frontoffice@hopetrustindia.com',
      subject: 'Know thyself',
      name: `Know thyself [issue ${t.issue.id}]`,
    });
    expect(broadcast.input?.html).toContain('{{{RESEND_UNSUBSCRIBE_URL}}}');
    expect(t.memory.audits).toContainEqual(
      expect.objectContaining({
        action: 'NEWSLETTER_SEND',
        resourceId: t.issue.id,
        metadata: { broadcast_id: 'broadcast-1', recipients: 1 },
      }),
    );
  });

  it('lets only one of two simultaneous sends through', async () => {
    const t = ready();
    const [a, b] = await Promise.all([
      call(t.deps, 'POST', `?id=${t.issue.id}&action=send`),
      call(t.deps, 'POST', `?id=${t.issue.id}&action=send`),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(t.resend.broadcasts).toHaveLength(1);
  });

  it.each([
    ['there is no hero photo', { hero_image_url: null }, 'Add a hero photo.'],
    ['the photo has no description', { hero_image_alt: '' }, "Describe the hero photo for people who can't see it."],
    ['the subject is empty', { subject: '' }, 'Add a subject.'],
    ['the title is blank', { title: ' ' }, 'Add a title.'],
  ])('puts the issue back when %s', async (_why, change, problem) => {
    const t = makeDeps();
    t.memory.seed({ email: 'asha@example.com', status: 'subscribed' });
    const issue = t.issueStore.seed({ ...READY, ...change });
    const res = await call(t.deps, 'POST', `?id=${issue.id}&action=send`);
    expect(res.status).toBe(400);
    expect(res.body.problems).toEqual([problem]);
    expect(res.body.issue).toMatchObject({ status: 'draft', last_error: problem, sent_by: null });
    expect(t.resend.broadcasts).toHaveLength(0);
  });

  it('refuses when there is nobody to send to', async () => {
    const t = makeDeps();
    const issue = t.issueStore.seed(READY);
    const res = await call(t.deps, 'POST', `?id=${issue.id}&action=send`);
    expect(res.body.problems).toEqual(['There are no subscribers to send to.']);
    expect(t.issueStore.get(issue.id)?.status).toBe('draft');
  });

  it('refuses an email over the size limit', async () => {
    const t = ready();
    const long: BodyDoc = {
      type: 'doc',
      content: Array.from({ length: 400 }, (_, n) => ({
        type: 'paragraph' as const,
        content: [{ type: 'text' as const, text: `${n} ${'word '.repeat(60)}` }],
      })),
    };
    const issue = t.issueStore.seed({ ...READY, body: long });
    const res = await call(t.deps, 'POST', `?id=${issue.id}&action=send`);
    expect(res.status).toBe(400);
    expect(res.body.problems[0]).toMatch(/^The email is \d+\.\d KB, over the 95\.0 KB limit/);
    expect(t.resend.broadcasts).toHaveLength(0);
  });

  it("sends nothing while a subscriber change can't reach Resend, and names it", async () => {
    const t = ready();
    t.resend.failNext('createContact', new ResendError(422, 'validation_error', 'Invalid email'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await call(t.deps, 'POST', `?id=${t.issue.id}&action=send`);
    expect(res.status).toBe(409);
    expect(res.body.error).toContain("1 subscriber change hasn't reached Resend yet, so nothing was sent.");
    expect(res.body.error).toContain('asha@example.com: Invalid email');
    expect(res.body.issue.status).toBe('draft');
    expect(t.resend.broadcasts).toHaveLength(0);
  });

  it('puts the issue back when Resend refuses the broadcast', async () => {
    const t = ready();
    t.resend.failNext('sendBroadcast', new ResendError(422, 'validation_error', 'The from address is not verified'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await call(t.deps, 'POST', `?id=${t.issue.id}&action=send`);
    expect(res.status).toBe(502);
    expect(res.body.issue).toMatchObject({
      status: 'draft',
      last_error: 'Resend refused the newsletter, so nothing was sent: The from address is not verified',
    });
  });

  it("waits for Check status when Resend's answer is unclear, and won't send again meanwhile", async () => {
    const t = ready();
    t.resend.failNext('sendBroadcast');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await call(t.deps, 'POST', `?id=${t.issue.id}&action=send`);
    expect(res.status).toBe(502);
    expect(res.body.issue.status).toBe('needs_check');
    expect(res.body.error).toMatch(/Check status/);
    const again = await call(t.deps, 'POST', `?id=${t.issue.id}&action=send`);
    expect(again.status).toBe(409);
    expect(t.resend.calls.filter((c) => c === 'sendBroadcast')).toHaveLength(1);
  });

  it('never puts back an issue that went out, even if recording it fails', async () => {
    const t = ready();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const deps: NewsletterDeps = {
      ...t.deps,
      issues: {
        ...t.deps.issues,
        markSent: async () => {
          throw new Error('Supabase is down');
        },
      },
    };
    const res = await call(deps, 'POST', `?id=${t.issue.id}&action=send`);
    expect(res.status).toBe(200);
    expect(res.body.warning).toMatch(/Check status/);
    expect(t.issueStore.get(t.issue.id)?.status).toBe('sending');
  });
});

describe('check status', () => {
  it('marks the issue sent when Resend has the broadcast', async () => {
    const t = ready();
    t.resend.loseNextReply();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await call(t.deps, 'POST', `?id=${t.issue.id}&action=send`)).body.issue.status).toBe('needs_check');
    const res = await call(t.deps, 'POST', `?id=${t.issue.id}&action=check`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      found: true,
      issue: { status: 'sent', resend_broadcast_id: 'broadcast-1', recipient_count: 1 },
    });
    expect(t.memory.audits).toContainEqual(
      expect.objectContaining({ action: 'NEWSLETTER_SEND_CONFIRMED', resourceId: t.issue.id }),
    );
  });

  it('puts the issue back when Resend has no such broadcast', async () => {
    const t = makeDeps();
    const issue = t.issueStore.seed({ ...READY, status: 'needs_check' });
    t.resend.addBroadcast({ name: `Other [issue ${MISSING}]`, status: 'sent' });
    t.resend.addBroadcast({ name: `Know thyself [issue ${issue.id}]`, status: 'draft' });
    const res = await call(t.deps, 'POST', `?id=${issue.id}&action=check`);
    expect(res.body).toMatchObject({ found: false, issue: { status: 'draft' } });
    expect(res.body.issue.last_error).toMatch(/no record of this send/);
  });

  it('looks through every page of broadcasts', async () => {
    const t = makeDeps();
    const issue = t.issueStore.seed({ ...READY, status: 'needs_check' });
    t.resend.addBroadcast({ name: `Know thyself [issue ${issue.id}]`, status: 'sent' });
    for (let n = 0; n < 150; n++) t.resend.addBroadcast({ name: `Old ${n}`, status: 'sent' });
    expect((await call(t.deps, 'POST', `?id=${issue.id}&action=check`)).body.found).toBe(true);
    expect(t.resend.calls.filter((c) => c === 'listBroadcasts')).toHaveLength(2);
  });

  it('lets a send that went quiet be checked after two minutes, not before', async () => {
    const t = makeDeps();
    const issue = t.issueStore.seed({ ...READY, status: 'sending' });
    const early = await call(t.deps, 'POST', `?id=${issue.id}&action=check`);
    expect(early.status).toBe(409);
    expect(early.body.error).toBe('This issue is still being sent. Check again in two minutes.');
    t.clock.advance(2 * 60_000);
    const later = await call(t.deps, 'POST', `?id=${issue.id}&action=check`);
    expect(later.body).toMatchObject({ found: false, issue: { status: 'draft' } });
  });

  it('has nothing to check on a draft', async () => {
    const t = makeDeps();
    const issue = t.issueStore.seed(READY);
    expect((await call(t.deps, 'POST', `?id=${issue.id}&action=check`)).status).toBe(409);
  });
});
