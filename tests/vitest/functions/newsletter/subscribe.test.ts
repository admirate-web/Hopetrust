// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { SIGNUP_SUCCESS_MESSAGE } from '@/lib/newsletter/subscriber';
import { hashToken } from '@/netlify/functions/_shared/newsletter-crypto.mts';
import type { NewsletterDeps } from '@/netlify/functions/_shared/newsletter-deps.mts';
import { handleSubscribe, linkOrigin } from '@/netlify/functions/_shared/newsletter-signup.mts';
import { SITE, jsonRequest, makeDeps } from './fakes';

const ENDPOINT = 'https://hopetrustindia.com/api/newsletter-subscribe';
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const OK = { ok: true, message: SIGNUP_SUCCESS_MESSAGE };

function signup(body: Record<string, unknown> = {}, ip = '203.0.113.7', url = ENDPOINT) {
  return jsonRequest(
    url,
    'POST',
    { full_name: 'Asha Rao', email: 'asha@example.com', page: '/blogs/', notice: '2026-10', ...body },
    { 'x-nf-client-connection-ip': ip, 'user-agent': 'Mozilla/5.0 Test' },
  );
}

async function send(deps: NewsletterDeps, req: Request) {
  const res = await handleSubscribe(req, deps);
  return { status: res.status, body: await res.json().catch(() => null) };
}

/** The token in the most recent confirmation email's link. */
function lastToken(sent: Array<{ text?: string }>): string {
  return /#t=([A-Za-z0-9_-]{43})/.exec(sent.at(-1)?.text ?? '')![1];
}

