// The public steps of signing up (spec §7.2, §7.3):
//   POST /api/newsletter-subscribe  { full_name, email, page, notice, website }
//   POST /api/newsletter-confirm    { token }   (handleConfirm, added in Task 8)
// Neither answer depends on whether the address is on the list: not its body,
// not its status code, and not how long it takes.

import { z } from 'zod';
import { buildConfirmEmail } from '../../../lib/newsletter/confirm-email';
import {
  KNOWN_NOTICE_VERSIONS,
  LIMITS,
  SIGNUP_SUCCESS_MESSAGE,
  signupSchema,
  type SignupInput,
  type SubscriberRow,
} from '../../../lib/newsletter/subscriber';
import { clientIp, jsonResponse, preflight, readJsonBody } from './http.mts';
import { TOKEN_PATTERN, hashEmail, hashToken, newToken } from './newsletter-crypto.mts';
import { DuplicateEmailError } from './newsletter-db.mts';
import type { NewsletterDeps } from './newsletter-deps.mts';
import { pushAndRecord } from './newsletter-sync.mts';

const METHODS = 'POST, OPTIONS';
const MAX_BODY_BYTES = 4096;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const SIGNUP_RULES = {
  /** Every answer after validation waits this long from the start, so its timing can't show whether the address is on the list. */
  minAnswerMs: 2500,
  /** Different addresses that requests from one IP can trigger confirmation emails for, per window. */
  maxAddressesPerIp: 5,
  ipWindowMs: 15 * MINUTE,
  /** Confirmation emails from the whole site, so no one sender can use up Resend's 100 emails a day. */
  maxSiteSendsPerHour: 40,
  maxSiteSendsPerDay: 80,
  /** Shortest gap between confirmation emails to one address. */
  resendGapMs: 10 * MINUTE,
  /** Confirmation emails one address can get without confirming, per 30 days. */
  maxSendsPerAddress: 3,
  sendCountWindowMs: 30 * DAY,
  tokenLifetimeMs: 7 * DAY,
  /** Unconfirmed sign-ups are deleted after this long: they never gave consent. */
  pendingLifetimeMs: 30 * DAY,
} as const;

const OK = { ok: true, message: SIGNUP_SUCCESS_MESSAGE };
export const EXPIRED = { error: 'expired', message: 'This link has expired or was already used.' };
const IP_BUSY = { error: 'Too many sign-ups from your connection. Please try again in a few minutes.' };
const SITE_BUSY = { error: "We're getting a lot of sign-ups right now. Please try again later." };

const iso = (ms: number) => new Date(ms).toISOString();

/**
 * Whether a sign-up request should send a confirmation email. A skip still
 * gets the normal answer, so nobody learns why.
 */
export function signupDecision(row: SubscriberRow | null, now: Date): 'send' | 'skip' {
  if (!row) return 'send';
  if (row.status === 'subscribed') return 'skip';
  const last = row.confirm_sent_at ? Date.parse(row.confirm_sent_at) : null;
  if (last === null) return 'send';
  const since = now.getTime() - last;
  if (since < SIGNUP_RULES.resendGapMs) return 'skip';
  if (since < SIGNUP_RULES.sendCountWindowMs && row.confirm_send_count >= SIGNUP_RULES.maxSendsPerAddress) return 'skip';
  return 'send';
}

const PREVIEW_HOST = /^([a-z0-9-]+--)?hopetrust\.netlify\.app$/;

/**
 * Origin for the link in the email: the site the request came from when it is
 * ours (production, a deploy preview, or `netlify dev`), else the main site.
 */
export function linkOrigin(req: Request, siteUrl: string): string {
  let url: URL;
  try {
    url = new URL(req.url);
  } catch {
    return siteUrl;
  }
  const host = url.hostname;
  const ours =
    url.origin === siteUrl ||
    (url.protocol === 'https:' && (host === 'hopetrustindia.com' || PREVIEW_HOST.test(host))) ||
    (url.protocol === 'http:' && (host === 'localhost' || host === '127.0.0.1'));
  return ours ? url.origin : siteUrl;
}

