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
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const OK = { ok: true, message: SIGNUP_SUCCESS_MESSAGE };
const IP_BUSY = 'Too many sign-ups from your connection. Please try again in a few minutes.';
const SITE_BUSY = "We're getting a lot of sign-ups right now. Please try again later.";

/** A different IP address for each n, so only the site-wide cap applies. */
const ipFor = (n: number) => `10.0.${Math.floor(n / 250)}.${n % 250}`;

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

  it('treats a filled honeypot as a bot: same answer after the same wait, nothing saved or sent', async () => {
    const { deps, memory, resend, sleeps } = makeDeps();
    expect(await send(deps, signup({ website: 'http://spam.example' }))).toEqual({ status: 200, body: OK });
    expect(sleeps).toEqual([2500]);
    expect(memory.rows.size).toBe(0);
    expect(memory.requests).toEqual([]);
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

  it.each(['countRequestsSince', 'recordRequest'] as const)(
    'takes the same time when %s fails, and answers before the address is looked up',
    async (method) => {
      const { deps, sleeps } = makeDeps();
      quietErrors();
      const findByEmail = vi.spyOn(deps.db, 'findByEmail');
      const broken: NewsletterDeps = {
        ...deps,
        db: {
          ...deps.db,
          [method]: async () => {
            throw new Error('Supabase is down');
          },
        },
      };
      const { status, body } = await send(broken, signup());
      expect(status).toBe(500);
      expect(body.error).toMatch(/try again/i);
      expect(findByEmail).not.toHaveBeenCalled();
      expect(sleeps).toEqual([2500]);
    },
  );

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

  it('limits each IP address to 5 requests per 15 minutes', async () => {
    const { deps, clock, sleeps } = makeDeps();
    for (let i = 0; i < 5; i++) {
      expect((await send(deps, signup({ email: `p${i}@example.com` }))).status).toBe(200);
    }
    const blocked = await send(deps, signup({ email: 'p5@example.com' }));
    expect(blocked).toEqual({ status: 429, body: { error: IP_BUSY } });
    expect(sleeps.at(-1)).toBe(2500);
    expect((await send(deps, signup({ email: 'p5@example.com' }, '198.51.100.1'))).status).toBe(200);
    clock.advance(16 * MINUTE);
    expect((await send(deps, signup({ email: 'p6@example.com' }))).status).toBe(200);
  });

  // The probe from the re-review: a subscribed address (or one inside its
  // 10-minute gap) sends nothing, so a limit that counted sends would let the
  // sixth request through only when the candidate is on the list.
  it('gives the same answers from one IP whatever the fifth address is, so the limit shows nothing', async () => {
    const candidate = 'candidate@example.com';
    const arrange: Record<string, (memory: ReturnType<typeof makeDeps>['memory'], now: number) => void> = {
      subscribed: (memory) => memory.seed({ email: candidate, status: 'subscribed' }),
      'pending inside its 10-minute gap': (memory, now) =>
        memory.seed({
          email: candidate,
          status: 'pending',
          signup_ip: '198.51.100.99',
          confirm_sent_at: new Date(now - 5 * MINUTE).toISOString(),
          confirm_send_count: 1,
        }),
      unsubscribed: (memory) => memory.seed({ email: candidate, status: 'unsubscribed' }),
      new: () => {},
    };

    const answers: Record<string, unknown[]> = {};
    for (const [kind, seed] of Object.entries(arrange)) {
      const { deps, memory } = makeDeps();
      seed(memory, deps.now().getTime());
      answers[kind] = [];
      for (const email of ['own1@example.com', 'own2@example.com', 'own3@example.com', 'own4@example.com', candidate, 'own5@example.com']) {
        answers[kind].push(await send(deps, signup({ email })));
      }
    }

    const expected = [...Array(5).fill({ status: 200, body: OK }), { status: 429, body: { error: IP_BUSY } }];
    expect(answers).toEqual({
      subscribed: expected,
      'pending inside its 10-minute gap': expected,
      unsubscribed: expected,
      new: expected,
    });
  });

  it('counts every request toward the site cap, whatever the address: the 41st in an hour is refused', async () => {
    const { deps, memory, resend, clock, sleeps } = makeDeps();
    memory.seed({ email: 'subscribed@example.com', status: 'subscribed' });
    // From 40 IPs: one address asked for again and again, a subscribed one, and new ones.
    for (let n = 0; n < 40; n++) {
      const email = ['again@example.com', 'subscribed@example.com', `new${n}@example.com`][n % 3];
      expect(await send(deps, signup({ email }, ipFor(n)))).toEqual({ status: 200, body: OK });
    }
    // Only the first request for again@ and the new addresses sent anything, but all 40 counted.
    expect(resend.sent).toHaveLength(14);
    expect(memory.requests).toHaveLength(40);

    expect(await send(deps, signup({ email: 'late@example.com' }, ipFor(40)))).toEqual({
      status: 429,
      body: { error: SITE_BUSY },
    });
    expect(sleeps.at(-1)).toBe(2500);
    // A refused request isn't counted, so the hour empties once the traffic stops.
    expect(memory.requests).toHaveLength(40);
    clock.advance(61 * MINUTE);
    expect(await send(deps, signup({ email: 'late@example.com' }, ipFor(41)))).toEqual({ status: 200, body: OK });
  });

  it('refuses the 81st request in a day spread across hours, until the earliest leave the day', async () => {
    const { deps, memory, clock } = makeDeps();
    let n = 0;
    // 20 an hour for 4 hours: always under the hourly cap.
    for (let hour = 0; hour < 4; hour++) {
      for (let i = 0; i < 20; i++, n++) {
        expect((await send(deps, signup({ email: `p${n}@example.com` }, ipFor(n)))).status).toBe(200);
      }
      clock.advance(HOUR);
    }
    expect(await send(deps, signup({ email: 'late@example.com' }, ipFor(n)))).toEqual({
      status: 429,
      body: { error: SITE_BUSY },
    });
    expect(memory.requests).toHaveLength(80);
    // The first hour's 20 requests leave the day 24 hours after they came in.
    clock.advance(20 * HOUR + MINUTE);
    expect(await send(deps, signup({ email: 'late@example.com' }, ipFor(n + 1)))).toEqual({ status: 200, body: OK });
  });

  it('never sends more emails than it counted requests: at most 40 an hour and 80 a day, re-sends included', async () => {
    const { deps, clock } = makeDeps();
    const sentAt: number[] = [];
    let recorded = 0;
    const counting: NewsletterDeps = {
      ...deps,
      db: {
        ...deps.db,
        recordRequest: async (ip, atIso) => {
          recorded++;
          return deps.db.recordRequest(ip, atIso);
        },
      },
      resend: {
        ...deps.resend,
        sendEmail: async (input) => {
          sentAt.push(clock.now().getTime());
          return deps.resend.sendEmail(input);
        },
      },
    };

    // For 26 hours, 8 IPs each ask every 3 minutes. Each IP re-sends to a
    // batch of 4 addresses, 12 minutes apart, until each has had its 3 emails,
    // then moves on to 4 new ones: the re-review's attack, from more IPs.
    for (let round = 0; round < 26 * 20; round++) {
      for (let ip = 0; ip < 8; ip++) {
        const email = `ip${ip}-batch${Math.floor(round / 12)}-${round % 4}@example.com`;
        await send(counting, signup({ email }, `198.51.100.${ip}`));
        expect(sentAt.length).toBeLessThanOrEqual(recorded);
      }
      clock.advance(3 * MINUTE);
    }

    const mostIn = (windowMs: number) =>
      Math.max(...sentAt.map((t) => sentAt.filter((s) => s >= t - windowMs && s <= t).length));
    expect(mostIn(HOUR)).toBe(40);
    expect(mostIn(DAY)).toBe(80);
    expect(sentAt.length).toBeGreaterThan(80); // sending carried on into the second day
  });

  it('asks Resend about a subscribed address at most 5 times per 15 minutes from one IP', async () => {
    const { deps, memory, resend, clock } = makeDeps();
    resend.add('on@example.com', { segments: [SEGMENT] });
    memory.seed({ email: 'on@example.com', status: 'subscribed', resend_synced_at: '2026-10-01T00:00:00.000Z' });
    const lookups = () => resend.calls.filter((call) => call === 'getContact').length;

    const statuses = [];
    for (let i = 0; i < 10; i++) statuses.push((await send(deps, signup({ email: 'on@example.com' }))).status);
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429, 429, 429, 429, 429]);
    expect(lookups()).toBe(5);

    clock.advance(16 * MINUTE);
    for (let i = 0; i < 10; i++) await send(deps, signup({ email: 'on@example.com' }));
    expect(lookups()).toBe(10);
    expect(resend.sent).toHaveLength(0);
  });

  it('deletes counted requests older than a day when a sign-up comes in', async () => {
    const { deps, memory } = makeDeps();
    const ago = (ms: number) => new Date(deps.now().getTime() - ms).toISOString();
    await deps.db.recordRequest('198.51.100.1', ago(DAY + MINUTE));
    await deps.db.recordRequest('198.51.100.2', ago(DAY - MINUTE));
    await send(deps, signup());
    expect(memory.requests.map((r) => r.ip)).toEqual(['198.51.100.2', '203.0.113.7']);
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