describe('newsletter-subscribe', () => {
  it('answers a CORS preflight, and refuses other methods or a missing setup', async () => {
    const { deps } = makeDeps();
    expect((await handleSubscribe(new Request(ENDPOINT, { method: 'OPTIONS' }), deps)).status).toBe(204);
    expect((await handleSubscribe(new Request(ENDPOINT), deps)).status).toBe(405);
    expect((await handleSubscribe(signup(), null)).status).toBe(500);
  });

  it('refuses a body that is not JSON, or is over 4 KB', async () => {
    const { deps } = makeDeps();
    const notJson = new Request(ENDPOINT, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'hi' });
    expect((await handleSubscribe(notJson, deps)).status).toBe(415);
    expect((await handleSubscribe(signup({ full_name: 'x'.repeat(5000) }), deps)).status).toBe(413);
  });

  it('says which fields need fixing', async () => {
    const { deps } = makeDeps();
    const { status, body } = await send(deps, signup({ full_name: 'A', email: 'nope' }));
    expect(status).toBe(400);
    expect(body.fields).toEqual({ full_name: 'Please enter your full name', email: 'Please enter a valid email address' });
  });

  it('refuses a notice version it does not know', async () => {
    const { deps } = makeDeps();
    expect((await send(deps, signup({ notice: '1999-01' }))).status).toBe(400);
  });

  it('treats a filled honeypot as a bot: same answer, nothing saved or sent', async () => {
    const { deps, memory, resend } = makeDeps();
    expect(await send(deps, signup({ website: 'http://spam.example' }))).toEqual({ status: 200, body: OK });
    expect(memory.rows.size).toBe(0);
    expect(resend.sent).toHaveLength(0);
  });

  it('saves a new address as pending and emails a link whose token is stored only as a hash', async () => {
    const { deps, memory, resend } = makeDeps();
    expect(await send(deps, signup())).toEqual({ status: 200, body: OK });

    const row = memory.byEmail('asha@example.com')!;
    expect(row).toMatchObject({
      status: 'pending',
      source: 'website',
      full_name: 'Asha Rao',
      signup_page: '/blogs/',
      signup_ip: '203.0.113.7',
      signup_user_agent: 'Mozilla/5.0 Test',
      signup_notice: '2026-10',
      confirm_send_count: 1,
      confirm_sent_at: deps.now().toISOString(),
      confirm_token_expires_at: new Date(deps.now().getTime() + 7 * DAY).toISOString(),
      consent_at: null,
    });

    const email = resend.sent[0];
    expect(email).toMatchObject({
      from: 'Hope Trust <newsletter@hopetrustindia.com>',
      to: ['asha@example.com'],
      replyTo: 'frontoffice@hopetrustindia.com',
      subject: 'Confirm your Hope Trust newsletter subscription',
    });
    const token = lastToken(resend.sent);
    expect(email.text).toContain(`${SITE}/newsletter/confirm/#t=${token}`);
    expect(row.confirm_token_hash).toBe(hashToken(token));
    expect(JSON.stringify(row)).not.toContain(token);
  });

  it('stores the address trimmed and lower-cased, and the name exactly as typed', async () => {
    const { deps, memory } = makeDeps();
    await send(deps, signup({ email: '  Asha@Example.COM ', full_name: 'आशा రావు 🌿' }));
    expect(memory.byEmail('asha@example.com')?.full_name).toBe('आशा రావు 🌿');
  });

  it('gives the same answer whatever the address\'s status', async () => {
    const { deps, memory, resend, clock } = makeDeps();
    memory.seed({ email: 'pending@example.com', status: 'pending', confirm_sent_at: new Date(deps.now().getTime() - 60 * MINUTE).toISOString(), confirm_send_count: 1 });
    memory.seed({ email: 'subscribed@example.com', status: 'subscribed' });
    memory.seed({ email: 'unsubscribed@example.com', status: 'unsubscribed' });

    const answers = [];
    for (const [i, email] of ['new@example.com', 'pending@example.com', 'subscribed@example.com', 'unsubscribed@example.com'].entries()) {
      clock.advance(MINUTE);
      answers.push(await send(deps, signup({ email }, `203.0.113.${i}`)));
    }
    for (const answer of answers) expect(answer).toEqual({ status: 200, body: OK });
    expect(resend.sent.map((e) => e.to[0])).toEqual(['new@example.com', 'pending@example.com', 'unsubscribed@example.com']);
  });

  it('keeps an unsubscribed person unsubscribed, with their records, until they confirm', async () => {
    const { deps, memory } = makeDeps();
    const before = memory.seed({
      email: 'asha@example.com',
      status: 'unsubscribed',
      source: 'import',
      consent_at: '2026-01-05T00:00:00.000Z',
      consent_note: 'Clinic intake form, 2025–26',
      unsubscribed_at: '2026-06-01T00:00:00.000Z',
      unsubscribe_source: 'resend',
    });
    await send(deps, signup());
    expect(memory.get(before.id)).toMatchObject({
      status: 'unsubscribed',
      source: 'import',
      consent_at: '2026-01-05T00:00:00.000Z',
      consent_note: 'Clinic intake form, 2025–26',
      unsubscribed_at: '2026-06-01T00:00:00.000Z',
      unsubscribe_source: 'resend',
    });
    expect(memory.get(before.id)?.confirm_token_hash).not.toBeNull();
  });

  it('waits 10 minutes between emails to one address', async () => {
    const { deps, resend, clock, memory } = makeDeps();
    await send(deps, signup());
    clock.advance(5 * MINUTE);
    expect(await send(deps, signup())).toEqual({ status: 200, body: OK });
    expect(resend.sent).toHaveLength(1);
    clock.advance(6 * MINUTE);
    await send(deps, signup());
    expect(resend.sent).toHaveLength(2);
    expect(memory.byEmail('asha@example.com')?.confirm_send_count).toBe(2);
  });

  it('sends at most 3 emails to an address that never confirms, and starts again after 30 days', async () => {
    const { deps, resend, clock, memory } = makeDeps();
    for (let i = 0; i < 4; i++) {
      await send(deps, signup());
      clock.advance(11 * MINUTE);
    }
    expect(resend.sent).toHaveLength(3);
    clock.advance(30 * DAY);
    await send(deps, signup());
    expect(resend.sent).toHaveLength(4);
    expect(memory.byEmail('asha@example.com')?.confirm_send_count).toBe(1);
  });

  it('limits each IP address to 5 addresses per 15 minutes', async () => {
    const { deps, clock } = makeDeps();
    for (let i = 0; i < 5; i++) {
      expect((await send(deps, signup({ email: `p${i}@example.com` }))).status).toBe(200);
    }
    const blocked = await send(deps, signup({ email: 'p5@example.com' }));
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toMatch(/try again/i);
    expect((await send(deps, signup({ email: 'p5@example.com' }, '198.51.100.1'))).status).toBe(200);
    clock.advance(16 * MINUTE);
    expect((await send(deps, signup({ email: 'p6@example.com' }))).status).toBe(200);
  });

  it('deletes sign-ups left unconfirmed for 30 days, but never unsubscribed rows', async () => {
    const { deps, memory } = makeDeps();
    const old = new Date(deps.now().getTime() - 31 * DAY).toISOString();
    const stale = memory.seed({ email: 'stale@example.com', status: 'pending', confirm_sent_at: old });
    const left = memory.seed({ email: 'left@example.com', status: 'unsubscribed', created_at: old, unsubscribed_at: old });
    await send(deps, signup());
    expect(memory.get(stale.id)).toBeUndefined();
    expect(memory.get(left.id)).toBeDefined();
  });

  it('gives a concurrent request for the same address the normal answer', async () => {
    const { deps, memory, resend } = makeDeps();
    memory.seed({ email: 'asha@example.com', status: 'pending' });
    // This request read the table before the other request's row existed.
    const staleRead: NewsletterDeps = { ...deps, db: { ...deps.db, findByEmail: async () => null } };
    expect(await send(staleRead, signup())).toEqual({ status: 200, body: OK });
    expect(resend.sent).toHaveLength(0);
  });

  it('puts the confirmation fields back when the email cannot be sent', async () => {
    const { deps, memory, resend, clock } = makeDeps();
    await send(deps, signup());
    const firstToken = lastToken(resend.sent);
    clock.advance(11 * MINUTE);
    resend.failNext('sendEmail');
    const failed = await send(deps, signup());
    expect(failed.status).toBe(502);
    // The earlier link still works, and the person can try again straight away.
    expect(memory.byEmail('asha@example.com')).toMatchObject({ confirm_token_hash: hashToken(firstToken), confirm_send_count: 1 });
    expect((await send(deps, signup())).status).toBe(200);
    expect(resend.sent).toHaveLength(2);
  });
});

describe('linkOrigin', () => {
  const at = (url: string) => new Request(url, { method: 'POST' });

  it('keeps links on the site the request came from when it is ours', () => {
    expect(linkOrigin(at('https://deploy-preview-31--hopetrust.netlify.app/api/newsletter-subscribe'), SITE)).toBe(
      'https://deploy-preview-31--hopetrust.netlify.app',
    );
    expect(linkOrigin(at('http://localhost:8888/api/newsletter-subscribe'), SITE)).toBe('http://localhost:8888');
    expect(linkOrigin(at('https://hopetrustindia.com/api/newsletter-subscribe'), SITE)).toBe(SITE);
  });

  it('uses the main site for any other host', () => {
    expect(linkOrigin(at('https://evil.example/api/newsletter-subscribe'), SITE)).toBe(SITE);
    expect(linkOrigin(at('http://hopetrust.netlify.app/api/newsletter-subscribe'), SITE)).toBe(SITE);
  });
});
