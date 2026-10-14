// In-memory stand-ins for the newsletter functions' services. They follow the
// real ones' rules (unique emails, guarded updates, Resend's global contacts
// in segments), so handler tests exercise real behaviour without Supabase or
// Resend. Not a test file: vitest only runs *.test.ts.

import type { AdminSubscriber, SubscriberRow, SubscriberStatus } from '@/lib/newsletter/subscriber';
import {
  DuplicateEmailError,
  type AuditEntry,
  type NewSubscriber,
  type NewsletterDb,
  type SubscriberFilters,
} from '@/netlify/functions/_shared/newsletter-db.mts';
import type { NewsletterDeps } from '@/netlify/functions/_shared/newsletter-deps.mts';
import { ResendError, type EmailInput, type ResendClient } from '@/netlify/functions/_shared/resend.mts';

export const SEGMENT = 'segment-newsletter';
export const SITE = 'https://hopetrustindia.com';
export const ADMIN_TOKEN = 'admin-token';
export const ADMIN_EMAIL = 'admin@hopetrustindia.com';
const START = Date.parse('2026-10-14T10:00:00.000Z');

export function createClock(start = START) {
  let ms = start;
  return {
    now: () => new Date(ms),
    advance(by: number) {
      ms += by;
    },
  };
}

const EMPTY: Omit<SubscriberRow, 'id' | 'email' | 'status' | 'source' | 'created_at' | 'updated_at'> = {
  full_name: null,
  consent_at: null,
  consent_note: null,
  imported_by: null,
  import_batch_id: null,
  signup_page: null,
  signup_ip: null,
  signup_user_agent: null,
  signup_notice: null,
  confirm_token_hash: null,
  confirm_token_expires_at: null,
  confirm_sent_at: null,
  confirm_send_count: 0,
  unsubscribed_at: null,
  unsubscribe_source: null,
  resend_contact_id: null,
  resend_synced_at: null,
};

const waiting = (r: SubscriberRow) =>
  (r.status === 'subscribed' || r.status === 'unsubscribed') && r.resend_synced_at === null;

function stripToken(row: SubscriberRow): AdminSubscriber {
  const { confirm_token_hash: _hash, confirm_token_expires_at: _expires, ...rest } = row;
  return rest;
}

/** Postgres text can't hold \u0000: PostgREST refuses the whole write (error 22P05). */
function refuseNul(values: object): void {
  for (const value of Object.values(values)) {
    if (typeof value === 'string' && value.includes('\u0000')) throw new Error('unsupported Unicode escape sequence');
  }
}

