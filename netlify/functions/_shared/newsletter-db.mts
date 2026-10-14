// Data access for the newsletter tables (Database/newsletter.sql), through the
// service-role Supabase client. Handlers depend on the NewsletterDb interface
// only; tests use the in-memory version in tests/vitest/functions/newsletter/fakes.ts.

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AdminSubscriber,
  SubscriberRow,
  SubscriberSource,
  SubscriberStatus,
} from '../../../lib/newsletter/subscriber';

export interface SubscriberFilters {
  q?: string;
  status?: SubscriberStatus | '';
  source?: SubscriberSource | '';
}

/** Columns a handler may change. */
export type SubscriberPatch = Partial<Omit<SubscriberRow, 'id' | 'email' | 'created_at' | 'updated_at'>>;
export type NewSubscriber = Pick<SubscriberRow, 'email' | 'status' | 'source'> & SubscriberPatch;
export type SyncRow = Pick<
  SubscriberRow,
  'id' | 'email' | 'status' | 'source' | 'resend_contact_id' | 'resend_synced_at' | 'updated_at'
>;

export interface AuditEntry {
  action: string;
  actorEmail: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
}

export interface NewsletterDb {
  findByEmail(email: string): Promise<SubscriberRow | null>;
  findById(id: string): Promise<SubscriberRow | null>;
  findByTokenHash(hash: string): Promise<SubscriberRow | null>;
  /** Throws DuplicateEmailError when the address is already in the table. */
  insert(row: NewSubscriber): Promise<SubscriberRow>;
  /** The updated row, or null when no row matched: deleted, or changed since `ifUpdatedAt`. */
  update(id: string, patch: SubscriberPatch, ifUpdatedAt?: string): Promise<SubscriberRow | null>;
  /** Logged sign-up requests since `sinceIso`: from every IP, or from `ip` only. */
  countRequestsSince(sinceIso: string, ip?: string): Promise<number>;
  /** Logs a sign-up request that passed the rate limits. No address is kept. */
  recordRequest(ip: string | null, atIso: string): Promise<void>;
  /** Deletes logged sign-up requests older than `beforeIso`; returns how many. */
  deleteRequestsBefore(beforeIso: string): Promise<number>;
  /** Deletes pending rows whose last confirmation email (or creation) is older than `beforeIso`. */
  deleteStalePending(beforeIso: string): Promise<number>;
  list(filters: SubscriberFilters, limit: number, offset: number): Promise<{ rows: AdminSubscriber[]; total: number }>;
  listAll(filters: SubscriberFilters): Promise<AdminSubscriber[]>;
  counts(): Promise<Record<SubscriberStatus, number>>;
  existingEmails(emails: string[]): Promise<Set<string>>;
  /** Inserts rows, skipping any address already present; returns how many were added. */
  insertImported(rows: NewSubscriber[]): Promise<number>;
  erasedHashes(hashes: string[]): Promise<Set<string>>;
  unErase(hash: string): Promise<void>;
  /** Remembers the address hash, then deletes the row. */
  erase(id: string, hash: string): Promise<void>;
  /** Every row, with the columns the sync compares. */
  syncRows(): Promise<SyncRow[]>;
  /** Subscribed or unsubscribed rows with a change Resend hasn't seen, oldest change first. */
  rowsToPush(limit: number): Promise<SubscriberRow[]>;
  countToPush(): Promise<number>;
  /**
   * Unsubscribes rows on Resend's word, skipping any row with a change waiting
   * to go to Resend, or one synced at or after `listedAtIso`: Resend's answer
   * was read before that change reached it.
   */
  markPulledUnsubscribed(ids: string[], nowIso: string, listedAtIso: string): Promise<number>;
  markNeedsPush(ids: string[]): Promise<void>;
  /** Writes admin_audit_log; never throws. */
  audit(entry: AuditEntry): Promise<void>;
}

export class DuplicateEmailError extends Error {
  constructor() {
    super('That address is already in newsletter_subscribers');
    this.name = 'DuplicateEmailError';
  }
}

const SUBSCRIBERS = 'newsletter_subscribers';
const ERASED = 'newsletter_erased';
const REQUESTS = 'newsletter_signup_requests';
/** Supabase's API returns at most 1,000 rows per request. */
const PAGE = 1000;
/** Values per `in (…)` filter, to keep request URLs short. */
const IN_CHUNK = 100;