function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? 'form');
    if (!(field in out)) out[field] = issue.message;
  }
  return out;
}

function honeypotFilled(value: unknown): boolean {
  const website = (value as { website?: unknown } | null)?.website;
  return typeof website === 'string' && website.trim() !== '';
}

export async function handleSubscribe(req: Request, deps: NewsletterDeps | null): Promise<Response> {
  const reply = (body: unknown, status = 200) => jsonResponse(body, status, METHODS);
  if (req.method === 'OPTIONS') return preflight(METHODS);
  if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
  if (!deps) return reply({ error: 'Server misconfiguration' }, 500);
  const started = deps.now().getTime();

  const body = await readJsonBody(req, MAX_BODY_BYTES);
  if (!body.ok) return reply({ error: body.error }, body.status);
  if (honeypotFilled(body.value)) return reply(OK);

  const parsed = signupSchema.safeParse(body.value);
  if (!parsed.success) return reply({ error: 'Please check the form.', fields: fieldErrors(parsed.error) }, 400);
  if (!KNOWN_NOTICE_VERSIONS.includes(parsed.data.notice)) {
    return reply({ error: 'Please reload the page and try again.' }, 400);
  }

  let response: Response;
  try {
    response = await subscribe(req, deps, parsed.data, reply);
  } catch (err) {
    // Only the limits can fail this far out, and they don't depend on the address.
    console.error('[newsletter-subscribe]', err);
    response = reply({ error: 'Something went wrong. Please try again.' }, 500);
  }
  await deps.sleep(Math.max(0, started + SIGNUP_RULES.minAnswerMs - deps.now().getTime()));
  return response;
}

async function subscribe(
  req: Request,
  deps: NewsletterDeps,
  input: SignupInput,
  reply: (body: unknown, status?: number) => Response,
): Promise<Response> {
  const { db } = deps;
  const now = deps.now().getTime();
  const ip = clientIp(req);

  await db
    .deleteStalePending(iso(now - SIGNUP_RULES.pendingLifetimeMs))
    .catch((err) => console.error('[newsletter-subscribe] clean-up', err));

  // The limits come before the address is looked up, so their answers can't depend on it.
  if (ip && (await db.countRecentFromIp(ip, iso(now - SIGNUP_RULES.ipWindowMs))) >= SIGNUP_RULES.maxAddressesPerIp) {
    return reply(IP_BUSY, 429);
  }
  if (
    (await db.countConfirmationsSince(iso(now - HOUR))) >= SIGNUP_RULES.maxSiteSendsPerHour ||
    (await db.countConfirmationsSince(iso(now - DAY))) >= SIGNUP_RULES.maxSiteSendsPerDay
  ) {
    return reply(SITE_BUSY, 429);
  }

  // From here on the answer is always the same. A different answer when
  // something fails would show which addresses got far enough to fail.
  try {
    await sendConfirmation(req, deps, input, now, ip);
  } catch (err) {
    console.error('[newsletter-subscribe]', err);
  }
  return reply(OK);
}

