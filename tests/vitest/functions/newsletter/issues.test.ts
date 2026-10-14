// @vitest-environment node
import { afterEach, describe, it, expect, vi } from 'vitest';
import type { NewsletterDeps } from '@/netlify/functions/_shared/newsletter-deps.mts';
import { handleAdminIssues } from '@/netlify/functions/_shared/newsletter-issues.mts';
import { ADMIN_EMAIL, ADMIN_TOKEN, IMAGES_BASE, jsonRequest, makeDeps } from './fakes';

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
