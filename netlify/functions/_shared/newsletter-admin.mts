// /api/admin-newsletter-subscribers: the Subscribers screen's API (spec §8.2,
// §11). Admin JWT required. Imports, exports, unsubscribes and deletes go to
// admin_audit_log; a delete records the subscriber id, never the address.

import { z } from 'zod';
import { IMPORT_CHUNK, cleanRows } from '../../../lib/newsletter/import';
import {
  LIMITS,
  SUBSCRIBER_SOURCES,
  SUBSCRIBER_STATUSES,
  type AdminSubscriber,
  type SubscriberRow,
  type SubscriberSource,
  type SubscriberStatus,
} from '../../../lib/newsletter/subscriber';
import type { AdminUser } from './admin.mts';
import { clientIp, corsHeaders, jsonResponse, preflight, readJsonBody } from './http.mts';
import { hashEmail } from './newsletter-crypto.mts';
import type { SubscriberFilters } from './newsletter-db.mts';
import type { NewsletterDeps } from './newsletter-deps.mts';
import { SIGNUP_RULES } from './newsletter-signup.mts';
import { SYNC_TIME_BUDGET_MS, pushAndRecord, runSync } from './newsletter-sync.mts';

const METHODS = 'GET, POST, PATCH, DELETE, OPTIONS';
const MAX_BODY_BYTES = 256 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

export const CSV_COLUMNS = [
  'email', 'full_name', 'status', 'source', 'consent_at', 'consent_note', 'imported_by', 'import_batch_id',
  'signup_page', 'signup_ip', 'signup_user_agent', 'signup_notice', 'unsubscribed_at', 'unsubscribe_source', 'created_at',
] as const;

/**
 * One CSV cell. Text starting with = + - @ (or a tab or carriage return) gets
 * a leading ' so Excel shows it instead of running it as a formula: names
 * come from the public.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** CSV with a UTF-8 byte-order mark, so Excel shows Hindi and Telugu names. */
export function toCsv(rows: AdminSubscriber[]): string {
  const lines = [CSV_COLUMNS.join(',')];
  for (const row of rows) lines.push(CSV_COLUMNS.map((column) => csvCell(row[column])).join(','));
  return `﻿${lines.join('\r\n')}\r\n`;
}

function toAdmin(row: SubscriberRow): AdminSubscriber {
  const { confirm_token_hash: _hash, confirm_token_expires_at: _expires, ...rest } = row;
  return rest;
}

function filtersFrom(params: URLSearchParams): SubscriberFilters {
  const status = params.get('status') ?? '';
  const source = params.get('source') ?? '';
  return {
    q: (params.get('q') ?? '').slice(0, 100),
    status: (SUBSCRIBER_STATUSES as readonly string[]).includes(status) ? (status as SubscriberStatus) : '',
    source: (SUBSCRIBER_SOURCES as readonly string[]).includes(source) ? (source as SubscriberSource) : '',
  };
}

const importSchema = z.object({
  batch_id: z.string().regex(UUID, 'The import is missing its batch id. Reload the page and try again.'),
  statement: z
    .string()
    .trim()
    .min(10, 'Say where and when these people agreed (at least 10 characters).')
    .max(LIMITS.statement, 'Please shorten the statement to 500 characters.'),
  attested: z.literal(true, { errorMap: () => ({ message: 'Tick the box to confirm everyone agreed.' }) }),
  rows: z
    .array(z.object({ email: z.string().max(1000), name: z.string().max(1000).nullable().optional() }))
    .min(1, 'There are no rows to import.')
    .max(IMPORT_CHUNK, `Send at most ${IMPORT_CHUNK} rows at a time.`),
});

interface Ctx {
  req: Request;
  deps: NewsletterDeps;
  admin: AdminUser;
  params: URLSearchParams;
  reply: (body: unknown, status?: number) => Response;
}