/** Saves the request and emails a confirmation link, unless the rules say to skip. */
async function sendConfirmation(
  req: Request,
  deps: NewsletterDeps,
  input: SignupInput,
  now: number,
  ip: string | null,
): Promise<void> {
  const { db, resend, config } = deps;
  const existing = await db.findByEmail(input.email);
  if (signupDecision(existing, new Date(now)) === 'skip') return;

  const token = newToken();
  const lastSent = existing?.confirm_sent_at ? Date.parse(existing.confirm_sent_at) : null;
  const withinWindow = lastSent !== null && now - lastSent < SIGNUP_RULES.sendCountWindowMs;
  const fields = {
    full_name: input.full_name,
    signup_page: input.page,
    signup_ip: ip,
    signup_user_agent: (req.headers.get('user-agent') || '').slice(0, LIMITS.userAgent) || null,
    signup_notice: input.notice,
    confirm_token_hash: hashToken(token),
    confirm_token_expires_at: iso(now + SIGNUP_RULES.tokenLifetimeMs),
    confirm_sent_at: iso(now),
    confirm_send_count: existing && withinWindow ? existing.confirm_send_count + 1 : 1,
  };

  let row: SubscriberRow | null;
  try {
    row = existing
      ? await db.update(existing.id, fields)
      : await db.insert({ email: input.email, status: 'pending', source: 'website', ...fields });
  } catch (err) {
    if (err instanceof DuplicateEmailError) return; // a request for the same address got there first
    throw err;
  }
  if (!row) return;

  const email = buildConfirmEmail({
    confirmUrl: `${linkOrigin(req, config.siteUrl)}/newsletter/confirm/#t=${token}`,
    logoUrl: `${config.imagesBase}/static/logo-v1.png`,
  });
  try {
    await resend.sendEmail({ from: config.fromEmail, to: [input.email], replyTo: config.replyTo, ...email });
  } catch (err) {
    console.error('[newsletter-subscribe] confirmation email', err);
    // Put the confirmation fields back: any earlier link keeps working, the
    // person can try again at once, and the failed send doesn't count
    // towards the limits.
    await db
      .update(row.id, {
        confirm_token_hash: existing?.confirm_token_hash ?? null,
        confirm_token_expires_at: existing?.confirm_token_expires_at ?? null,
        confirm_sent_at: existing?.confirm_sent_at ?? null,
        confirm_send_count: existing?.confirm_send_count ?? 0,
      })
      .catch((undoErr) => console.error('[newsletter-subscribe] putting the confirmation fields back', undoErr));
  }
}

const confirmSchema = z.object({ token: z.string().regex(TOKEN_PATTERN) });

/** How the consent was given, for the record (spec §1 "Done means" 5). */
export function consentNote(row: SubscriberRow): string {
  return `Website sign-up form on ${row.signup_page || 'an unknown page'} (notice ${row.signup_notice || 'unknown'}), confirmed by clicking the emailed link`;
}

export async function handleConfirm(req: Request, deps: NewsletterDeps | null): Promise<Response> {
  const reply = (body: unknown, status = 200) => jsonResponse(body, status, METHODS);
  if (req.method === 'OPTIONS') return preflight(METHODS);
  if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
  if (!deps) return reply({ error: 'Server misconfiguration' }, 500);

  const body = await readJsonBody(req, MAX_BODY_BYTES);
  if (!body.ok) return reply({ error: body.error }, body.status);
  const parsed = confirmSchema.safeParse(body.value);
  if (!parsed.success) return reply(EXPIRED, 400);

  try {
    const { db } = deps;
    const now = deps.now();
    const row = await db.findByTokenHash(hashToken(parsed.data.token));
    if (!row?.confirm_token_expires_at || Date.parse(row.confirm_token_expires_at) <= now.getTime()) {
      return reply(EXPIRED, 400);
    }

    const confirmed = await db.update(
      row.id,
      {
        status: 'subscribed',
        source: 'website',
        consent_at: now.toISOString(),
        consent_note: consentNote(row),
        unsubscribed_at: null,
        unsubscribe_source: null,
        confirm_token_hash: null,
        confirm_token_expires_at: null,
        confirm_send_count: 0,
        resend_synced_at: null,
      },
      row.updated_at,
    );
    if (!confirmed) return reply(EXPIRED, 400); // the row changed meanwhile, e.g. a second click

    await db.unErase(hashEmail(row.email)).catch((err) => console.error('[newsletter-confirm] erasure list', err));
    // Tell Resend now. If that fails, the row stays queued and the next sync sends it.
    await pushAndRecord(deps, confirmed).catch((err) => console.error('[newsletter-confirm] Resend', err));
    return reply({ ok: true });
  } catch (err) {
    console.error('[newsletter-confirm]', err);
    return reply({ error: 'Something went wrong. Please try again.' }, 500);
  }
}