export function createMemoryDb(now: () => Date) {
  const rows = new Map<string, SubscriberRow>();
  const erased = new Set<string>();
  const audits: AuditEntry[] = [];
  /** newsletter_signup_requests, oldest first. */
  const requests: Array<{ ip: string | null; requested_at: string }> = [];
  let lastStamp = 0;
  let ids = 0;

  /** A timestamp that is never repeated, so guarded updates can tell versions apart. */
  const stamp = () => {
    lastStamp = Math.max(now().getTime(), lastStamp + 1);
    return new Date(lastStamp).toISOString();
  };
  const nextId = () => `00000000-0000-4000-8000-${String(++ids).padStart(12, '0')}`;
  const all = () => [...rows.values()];
  const matches = (r: SubscriberRow, f: SubscriberFilters) =>
    (!f.status || r.status === f.status) &&
    (!f.source || r.source === f.source) &&
    (!f.q || `${r.email} ${r.full_name ?? ''}`.toLowerCase().includes(f.q.trim().toLowerCase()));

  function insertRow(row: NewSubscriber): SubscriberRow {
    refuseNul(row);
    if (all().some((r) => r.email === row.email)) throw new DuplicateEmailError();
    const created = stamp();
    const full: SubscriberRow = { ...EMPTY, ...row, id: nextId(), created_at: created, updated_at: created };
    rows.set(full.id, full);
    return { ...full };
  }

  const db: NewsletterDb = {
    async findByEmail(email) {
      const r = all().find((x) => x.email === email);
      return r ? { ...r } : null;
    },
    async findById(id) {
      const r = rows.get(id);
      return r ? { ...r } : null;
    },
    async findByTokenHash(hash) {
      const r = all().find((x) => x.confirm_token_hash === hash);
      return r ? { ...r } : null;
    },
    async insert(row) {
      return insertRow(row);
    },
    async update(id, patch, ifUpdatedAt) {
      refuseNul(patch);
      const r = rows.get(id);
      if (!r || (ifUpdatedAt && r.updated_at !== ifUpdatedAt)) return null;
      const next = { ...r, ...patch, updated_at: stamp() };
      rows.set(id, next);
      return { ...next };
    },
    async countRequestsSince(sinceIso, ip) {
      return requests.filter((r) => r.requested_at >= sinceIso && (ip === undefined || r.ip === ip)).length;
    },
    async recordRequest(ip, atIso) {
      refuseNul({ ip });
      requests.push({ ip, requested_at: atIso });
    },
    async deleteRequestsBefore(beforeIso) {
      const kept = requests.filter((r) => r.requested_at >= beforeIso);
      const deleted = requests.length - kept.length;
      requests.splice(0, requests.length, ...kept);
      return deleted;
    },
    async deleteStalePending(beforeIso) {
      let deleted = 0;
      for (const r of all()) {
        if (r.status === 'pending' && (r.confirm_sent_at ?? r.created_at) < beforeIso) {
          rows.delete(r.id);
          deleted++;
        }
      }
      return deleted;
    },
    async list(filters, limit, offset) {
      const found = all()
        .filter((r) => matches(r, filters))
        .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
      return { rows: found.slice(offset, offset + limit).map(stripToken), total: found.length };
    },
    async listAll(filters) {
      return all()
        .filter((r) => matches(r, filters))
        .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
        .map(stripToken);
    },
    async counts() {
      const counts: Record<SubscriberStatus, number> = { pending: 0, subscribed: 0, unsubscribed: 0 };
      for (const r of all()) counts[r.status]++;
      return counts;
    },
    async existingEmails(emails) {
      const have = new Set(all().map((r) => r.email));
      return new Set(emails.filter((e) => have.has(e)));
    },
    async insertImported(newRows) {
      let added = 0;
      for (const row of newRows) {
        try {
          insertRow(row);
          added++;
        } catch (err) {
          if (!(err instanceof DuplicateEmailError)) throw err;
        }
      }
      return added;
    },
    async erasedHashes(hashes) {
      return new Set(hashes.filter((h) => erased.has(h)));
    },
    async unErase(hash) {
      erased.delete(hash);
    },
    async erase(id, hash) {
      erased.add(hash);
      rows.delete(id);
    },
    async syncRows() {
      return all().map(({ id, email, status, source, resend_contact_id, resend_synced_at, updated_at }) => ({
        id,
        email,
        status,
        source,
        resend_contact_id,
        resend_synced_at,
        updated_at,
      }));
    },
    async rowsToPush(limit) {
      return all()
        .filter(waiting)
        .sort((a, b) => a.updated_at.localeCompare(b.updated_at))
        .slice(0, limit)
        .map((r) => ({ ...r }));
    },
    async countToPush() {
      return all().filter(waiting).length;
    },
    async markPulledUnsubscribed(ids, nowIso, listedAtIso) {
      let changed = 0;
      for (const id of ids) {
        const r = rows.get(id);
        if (r && r.status === 'subscribed' && r.resend_synced_at !== null && r.resend_synced_at < listedAtIso) {
          rows.set(id, {
            ...r,
            status: 'unsubscribed',
            unsubscribed_at: nowIso,
            unsubscribe_source: 'resend',
            resend_synced_at: nowIso,
            updated_at: stamp(),
          });
          changed++;
        }
      }
      return changed;
    },
    async markNeedsPush(ids) {
      for (const id of ids) {
        const r = rows.get(id);
        if (r) rows.set(id, { ...r, resend_synced_at: null, updated_at: stamp() });
      }
    },
    async audit(entry) {
      audits.push(entry);
    },
  };

  return {
    db,
    rows,
    erased,
    audits,
    requests,
    /** Puts a row straight into the table, defaults filled in, for arranging a test. */
    seed(row: Partial<SubscriberRow> & { email: string }): SubscriberRow {
      const created = stamp();
      const full: SubscriberRow = {
        ...EMPTY,
        status: 'subscribed',
        source: 'website',
        id: nextId(),
        created_at: created,
        updated_at: created,
        ...row,
      };
      rows.set(full.id, full);
      return { ...full };
    },
    get(id: string): SubscriberRow | undefined {
      const r = rows.get(id);
      return r ? { ...r } : undefined;
    },
    byEmail(email: string): SubscriberRow | undefined {
      const r = all().find((x) => x.email === email);
      return r ? { ...r } : undefined;
    },
  };
}