export async function handleAdminSubscribers(req: Request, deps: NewsletterDeps | null): Promise<Response> {
  const reply = (body: unknown, status = 200) => jsonResponse(body, status, METHODS);
  if (req.method === 'OPTIONS') return preflight(METHODS);
  if (!deps) return reply({ error: 'Server misconfiguration' }, 500);
  const admin = deps.verifyAdmin(req);
  if (!admin) return reply({ error: 'Unauthorized' }, 401);

  const params = new URL(req.url).searchParams;
  const ctx: Ctx = { req, deps, admin, params, reply };
  try {
    if (req.method === 'GET') {
      await deleteStalePending(deps);
      return params.get('format') === 'csv' ? await exportCsv(ctx) : await list(ctx);
    }
    if (req.method === 'POST' && params.get('action') === 'import') return await importRows(ctx);
    if (req.method === 'POST' && params.get('action') === 'sync') return await sync(ctx);
    if (req.method === 'PATCH') return await unsubscribe(ctx);
    if (req.method === 'DELETE') return await erase(ctx);
    return reply({ error: 'Method not allowed' }, 405);
  } catch (err) {
    console.error('[admin-newsletter-subscribers]', err);
    return reply({ error: 'Something went wrong. Please try again.' }, 500);
  }
}

/**
 * The 30-day rule for unconfirmed sign-ups (spec §7.2), run here too so a
 * quiet week without sign-ups doesn't keep them longer. Errors are only logged.
 */
async function deleteStalePending(deps: NewsletterDeps): Promise<void> {
  const before = new Date(deps.now().getTime() - SIGNUP_RULES.pendingLifetimeMs).toISOString();
  await deps.db.deleteStalePending(before).catch((err) => console.error('[admin-newsletter-subscribers] clean-up', err));
}