/** Every column except the confirmation token's. */
export const ADMIN_COLUMNS = [
  'id', 'email', 'full_name', 'status', 'source', 'consent_at', 'consent_note', 'imported_by',
  'import_batch_id', 'signup_page', 'signup_ip', 'signup_user_agent', 'signup_notice',
  'confirm_sent_at', 'confirm_send_count', 'unsubscribed_at', 'unsubscribe_source',
  'resend_contact_id', 'resend_synced_at', 'created_at', 'updated_at',
].join(', ');
const SYNC_COLUMNS = 'id, email, status, source, resend_contact_id, resend_synced_at, updated_at';

export function chunked<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * An ILIKE pattern for the admin search box, or null when nothing searchable
 * is left. Characters that would break PostgREST's or=(…) syntax are dropped
 * and the LIKE wildcard "_" is escaped ("%" is dropped).
 */
export function searchPattern(q: string | undefined): string | null {
  const kept = (q ?? '').slice(0, 100).replace(/[^\p{L}\p{M}\p{N}@.+\-' _]/gu, '').trim();
  if (!kept) return null;
  return `%${kept.replace(/[_\\]/g, (c) => `\\${c}`)}%`;
}

function check(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export function createNewsletterDb(supabase: SupabaseClient): NewsletterDb {
  const table = () => supabase.from(SUBSCRIBERS);

  function filtered(query: any, filters: SubscriberFilters) {
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.source) query = query.eq('source', filters.source);
    const pattern = searchPattern(filters.q);
    if (pattern) query = query.or(`email.ilike.${pattern},full_name.ilike.${pattern}`);
    return query;
  }

  async function one(column: string, value: string): Promise<SubscriberRow | null> {
    const { data, error } = await table().select('*').eq(column, value).maybeSingle();
    check(error);
    return (data as SubscriberRow | null) ?? null;
  }

  async function headCount(narrow: (query: any) => any, from = SUBSCRIBERS): Promise<number> {
    const { count, error } = await narrow(supabase.from(from).select('id', { count: 'exact', head: true }));
    check(error);
    return count ?? 0;
  }

  async function allPages<T>(page: (from: number, to: number) => any): Promise<T[]> {
    const out: T[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await page(from, from + PAGE - 1);
      check(error);
      out.push(...((data ?? []) as T[]));
      if (!data || data.length < PAGE) return out;
    }
  }

  return {
    findByEmail: (email) => one('email', email),
    findById: (id) => one('id', id),
    findByTokenHash: (hash) => one('confirm_token_hash', hash),

    async insert(row) {
      const { data, error } = await table().insert(row).select('*').single();
      if (error?.code === '23505') throw new DuplicateEmailError();
      check(error);
      return data as SubscriberRow;
    },

    async update(id, patch, ifUpdatedAt) {
      let query = table().update(patch).eq('id', id);
      if (ifUpdatedAt) query = query.eq('updated_at', ifUpdatedAt);
      const { data, error } = await query.select('*').maybeSingle();
      check(error);
      return (data as SubscriberRow | null) ?? null;
    },

    countRequestsSince: (sinceIso, ip) =>
      headCount((query) => {
        const since = query.gte('requested_at', sinceIso);
        return ip === undefined ? since : since.eq('ip', ip);
      }, REQUESTS),

    async recordRequest(ip, atIso) {
      const { error } = await supabase.from(REQUESTS).insert({ ip, requested_at: atIso });
      check(error);
    },

    async deleteRequestsBefore(beforeIso) {
      const { data, error } = await supabase.from(REQUESTS).delete().lt('requested_at', beforeIso).select('id');
      check(error);
      return data?.length ?? 0;
    },

    async deleteStalePending(beforeIso) {
      const sent = await table().delete().eq('status', 'pending').lt('confirm_sent_at', beforeIso).select('id');
      check(sent.error);
      const neverSent = await table()
        .delete()
        .eq('status', 'pending')
        .is('confirm_sent_at', null)
        .lt('created_at', beforeIso)
        .select('id');
      check(neverSent.error);
      return (sent.data?.length ?? 0) + (neverSent.data?.length ?? 0);
    },

    // Rows from one import chunk share a created_at, so id breaks the tie and
    // paging neither repeats nor skips a row.
    async list(filters, limit, offset) {
      const { data, error, count } = await filtered(table().select(ADMIN_COLUMNS, { count: 'exact' }), filters)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(offset, offset + limit - 1);
      check(error);
      return { rows: (data ?? []) as AdminSubscriber[], total: count ?? 0 };
    },

    listAll: (filters) =>
      allPages<AdminSubscriber>((from, to) =>
        filtered(table().select(ADMIN_COLUMNS), filters)
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to),
      ),

    async counts() {
      const [pending, subscribed, unsubscribed] = await Promise.all(
        (['pending', 'subscribed', 'unsubscribed'] as const).map((status) =>
          headCount((query) => query.eq('status', status)),
        ),
      );
      return { pending, subscribed, unsubscribed };
    },

    async existingEmails(emails) {
      const found = new Set<string>();
      for (const part of chunked(emails, IN_CHUNK)) {
        const { data, error } = await table().select('email').in('email', part);
        check(error);
        for (const row of data ?? []) found.add((row as { email: string }).email);
      }
      return found;
    },

    async insertImported(rows) {
      if (rows.length === 0) return 0;
      const { data, error } = await table()
        .upsert(rows, { onConflict: 'email', ignoreDuplicates: true })
        .select('id');
      check(error);
      return data?.length ?? 0;
    },

    async erasedHashes(hashes) {
      const found = new Set<string>();
      for (const part of chunked(hashes, IN_CHUNK)) {
        const { data, error } = await supabase.from(ERASED).select('email_sha256').in('email_sha256', part);
        check(error);
        for (const row of data ?? []) found.add((row as { email_sha256: string }).email_sha256);
      }
      return found;
    },

    async unErase(hash) {
      const { error } = await supabase.from(ERASED).delete().eq('email_sha256', hash);
      check(error);
    },

    async erase(id, hash) {
      const remembered = await supabase
        .from(ERASED)
        .upsert({ email_sha256: hash }, { onConflict: 'email_sha256', ignoreDuplicates: true });
      check(remembered.error);
      const removed = await table().delete().eq('id', id);
      check(removed.error);
    },

    syncRows: () => allPages<SyncRow>((from, to) => table().select(SYNC_COLUMNS).order('id').range(from, to)),

    async rowsToPush(limit) {
      const { data, error } = await table()
        .select('*')
        .in('status', ['subscribed', 'unsubscribed'])
        .is('resend_synced_at', null)
        .order('updated_at', { ascending: true })
        .limit(limit);
      check(error);
      return (data ?? []) as SubscriberRow[];
    },

    countToPush: () =>
      headCount((query) => query.in('status', ['subscribed', 'unsubscribed']).is('resend_synced_at', null)),

    async markPulledUnsubscribed(ids, nowIso, listedAtIso) {
      let changed = 0;
      for (const part of chunked(ids, IN_CHUNK)) {
        const { data, error } = await table()
          .update({ status: 'unsubscribed', unsubscribed_at: nowIso, unsubscribe_source: 'resend', resend_synced_at: nowIso })
          .in('id', part)
          .eq('status', 'subscribed')
          // Also skips null: a change still waiting to go to Resend.
          .lt('resend_synced_at', listedAtIso)
          .select('id');
        check(error);
        changed += data?.length ?? 0;
      }
      return changed;
    },

    async markNeedsPush(ids) {
      for (const part of chunked(ids, IN_CHUNK)) {
        const { error } = await table().update({ resend_synced_at: null }).in('id', part);
        check(error);
      }
    },

    async audit(entry) {
      try {
        const { error } = await supabase.from('admin_audit_log').insert({
          action: entry.action,
          actor_email: entry.actorEmail,
          resource_type: 'newsletter_subscriber',
          resource_id: entry.resourceId ?? null,
          metadata: entry.metadata ?? {},
          ip_address: entry.ip ?? null,
        });
        if (error) console.error('[newsletter audit]', error.message);
      } catch (err) {
        console.error('[newsletter audit]', err);
      }
    },
  };
}
