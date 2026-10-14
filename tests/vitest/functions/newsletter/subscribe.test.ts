// @vitest-environment node
import { afterEach, describe, it, expect, vi } from 'vitest';
import { SIGNUP_SUCCESS_MESSAGE } from '@/lib/newsletter/subscriber';
import { hashToken } from '@/netlify/functions/_shared/newsletter-crypto.mts';
import type { NewsletterDeps } from '@/netlify/functions/_shared/newsletter-deps.mts';
import { SIGNUP_RULES, handleSubscribe, linkOrigin } from '@/netlify/functions/_shared/newsletter-signup.mts';
import { ResendError } from '@/netlify/functions/_shared/resend.mts';
import { SEGMENT, SITE, jsonRequest, makeDeps } from './fakes';

const ENDPOINT = 'https://hopetrustindia.com/api/newsletter-subscribe';
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const OK = { ok: true, message: SIGNUP_SUCCESS_MESSAGE };
const SITE_BUSY = "We're getting a lot of sign-ups right now. Please try again later.";

afterEach(() => {
  vi.restoreAllMocks();
});

/** Hides the expected server-side error logs, and lets a test count them. */
const quietErrors = () => vi.spyOn(console, 'error').mockImplementation(() => {});

/** One address of each status, plus a new one, in the order the tests use them. */
function seedEveryStatus(memory: ReturnType<typeof makeDeps>['memory'], now: Date) {
  memory.seed({
    email: 'pending@example.com',
    status: 'pending',
    confirm_sent_at: new Date(now.getTime() - 60 * MINUTE).toISOString(),
    confirm_send_count: 1,
  });
  memory.seed({ email: 'subscribed@example.com', status: 'subscribed' });
  memory.seed({ email: 'unsubscribed@example.com', status: 'unsubscribed' });
  return ['new@example.com', 'pending@example.com', 'subscribed@example.com', 'unsubscribed@example.com'];
}

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

  // Postgres can't store \u0000, so these would fail at the write. They are
  // refused before the address is looked up, so the answer can't depend on it.
  it.each([
    ['a NUL in the name', { full_name: 'Asha\u0000Rao' }, 'full_name'],
    ['a NUL in the page', { page: '/blogs/\u0000' }, 'page'],
    ['half of an emoji in the name', { full_name: 'Asha \uD83C' }, 'full_name'],
  ])('refuses %s before looking the address up, and answers at once', async (_label, body, field) => {
    const { deps, memory, resend, sleeps } = makeDeps();
    memory.seed({ email: 'asha@example.com', status: 'subscribed' });
    const findByEmail = vi.spyOn(deps.db, 'findByEmail');

    const { status, body: answer } = await send(deps, signup(body));
    expect(status).toBe(400);
    expect(Object.keys(answer.fields)).toEqual([field]);
    expect(findByEmail).not.toHaveBeenCalled();
    expect(resend.calls).toEqual([]);
    expect(sleeps).toEqual([]);
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
    const emails = seedEveryStatus(memory, deps.now());

    const answers = [];
    for (const [i, email] of emails.entries()) {
      clock.advance(MINUTE);
      answers.push(await send(deps, signup({ email }, `203.0.113.${i}`)));
    }
    for (const answer of answers) expect(answer).toEqual({ status: 200, body: OK });
    expect(resend.sent.map((e) => e.to[0])).toEqual(['new@example.com', 'pending@example.com', 'unsubscribed@example.com']);
  });

  it('gives the same answer whatever the address\'s status when saving fails', async () => {
    const { deps, memory, resend } = makeDeps();
    const emails = seedEveryStatus(memory, deps.now());
    const errors = quietErrors();
    const refuse = async (): Promise<never> => {
      throw new Error('unsupported Unicode escape sequence');
    };
    const broken: NewsletterDeps = { ...deps, db: { ...deps.db, insert: refuse, update: refuse } };

    const answers = [];
    for (const [i, email] of emails.entries()) answers.push(await send(broken, signup({ email }, `203.0.113.${i}`)));
    for (const answer of answers) expect(answer).toEqual({ status: 200, body: OK });
    expect(resend.sent).toHaveLength(0);
    // The three failed writes (new, pending, unsubscribed) are logged on the server.
    expect(errors).toHaveBeenCalledTimes(3);
  });

  it('gives the same answer whatever the address\'s status when the email cannot be sent', async () => {
    const { deps, memory } = makeDeps();
    const emails = seedEveryStatus(memory, deps.now());
    const before = emails.map((email) => memory.byEmail(email));
    const errors = quietErrors();
    const broken: NewsletterDeps = {
      ...deps,
      resend: {
        ...deps.resend,
        sendEmail: async () => {
          throw new ResendError(429, 'daily_quota_exceeded', 'You have reached your daily email sending quota');
        },
      },
    };

    const answers = [];
    for (const [i, email] of emails.entries()) answers.push(await send(broken, signup({ email }, `203.0.113.${i}`)));
    for (const answer of answers) expect(answer).toEqual({ status: 200, body: OK });
    expect(errors).toHaveBeenCalledTimes(3);
    // Nothing was sent, so the confirmation fields are back as they were.
    for (const [i, email] of emails.entries()) {
      const row = memory.byEmail(email);
      expect(row?.confirm_token_hash ?? null).toBe(before[i]?.confirm_token_hash ?? null);
      expect(row?.confirm_sent_at ?? null).toBe(before[i]?.confirm_sent_at ?? null);
    }
  });

  it('answers after the same time whatever the address, counted from the start of the request', async () => {
    const { deps, memory, clock, sleeps } = makeDeps();
    memory.seed({ email: 'subscribed@example.com', status: 'subscribed' });
    // Sending the confirmation email takes 400 ms; a subscribed address sends nothing.
    const slowResend = {
      ...deps.resend,
      sendEmail: async (input: Parameters<NewsletterDeps['resend']['sendEmail']>[0]) => {
        clock.advance(400);
        return deps.resend.sendEmail(input);
      },
    };
    const timed: NewsletterDeps = { ...deps, resend: slowResend };
    const answeredAfter = async (email: string) => {
      const start = clock.now().getTime();
      expect(await send(timed, signup({ email }))).toEqual({ status: 200, body: OK });
      return clock.now().getTime() - start + sleeps.at(-1)!;
    };

    expect(await answeredAfter('new@example.com')).toBe(SIGNUP_RULES.minAnswerMs);
    expect(await answeredAfter('subscribed@example.com')).toBe(SIGNUP_RULES.minAnswerMs);
    expect(sleeps).toEqual([SIGNUP_RULES.minAnswerMs - 400, SIGNUP_RULES.minAnswerMs]);
    expect(SIGNUP_RULES.minAnswerMs).toBe(2500);
  });

  it('takes the same time over an error before the address is looked up', async () => {
    const { deps, sleeps } = makeDeps();
    quietErrors();
    const broken: NewsletterDeps = {
      ...deps,
      db: {
        ...deps.db,
        countRecentFromIp: async () => {
          throw new Error('Supabase is down');
        },
      },
    };
    const { status, body } = await send(broken, signup());
    expect(status).toBe(500);
    expect(body.error).toMatch(/try again/i);
    expect(sleeps).toEqual([2500]);
  });

  it('emails a subscribed address that unsubscribed on Resend\'s page since the last sync', async () => {
    const { deps, memory, resend } = makeDeps();
    const contact = resend.add('asha@example.com', { unsubscribed: true, segments: [SEGMENT] });
    const row = memory.seed({
      email: 'asha@example.com',
      status: 'subscribed',
      resend_contact_id: contact.id,
      resend_synced_at: '2026-10-01T00:00:00.000Z',
    });

    expect(await send(deps, signup())).toEqual({ status: 200, body: OK });
    // The pull's rule, applied now: unsubscribed by Resend, until they confirm again.
    expect(memory.get(row.id)).toMatchObject({
      status: 'unsubscribed',
      unsubscribe_source: 'resend',
      unsubscribed_at: deps.now().toISOString(),
      confirm_token_hash: hashToken(lastToken(resend.sent)),
    });
    expect(resend.sent.map((e) => e.to[0])).toEqual(['asha@example.com']);
  });

  it('leaves a subscribed address alone when Resend agrees, has a change waiting, or cannot be asked', async () => {
    const { deps, memory, resend } = makeDeps();
    const synced = '2026-10-01T00:00:00.000Z';
    resend.add('on@example.com', { segments: [SEGMENT] });
    memory.seed({ email: 'on@example.com', status: 'subscribed', resend_synced_at: synced });
    // Just confirmed again, and the confirmation hasn't reached Resend yet: that is the newer word.
    resend.add('waiting@example.com', { unsubscribed: true, segments: [SEGMENT] });
    const waiting = memory.seed({ email: 'waiting@example.com', status: 'subscribed', resend_synced_at: null });
    resend.add('unsure@example.com', { unsubscribed: true, segments: [SEGMENT] });
    const unsure = memory.seed({ email: 'unsure@example.com', status: 'subscribed', resend_synced_at: synced });
    quietErrors();

    expect(await send(deps, signup({ email: 'on@example.com' }, '203.0.113.1'))).toEqual({ status: 200, body: OK });
    expect(await send(deps, signup({ email: 'waiting@example.com' }, '203.0.113.2'))).toEqual({ status: 200, body: OK });
    resend.failNext('getContact');
    expect(await send(deps, signup({ email: 'unsure@example.com' }, '203.0.113.3'))).toEqual({ status: 200, body: OK });

    expect(resend.sent).toHaveLength(0);
    expect(memory.get(waiting.id)?.status).toBe('subscribed');
    expect(memory.get(unsure.id)?.status).toBe('subscribed');
    expect(resend.calls.filter((c) => c === 'getContact')).toHaveLength(3);
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
    const { deps, clock, sleeps } = makeDeps();
    for (let i = 0; i < 5; i++) {
      expect((await send(deps, signup({ email: `p${i}@example.com` }))).status).toBe(200);
    }
    const blocked = await send(deps, signup({ email: 'p5@example.com' }));
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toMatch(/try again/i);
    expect(sleeps.at(-1)).toBe(2500);
    expect((await send(deps, signup({ email: 'p5@example.com' }, '198.51.100.1'))).status).toBe(200);
    clock.advance(16 * MINUTE);
    expect((await send(deps, signup({ email: 'p6@example.com' }))).status).toBe(200);
  });

  it('stops at 40 confirmation emails an hour across the whole site, whatever the address', async () => {
    const { deps, memory, resend, clock, sleeps } = makeDeps();
    const halfAnHourAgo = new Date(deps.now().getTime() - 30 * MINUTE).toISOString();
    for (let i = 0; i < 40; i++) {
      memory.seed({ email: `p${i}@example.com`, status: 'pending', signup_ip: `198.51.100.${i}`, confirm_sent_at: halfAnHourAgo });
    }
    memory.seed({ email: 'subscribed@example.com', status: 'subscribed' });

    const forNew = await send(deps, signup({ email: 'new@example.com' }));
    const forSubscribed = await send(deps, signup({ email: 'subscribed@example.com' }));
    expect(forNew).toEqual({ status: 429, body: { error: SITE_BUSY } });
    expect(forSubscribed).toEqual(forNew);
    expect(sleeps).toEqual([2500, 2500]);
    // Nothing sent, and nothing looked up in Resend.
    expect(resend.calls).toEqual([]);
    expect(memory.byEmail('new@example.com')).toBeUndefined();

    clock.advance(31 * MINUTE);
    expect(await send(deps, signup({ email: 'new@example.com' }))).toEqual({ status: 200, body: OK });
    expect(resend.sent).toHaveLength(1);
  });

  it('stops at 80 confirmation emails a day across the whole site', async () => {
    const { deps, memory, resend } = makeDeps();
    const earlierToday = new Date(deps.now().getTime() - 3 * 60 * MINUTE).toISOString();
    for (let i = 0; i < 79; i++) {
      memory.seed({ email: `p${i}@example.com`, status: 'pending', signup_ip: `198.51.100.${i}`, confirm_sent_at: earlierToday });
    }
    expect(await send(deps, signup({ email: 'eightieth@example.com' }))).toEqual({ status: 200, body: OK });
    expect(await send(deps, signup({ email: 'one-more@example.com' }))).toEqual({ status: 429, body: { error: SITE_BUSY } });
    expect(resend.sent.map((e) => e.to[0])).toEqual(['eightieth@example.com']);
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
    quietErrors();
    const failed = await send(deps, signup());
    expect(failed).toEqual({ status: 200, body: OK });
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