async function list({ deps, params, reply }: Ctx): Promise<Response> {
  const limit = Math.min(Math.max(parseInt(params.get('limit') ?? '', 10) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const offset = Math.max(parseInt(params.get('offset') ?? '', 10) || 0, 0);
  const [{ rows, total }, counts, needsPush] = await Promise.all([
    deps.db.list(filtersFrom(params), limit, offset),
    deps.db.counts(),
    deps.db.countToPush(),
  ]);
  return reply({ subscribers: rows, total, counts, needs_push: needsPush, limit, offset });
}

async function exportCsv({ req, deps, admin, params }: Ctx): Promise<Response> {
  const filters = filtersFrom(params);
  const rows = await deps.db.listAll(filters);
  await deps.db.audit({
    action: 'NEWSLETTER_EXPORT',
    actorEmail: admin.email,
    // Whether a search was used, not its text: it may be an address that is later erased.
    metadata: { rows: rows.length, status: filters.status, source: filters.source, q_used: Boolean(filters.q?.trim()) },
    ip: clientIp(req),
  });
  return new Response(toCsv(rows), {
    status: 200,
    headers: {
      ...corsHeaders(METHODS),
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="newsletter-subscribers-${deps.now().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}

async function importRows({ req, deps, admin, reply }: Ctx): Promise<Response> {
  const body = await readJsonBody(req, MAX_BODY_BYTES);
  if (!body.ok) return reply({ error: body.error }, body.status);
  const parsed = importSchema.safeParse(body.value);
  if (!parsed.success) return reply({ error: parsed.error.issues[0]?.message ?? 'Invalid import' }, 400);
  const { batch_id, statement, rows } = parsed.data;

  const cleaned = cleanRows(rows);
  const existing = await deps.db.existingEmails(cleaned.rows.map((r) => r.email));
  const fresh = cleaned.rows.filter((r) => !existing.has(r.email));
  const hashes = new Map(fresh.map((r) => [r.email, hashEmail(r.email)]));
  const erased = await deps.db.erasedHashes([...hashes.values()]);
  const allowed = fresh.filter((r) => !erased.has(hashes.get(r.email) as string));

  const now = deps.now().toISOString();
  const inserted = await deps.db.insertImported(
    allowed.map((r) => ({
      email: r.email,
      full_name: r.name,
      status: 'subscribed' as const,
      source: 'import' as const,
      consent_at: now,
      consent_note: statement,
      imported_by: admin.email,
      import_batch_id: batch_id,
    })),
  );
  const result = {
    inserted,
    // Rows that another import added in the meantime count as already there.
    skipped_existing: existing.size + (allowed.length - inserted),
    skipped_erased: fresh.length - allowed.length,
    invalid: cleaned.invalid,
    duplicates: cleaned.duplicates,
  };
  await deps.db.audit({
    action: 'NEWSLETTER_IMPORT',
    actorEmail: admin.email,
    metadata: { batch_id, ...result },
    ip: clientIp(req),
  });
  return reply(result);
}

async function sync({ req, deps, reply }: Ctx): Promise<Response> {
  const body = await readJsonBody(req, MAX_BODY_BYTES);
  const pull = !(body.ok && (body.value as { pull?: unknown } | null)?.pull === false);
  try {
    return reply(await runSync(deps, { pull, deadline: deps.now().getTime() + SYNC_TIME_BUDGET_MS }));
  } catch (err) {
    console.error('[admin-newsletter-subscribers] sync', err);
    return reply({ error: `Couldn't reach Resend: ${err instanceof Error ? err.message : 'unknown error'}` }, 502);
  }
}

async function unsubscribe({ req, deps, admin, params, reply }: Ctx): Promise<Response> {
  const id = params.get('id') ?? '';
  if (!UUID.test(id)) return reply({ error: 'A valid id is required' }, 400);
  const row = await deps.db.findById(id);
  if (!row) return reply({ error: 'Subscriber not found' }, 404);
  if (row.status !== 'subscribed') return reply({ error: 'Only subscribed people can be unsubscribed.' }, 409);

  const updated = await deps.db.update(
    id,
    { status: 'unsubscribed', unsubscribed_at: deps.now().toISOString(), unsubscribe_source: 'admin', resend_synced_at: null },
    row.updated_at,
  );
  if (!updated) return reply({ error: 'This subscriber just changed. Refresh and try again.' }, 409);
  await deps.db.audit({ action: 'NEWSLETTER_UNSUBSCRIBE', actorEmail: admin.email, resourceId: id, ip: clientIp(req) });

  // Tell Resend now. If that fails, the row stays queued for the next sync.
  const sent = await pushAndRecord(deps, updated).catch((err) => {
    console.error('[admin-newsletter-subscribers] Resend', err);
    return false;
  });
  const latest = (await deps.db.findById(id)) ?? updated;
  return reply({ subscriber: toAdmin(latest), resend: sent ? 'updated' : 'queued' });
}

async function erase({ req, deps, admin, params, reply }: Ctx): Promise<Response> {
  const id = params.get('id') ?? '';
  if (!UUID.test(id)) return reply({ error: 'A valid id is required' }, 400);
  const row = await deps.db.findById(id);
  if (!row) return reply({ error: 'Subscriber not found' }, 404);

  // Resend first: if this fails the row stays, so the delete can be retried
  // and the person never sits in the segment with no row behind them.
  try {
    const removed = row.resend_contact_id ? await deps.resend.deleteContact(row.resend_contact_id) : false;
    if (!removed) await deps.resend.deleteContact(row.email);
  } catch (err) {
    console.error('[admin-newsletter-subscribers] Resend delete', err);
    return reply({ error: "Couldn't remove this person from Resend, so nothing was deleted. Try again in a minute." }, 502);
  }

  await deps.db.erase(id, hashEmail(row.email));
  await deps.db.audit({
    action: 'NEWSLETTER_DELETE',
    actorEmail: admin.email,
    resourceId: id,
    metadata: { status: row.status, source: row.source },
    ip: clientIp(req),
  });
  return reply({ ok: true });
}
