// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { handleAdminSubscribers } from '@/netlify/functions/_shared/newsletter-admin.mts';
import { hashEmail } from '@/netlify/functions/_shared/newsletter-crypto.mts';
import type { NewsletterDeps } from '@/netlify/functions/_shared/newsletter-deps.mts';
import { ADMIN_EMAIL, ADMIN_TOKEN, SEGMENT, jsonRequest, makeDeps } from './fakes';

const BASE = 'https://hopetrustindia.com/api/admin-newsletter-subscribers';
const AUTH = { authorization: `Bearer ${ADMIN_TOKEN}` };
const BATCH = '2f1c7c1e-3f5a-4a52-9a0e-6c1f3b9d2a10';
const STATEMENT = 'Clients who ticked the newsletter box on the intake form, 2025–26';

function call(deps: NewsletterDeps, method: string, query = '', body?: unknown) {
  return handleAdminSubscribers(jsonRequest(`${BASE}${query}`, method, body, AUTH), deps);
}

const importBody = (rows: Array<{ email: string; name?: string | null }>) => ({
  batch_id: BATCH,
  statement: STATEMENT,
  attested: true,
  rows,
});

describe('admin-newsletter-subscribers', () => {
  it('needs an admin token', async () => {
    const { deps } = makeDeps();
    expect((await handleAdminSubscribers(new Request(BASE), deps)).status).toBe(401);
    expect((await handleAdminSubscribers(new Request(BASE, { method: 'OPTIONS' }), deps)).status).toBe(204);
    expect((await call(null as unknown as NewsletterDeps, 'GET')).status).toBe(500);
  });

  it('lists subscribers newest first, without the confirmation token, with counts', async () => {
    const { deps, memory, clock } = makeDeps();
    memory.seed({ email: 'old@example.com', status: 'pending', confirm_token_hash: 'f'.repeat(64) });
    clock.advance(1000);
    memory.seed({ email: 'mid@example.com', status: 'subscribed' });
    clock.advance(1000);
    memory.seed({ email: 'new@example.com', status: 'unsubscribed' });

    const res = await call(deps, 'GET');
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.subscribers.map((s: { email: string }) => s.email)).toEqual(['new@example.com', 'mid@example.com', 'old@example.com']);
    expect(body.subscribers[2]).not.toHaveProperty('confirm_token_hash');
    expect(body).toMatchObject({ total: 3, counts: { pending: 1, subscribed: 1, unsubscribed: 1 }, needs_push: 2, limit: 25, offset: 0 });
  });

  it('filters by status, source and search, and caps the page size at 100', async () => {
    const { deps, memory } = makeDeps();
    memory.seed({ email: 'asha@example.com', full_name: 'Asha Rao', source: 'import' });
    memory.seed({ email: 'ravi@example.com', status: 'unsubscribed' });
    const emails = async (query: string) =>
      (await (await call(deps, 'GET', query)).json()).subscribers.map((s: { email: string }) => s.email);
    expect(await emails('?status=unsubscribed')).toEqual(['ravi@example.com']);
    expect(await emails('?source=import')).toEqual(['asha@example.com']);
    expect(await emails('?q=asha%20rao')).toEqual(['asha@example.com']);
    expect(await emails('?status=bogus')).toHaveLength(2);
    expect((await (await call(deps, 'GET', '?limit=500')).json()).limit).toBe(100);
  });

  it('exports a formula-safe CSV that Excel reads as UTF-8', async () => {
    const { deps, memory } = makeDeps();
    memory.seed({ email: 'x@example.com', full_name: '=HYPERLINK("http://x","click")' });
    memory.seed({ email: 'ravi@example.com', full_name: 'రవి' });

    const res = await call(deps, 'GET', '?format=csv');
    const bytes = new Uint8Array(await res.arrayBuffer());
    const text = new TextDecoder().decode(bytes);
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename="newsletter-subscribers-\d{4}-\d{2}-\d{2}\.csv"$/);
    const lines = text.trim().split('\r\n');
    expect(lines[0]).toBe(
      'email,full_name,status,source,consent_at,consent_note,imported_by,import_batch_id,signup_page,signup_ip,signup_user_agent,signup_notice,unsubscribed_at,unsubscribe_source,created_at',
    );
    expect(lines[1]).toContain(`"'=HYPERLINK(""http://x"",""click"")"`);
    expect(lines[2]).toContain('రవి');
    expect(memory.audits).toEqual([expect.objectContaining({ action: 'NEWSLETTER_EXPORT', actorEmail: ADMIN_EMAIL, metadata: expect.objectContaining({ rows: 2 }) })]);
  });

  it('imports new addresses as subscribed, with the consent evidence', async () => {
    const { deps, memory } = makeDeps();
    const res = await call(deps, 'POST', '?action=import', importBody([
      { email: ' Asha@Example.com ', name: 'Asha Rao' },
      { email: 'not-an-email' },
      { email: 'asha@example.com', name: 'Asha again' },
      { email: 'Ravi <ravi@example.com>', name: 'రవి' },
    ]));
    expect(await res.json()).toEqual({ inserted: 2, skipped_existing: 0, skipped_erased: 0, invalid: 1, duplicates: 1 });
    expect(memory.byEmail('asha@example.com')).toMatchObject({
      status: 'subscribed',
      source: 'import',
      full_name: 'Asha Rao',
      consent_at: deps.now().toISOString(),
      consent_note: STATEMENT,
      imported_by: ADMIN_EMAIL,
      import_batch_id: BATCH,
      resend_synced_at: null,
    });
    expect(memory.audits[0]).toMatchObject({ action: 'NEWSLETTER_IMPORT', metadata: expect.objectContaining({ batch_id: BATCH, inserted: 2 }) });
  });

  it('never changes rows that already exist, whatever their status, and skips erased addresses', async () => {
    const { deps, memory } = makeDeps();
    memory.seed({ email: 'left@example.com', status: 'unsubscribed', consent_note: 'Old consent' });
    memory.seed({ email: 'on@example.com', status: 'subscribed' });
    memory.erased.add(hashEmail('gone@example.com'));
    const rows = [{ email: 'left@example.com' }, { email: 'on@example.com' }, { email: 'gone@example.com' }, { email: 'new@example.com' }];

    expect(await (await call(deps, 'POST', '?action=import', importBody(rows))).json()).toEqual({
      inserted: 1, skipped_existing: 2, skipped_erased: 1, invalid: 0, duplicates: 0,
    });
    expect(memory.byEmail('left@example.com')).toMatchObject({ status: 'unsubscribed', consent_note: 'Old consent' });
    expect(memory.byEmail('gone@example.com')).toBeUndefined();

    // The same file again changes nothing.
    expect(await (await call(deps, 'POST', '?action=import', importBody(rows))).json()).toMatchObject({ inserted: 0, skipped_existing: 3 });
  });

  it('refuses an import without a statement, the tick or a batch id, or with too many rows', async () => {
    const { deps } = makeDeps();
    const rows = [{ email: 'a@example.com' }];
    const refused = async (body: unknown) => (await call(deps, 'POST', '?action=import', body)).status;
    expect(await refused({ ...importBody(rows), statement: 'short' })).toBe(400);
    expect(await refused({ ...importBody(rows), attested: false })).toBe(400);
    expect(await refused({ ...importBody(rows), batch_id: 'nope' })).toBe(400);
    expect(await refused(importBody(Array.from({ length: 201 }, (_, i) => ({ email: `p${i}@example.com` }))))).toBe(400);
    const res = await call(deps, 'POST', '?action=import', { ...importBody(rows), attested: false });
    expect((await res.json()).error).toBe('Tick the box to confirm everyone agreed.');
  });

  it('syncs, reading Resend only when asked', async () => {
    const { deps, resend, memory } = makeDeps();
    memory.seed({ email: 'a@example.com' });
    const report = await (await call(deps, 'POST', '?action=sync', { pull: false })).json();
    expect(report).toMatchObject({ pushed: 1, remaining: 0 });
    expect(resend.calls).not.toContain('listSegmentContacts');
    await call(deps, 'POST', '?action=sync', { pull: true });
    expect(resend.calls).toContain('listSegmentContacts');
  });

  it('unsubscribes a subscribed person here and in Resend at once', async () => {
    const { deps, memory, resend } = makeDeps();
    const contact = resend.add('a@example.com', { segments: [SEGMENT] });
    const row = memory.seed({ email: 'a@example.com', resend_contact_id: contact.id, resend_synced_at: '2026-10-01T00:00:00.000Z' });

    const res = await call(deps, 'PATCH', `?id=${row.id}`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.resend).toBe('updated');
    expect(body.subscriber).toMatchObject({ status: 'unsubscribed', unsubscribe_source: 'admin', unsubscribed_at: deps.now().toISOString() });
    expect(body.subscriber).not.toHaveProperty('confirm_token_hash');
    expect(contact.unsubscribed).toBe(true);
    expect(memory.audits[0]).toMatchObject({ action: 'NEWSLETTER_UNSUBSCRIBE', resourceId: row.id });
  });

  it('unsubscribes only subscribed people, by a valid id', async () => {
    const { deps, memory } = makeDeps();
    const pending = memory.seed({ email: 'p@example.com', status: 'pending' });
    expect((await call(deps, 'PATCH', `?id=${pending.id}`)).status).toBe(409);
    expect((await call(deps, 'PATCH', '?id=7d0f6b1c-1111-4222-8333-944455556666')).status).toBe(404);
    expect((await call(deps, 'PATCH', '?id=abc')).status).toBe(400);
  });

  it('deletes a person: the Resend contact first, then the row, keeping only a hash', async () => {
    const { deps, memory, resend } = makeDeps();
    const contact = resend.add('a@example.com', { segments: [SEGMENT] });
    const row = memory.seed({ email: 'a@example.com', resend_contact_id: contact.id });

    expect((await call(deps, 'DELETE', `?id=${row.id}`)).status).toBe(200);
    expect(memory.get(row.id)).toBeUndefined();
    expect(resend.contacts.has(contact.id)).toBe(false);
    expect(memory.erased.has(hashEmail('a@example.com'))).toBe(true);
    expect(memory.audits[0]).toMatchObject({ action: 'NEWSLETTER_DELETE', resourceId: row.id });
    expect(JSON.stringify(memory.audits)).not.toContain('a@example.com');
  });

  it('keeps the row when Resend cannot delete the contact', async () => {
    const { deps, memory, resend } = makeDeps();
    const row = memory.seed({ email: 'a@example.com' });
    resend.failNext('deleteContact');
    const res = await call(deps, 'DELETE', `?id=${row.id}`);
    expect(res.status).toBe(502);
    expect(memory.get(row.id)).toBeDefined();
    expect(memory.erased.size).toBe(0);
  });
});
