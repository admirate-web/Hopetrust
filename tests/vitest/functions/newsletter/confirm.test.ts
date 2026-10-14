// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { hashEmail } from '@/netlify/functions/_shared/newsletter-crypto.mts';
import type { NewsletterDeps } from '@/netlify/functions/_shared/newsletter-deps.mts';
import { EXPIRED, handleConfirm, handleSubscribe } from '@/netlify/functions/_shared/newsletter-signup.mts';
import { SEGMENT, jsonRequest, makeDeps } from './fakes';

const ENDPOINT = 'https://hopetrustindia.com/api/newsletter-confirm';
const DAY = 24 * 60 * 60_000;

/** Signs up through the real handler and returns the token from the email. */
async function signUp(deps: NewsletterDeps, sent: Array<{ text?: string }>, email = 'asha@example.com') {
  const req = jsonRequest(
    'https://hopetrustindia.com/api/newsletter-subscribe',
    'POST',
    { full_name: 'Asha Rao', email, page: '/blogs/', notice: '2026-10' },
    { 'x-nf-client-connection-ip': '203.0.113.7' },
  );
  expect((await handleSubscribe(req, deps)).status).toBe(200);
  return /#t=([A-Za-z0-9_-]{43})/.exec(sent.at(-1)!.text!)![1];
}

async function confirm(deps: NewsletterDeps, token: unknown) {
  const res = await handleConfirm(jsonRequest(ENDPOINT, 'POST', { token }), deps);
  return { status: res.status, body: await res.json().catch(() => null) };
}

describe('newsletter-confirm', () => {
  it('answers a CORS preflight and refuses other methods', async () => {
    const { deps } = makeDeps();
    expect((await handleConfirm(new Request(ENDPOINT, { method: 'OPTIONS' }), deps)).status).toBe(204);
    expect((await handleConfirm(new Request(ENDPOINT), deps)).status).toBe(405);
  });

  it('confirms a pending sign-up: consent recorded, token gone, contact added in Resend', async () => {
    const { deps, memory, resend, clock } = makeDeps();
    const token = await signUp(deps, resend.sent);
    clock.advance(60_000);

    expect(await confirm(deps, token)).toEqual({ status: 200, body: { ok: true } });

    const row = memory.byEmail('asha@example.com')!;
    expect(row).toMatchObject({
      status: 'subscribed',
      source: 'website',
      consent_at: deps.now().toISOString(),
      confirm_token_hash: null,
      confirm_token_expires_at: null,
      confirm_send_count: 0,
    });
    expect(row.consent_note).toBe('Website sign-up form on /blogs/ (notice 2026-10), confirmed by clicking the emailed link');
    const contact = resend.find('asha@example.com')!;
    expect(contact.segments.has(SEGMENT)).toBe(true);
    expect(row).toMatchObject({ resend_contact_id: contact.id, resend_synced_at: deps.now().toISOString() });
  });

  it('refuses a malformed, unknown or already-used token with the same answer', async () => {
    const { deps, resend } = makeDeps();
    const token = await signUp(deps, resend.sent);
    expect(await confirm(deps, 'x')).toEqual({ status: 400, body: EXPIRED });
    expect(await confirm(deps, 'A'.repeat(43))).toEqual({ status: 400, body: EXPIRED });
    expect((await confirm(deps, token)).status).toBe(200);
    expect(await confirm(deps, token)).toEqual({ status: 400, body: EXPIRED });
  });

  it('refuses a link older than 7 days and leaves the sign-up pending', async () => {
    const { deps, memory, resend, clock } = makeDeps();
    const token = await signUp(deps, resend.sent);
    clock.advance(7 * DAY + 60_000);
    expect(await confirm(deps, token)).toEqual({ status: 400, body: EXPIRED });
    expect(memory.byEmail('asha@example.com')?.status).toBe('pending');
  });

  it('re-subscribes someone who unsubscribed, once they click, here and in Resend', async () => {
    const { deps, memory, resend, clock } = makeDeps();
    const contact = resend.add('asha@example.com', { unsubscribed: true, segments: [SEGMENT] });
    memory.seed({
      email: 'asha@example.com',
      status: 'unsubscribed',
      source: 'import',
      consent_note: 'Clinic intake form, 2025–26',
      unsubscribed_at: '2026-06-01T00:00:00.000Z',
      unsubscribe_source: 'resend',
      resend_contact_id: contact.id,
      resend_synced_at: '2026-06-01T00:00:00.000Z',
    });
    const token = await signUp(deps, resend.sent);
    clock.advance(60_000);

    expect((await confirm(deps, token)).status).toBe(200);
    expect(memory.byEmail('asha@example.com')).toMatchObject({
      status: 'subscribed',
      source: 'website',
      unsubscribed_at: null,
      unsubscribe_source: null,
      consent_note: 'Website sign-up form on /blogs/ (notice 2026-10), confirmed by clicking the emailed link',
    });
    expect(contact.unsubscribed).toBe(false);
  });

  it('takes the address off the erasure list: confirming is fresh consent', async () => {
    const { deps, memory, resend } = makeDeps();
    memory.erased.add(hashEmail('asha@example.com'));
    const token = await signUp(deps, resend.sent);
    await confirm(deps, token);
    expect(memory.erased.has(hashEmail('asha@example.com'))).toBe(false);
  });

  it('still confirms when Resend is down, leaving the row for the next sync', async () => {
    const { deps, memory, resend } = makeDeps();
    const token = await signUp(deps, resend.sent);
    resend.failNext('getContact');
    expect((await confirm(deps, token)).status).toBe(200);
    expect(memory.byEmail('asha@example.com')).toMatchObject({ status: 'subscribed', resend_synced_at: null });
  });
});