export interface FakeContact {
  id: string;
  email: string;
  unsubscribed: boolean;
  segments: Set<string>;
}

export function createFakeResend() {
  const contacts = new Map<string, FakeContact>();
  const sent: EmailInput[] = [];
  const calls: string[] = [];
  const failures: Array<{ method: string; error: Error }> = [];
  let ids = 0;

  const find = (key: string) =>
    contacts.get(key) ?? [...contacts.values()].find((c) => c.email === key.toLowerCase());
  /** Records a call, and throws if a test queued a failure for this method. */
  function step(method: string) {
    calls.push(method);
    const queued = failures.findIndex((f) => f.method === method);
    if (queued >= 0) throw failures.splice(queued, 1)[0].error;
  }
  function add(email: string, opts: { unsubscribed?: boolean; segments?: string[] } = {}): FakeContact {
    const contact = {
      id: `contact-${++ids}`,
      email: email.toLowerCase(),
      unsubscribed: opts.unsubscribed ?? false,
      segments: new Set(opts.segments ?? []),
    };
    contacts.set(contact.id, contact);
    return contact;
  }

  const client: ResendClient = {
    async getContact(key) {
      step('getContact');
      const c = find(key);
      return c ? { id: c.id, email: c.email, unsubscribed: c.unsubscribed } : null;
    },
    async createContact(email, segmentId) {
      step('createContact');
      if (find(email)) throw new ResendError(409, 'validation_error', 'Contact already exists');
      return add(email, { segments: [segmentId] }).id;
    },
    async updateContact(key, patch) {
      step('updateContact');
      const c = find(key);
      if (!c) return false;
      c.unsubscribed = patch.unsubscribed;
      return true;
    },
    async deleteContact(key) {
      step('deleteContact');
      const c = find(key);
      if (!c) return false;
      contacts.delete(c.id);
      return true;
    },
    async addToSegment(contactId, segmentId) {
      step('addToSegment');
      const c = find(contactId);
      if (!c) throw new ResendError(404, 'not_found', 'Contact not found');
      c.segments.add(segmentId);
    },
    async removeFromSegment(contactId, segmentId) {
      step('removeFromSegment');
      find(contactId)?.segments.delete(segmentId);
    },
    async contactSegmentIds(contactId) {
      step('contactSegmentIds');
      return [...(find(contactId)?.segments ?? [])];
    },
    async listSegmentContacts(segmentId, after) {
      step('listSegmentContacts');
      const members = [...contacts.values()].filter((c) => c.segments.has(segmentId));
      const start = after ? members.findIndex((c) => c.id === after) + 1 : 0;
      return {
        contacts: members.slice(start, start + 100).map((c) => ({ id: c.id, email: c.email, unsubscribed: c.unsubscribed })),
        hasMore: start + 100 < members.length,
      };
    },
    async sendEmail(input) {
      step('sendEmail');
      sent.push(input);
      return `email-${sent.length}`;
    },
  };

  return {
    client,
    contacts,
    sent,
    calls,
    add,
    find,
    /** Makes the next call to `method` throw `error`. */
    failNext(method: keyof ResendClient, error: Error = new ResendError(500, 'application_error', 'Resend is down')) {
      failures.push({ method, error });
    },
  };
}

export function makeDeps(overrides: Partial<NewsletterDeps> = {}) {
  const clock = createClock();
  const memory = createMemoryDb(clock.now);
  const resend = createFakeResend();
  /** Every wait a handler asked for, in ms. The fake returns at once and leaves the clock alone. */
  const sleeps: number[] = [];
  const deps: NewsletterDeps = {
    db: memory.db,
    resend: resend.client,
    config: {
      segmentId: SEGMENT,
      fromEmail: 'Hope Trust <newsletter@hopetrustindia.com>',
      replyTo: 'frontoffice@hopetrustindia.com',
      siteUrl: SITE,
      imagesBase: 'https://abc.supabase.co/storage/v1/object/public/newsletter-images',
    },
    now: clock.now,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    verifyAdmin: (req) => (req.headers.get('authorization') === `Bearer ${ADMIN_TOKEN}` ? { email: ADMIN_EMAIL } : null),
    ...overrides,
  };
  return { deps, clock, memory, resend, sleeps };
}

export function jsonRequest(url: string, method: string, body?: unknown, headers: Record<string, string> = {}): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
