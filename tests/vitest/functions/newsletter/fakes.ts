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
import { ResendError, type BroadcastInput, type EmailInput, type ResendClient } from '@/netlify/functions/_shared/resend.mts';
import type { IssueRow, IssueStatus, IssueSummary } from '@/lib/newsletter/issue';
import type { ImageStorage, IssuesDb, SettingsStore } from '@/netlify/functions/_shared/newsletter-issues-db.mts';
import { DEFAULT_SETTINGS, type NewsletterSettings } from '@/lib/newsletter/settings';
import type { NewsletterPost } from '@/lib/newsletter/posts';

/** Three posts, newest first: two with an email photo, one without. */
export const POSTS: NewsletterPost[] = [
  {
    slug: 'no-photo-post',
    title: 'A Post Without a Photo',
    date: '2025-12-25T09:00:00',
    excerpt: 'No photo here.',
    intro: 'This post has no featured image, so the newsletter never picks it on its own.',
    kicker: 'A moment for yourself',
    image: null,
    readingMinutes: 4,
    url: 'https://hopetrustindia.com/blogs/no-photo-post/',
  },
  {
    slug: 'the-most-important-connection-you-can-have-with-yourself',
    title: 'The Most Important Connection You Can Have: With Yourself',
    date: '2025-12-20T11:30:02',
    excerpt: 'Strengthen your self-connection.',
    intro: 'Before you can love, trust, or genuinely know another person, you must first reconcile with yourself.',
    kicker: 'A moment for yourself',
    image: 'https://images.unsplash.com/photo-1?w=1200&h=750&fit=crop&fm=jpg&q=80',
    readingMinutes: 9,
    url: 'https://hopetrustindia.com/blogs/the-most-important-connection-you-can-have-with-yourself/',
  },
  {
    slug: 'surrender-to-win',
    title: 'Surrender to Win: The Liberating Paradox at the Heart of All Growth',
    date: '2025-11-08T11:22:02',
    excerpt: 'Letting go.',
    intro: 'Surrender sounds like losing, yet in recovery it is often the first real win, the moment the fight ends.',
    kicker: 'Addiction',
    image: 'https://hopetrustindia.com/images/blog/surrender.jpg',
    readingMinutes: 6,
    url: 'https://hopetrustindia.com/blogs/surrender-to-win/',
  },
];

/** newsletter_settings in memory: one row, as section 7 creates it. */
export function createMemorySettings() {
  let row: NewsletterSettings = structuredClone(DEFAULT_SETTINGS);
  const saves: { settings: NewsletterSettings; actor: string }[] = [];
  const store: SettingsStore = {
    async get() {
      return structuredClone(row);
    },
    async save(settings, actor) {
      row = structuredClone(settings);
      saves.push({ settings: structuredClone(settings), actor });
      return structuredClone(row);
    },
  };
  return { store, saves };
}

export const SEGMENT = 'segment-newsletter';
export const SITE = 'https://hopetrustindia.com';
export const ADMIN_TOKEN = 'admin-token';
export const ADMIN_EMAIL = 'admin@hopetrustindia.com';
export const IMAGES_BASE = 'https://abc.supabase.co/storage/v1/object/public/newsletter-images';
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
  const requests: Array<{ id: number; ip: string | null; requested_at: string }> = [];
  let requestIds = 0;
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
      const id = ++requestIds;
      requests.push({ id, ip, requested_at: atIso });
      return id;
    },
    async deleteRequest(id) {
      const at = requests.findIndex((r) => r.id === id);
      if (at >= 0) requests.splice(at, 1);
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

export interface FakeBroadcast {
  id: string;
  name: string;
  status: string;
  sentAt: string | null;
  /** What the handler sent, for broadcasts it created. */
  input?: BroadcastInput;
}

export function createFakeResend() {
  const contacts = new Map<string, FakeContact>();
  const sent: EmailInput[] = [];
  const calls: string[] = [];
  const failures: Array<{ method: string; error: Error }> = [];
  /** Newest first, as Resend lists them. */
  const broadcasts: FakeBroadcast[] = [];
  const lostReplies: Error[] = [];
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
    async sendBroadcast(input) {
      step('sendBroadcast');
      const id = `broadcast-${broadcasts.length + 1}`;
      broadcasts.unshift({ id, name: input.name, status: 'sent', sentAt: '2026-10-14T10:00:00.000Z', input });
      // The broadcast went out, but the answer didn't arrive.
      const lost = lostReplies.shift();
      if (lost) throw lost;
      return id;
    },
    async listBroadcasts(after) {
      step('listBroadcasts');
      const start = after ? broadcasts.findIndex((b) => b.id === after) + 1 : 0;
      return {
        broadcasts: broadcasts.slice(start, start + 100).map(({ id, name, status, sentAt }) => ({ id, name, status, sentAt })),
        hasMore: start + 100 < broadcasts.length,
      };
    },
  };

  return {
    client,
    contacts,
    sent,
    calls,
    add,
    find,
    broadcasts,
    /** Adds a broadcast someone else made, newest first. */
    addBroadcast(b: { name: string; status: string; sentAt?: string | null }): FakeBroadcast {
      const added = { id: `broadcast-${broadcasts.length + 1}`, name: b.name, status: b.status, sentAt: b.sentAt ?? null };
      broadcasts.unshift(added);
      return added;
    },
    /** The next broadcast is sent, but the call throws `error`, as when Resend's answer is lost. */
    loseNextReply(error: Error = new ResendError(500, 'application_error', 'Resend is down')) {
      lostReplies.push(error);
    },
    /** Makes the next call to `method` throw `error`. */
    failNext(method: keyof ResendClient, error: Error = new ResendError(500, 'application_error', 'Resend is down')) {
      failures.push({ method, error });
    },
  };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

/** newsletter_issues in memory, with the real table's guards (Database/newsletter.sql §6). */
export function createMemoryIssues(now: () => Date) {
  const rows = new Map<string, IssueRow>();
  let ids = 0;
  let lastStamp = 0;
  const stamp = () => {
    lastStamp = Math.max(now().getTime(), lastStamp + 1);
    return new Date(lastStamp).toISOString();
  };
  const nextId = () => `11111111-1111-4111-8111-${String(++ids).padStart(12, '0')}`;
  const blank = {
    last_error: null,
    resend_broadcast_id: null,
    recipient_count: null,
    sent_at: null,
    sent_by: null,
  };
  /** Section 7's column defaults. */
  const plain = {
    kind: 'manual' as const,
    post_slug: null,
    kicker: '',
    intro: '',
    question: '',
    reading_minutes: null,
    issue_number: null,
    scheduled_for: null,
    preview_sent_at: null,
    reason: null,
  };
  const blogRows = (status: IssueStatus[]) =>
    Array.from(rows.values()).filter((r) => r.kind === 'blog' && status.includes(r.status));
  const sent = () =>
    Array.from(rows.values())
      .filter((r) => r.status === 'sent')
      .sort((a, b) => String(b.sent_at).localeCompare(String(a.sent_at)));

  /** Changes a row only while it is in one of `from` (and unchanged since `ifUpdatedAt`), like the real update. */
  function guarded(id: string, from: IssueStatus[], patch: Partial<IssueRow>, ifUpdatedAt?: string): IssueRow | null {
    const row = rows.get(id);
    if (!row || !from.includes(row.status) || (ifUpdatedAt !== undefined && row.updated_at !== ifUpdatedAt)) return null;
    const next: IssueRow = { ...row, ...clone(patch), updated_at: stamp() };
    rows.set(id, next);
    return clone(next);
  }

  const summary = (r: IssueRow): IssueSummary => ({
    id: r.id,
    subject: r.subject,
    issue_date: r.issue_date,
    status: r.status,
    recipient_count: r.recipient_count,
    sent_at: r.sent_at,
    last_error: r.last_error,
    updated_at: r.updated_at,
    kind: r.kind,
    scheduled_for: r.scheduled_for,
    reason: r.reason,
  });

  const issues: IssuesDb = {
    async list() {
      return Array.from(rows.values())
        .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))
        .map(summary);
    },
    async get(id) {
      const row = rows.get(id);
      return row ? clone(row) : null;
    },
    async create(fields, actor) {
      const at = stamp();
      const row: IssueRow = {
        ...plain,
        ...clone(fields),
        ...blank,
        id: nextId(),
        status: 'draft',
        created_by: actor,
        updated_by: actor,
        created_at: at,
        updated_at: at,
      };
      rows.set(row.id, row);
      return clone(row);
    },
    async saveDraft(id, fields, actor, ifUpdatedAt) {
      return guarded(id, ['draft', 'scheduled'], { ...fields, updated_by: actor }, ifUpdatedAt);
    },
    async deleteDraft(id) {
      if (rows.get(id)?.status !== 'draft') return false;
      return rows.delete(id);
    },
    async lockForSend(id, actor, issueNumber, from) {
      return guarded(id, [from], { status: 'sending', sent_by: actor, last_error: null, issue_number: issueNumber });
    },
    async markSent(id, fields) {
      return guarded(id, ['sending', 'needs_check'], { ...fields, status: 'sent', last_error: null });
    },
    async backToDraft(id, error, to = 'draft') {
      return guarded(id, ['sending', 'needs_check'], { status: to, sent_by: null, last_error: error, issue_number: null });
    },
    async markNeedsCheck(id, error) {
      return guarded(id, ['sending'], { status: 'needs_check', last_error: error });
    },
    async createBlog(fields) {
      if (Array.from(rows.values()).some((r) => r.kind === 'blog' && r.scheduled_for === fields.scheduled_for)) return null;
      const at = stamp();
      const row: IssueRow = {
        ...plain,
        ...clone(fields),
        ...blank,
        id: nextId(),
        created_by: 'automatic',
        updated_by: 'automatic',
        created_at: at,
        updated_at: at,
      };
      rows.set(row.id, row);
      return clone(row);
    },
    async blogSlot(scheduledFor) {
      const row = Array.from(rows.values()).find((r) => r.kind === 'blog' && r.scheduled_for === scheduledFor);
      return row ? clone(row) : null;
    },
    async claimPreview(id, at) {
      const row = rows.get(id);
      if (!row || row.preview_sent_at !== null) return false;
      rows.set(id, { ...row, preview_sent_at: at, updated_at: stamp() });
      return true;
    },
    async releasePreview(id) {
      const row = rows.get(id);
      if (row) rows.set(id, { ...row, preview_sent_at: null, updated_at: stamp() });
    },
    async setOutcome(id, from, to, reason) {
      return guarded(id, from, { status: to, reason });
    },
    async overdueScheduled(before) {
      return blogRows(['scheduled'])
        .filter((r) => r.scheduled_for !== null && r.scheduled_for < before)
        .map(clone);
    },
    async blogNeedsCheck() {
      return blogRows(['needs_check', 'sending']).map(clone);
    },
    async lastSentAt() {
      return sent()[0]?.sent_at ?? null;
    },
    async sentPostSlugs() {
      return sent()
        .map((r) => r.post_slug)
        .filter((slug): slug is string => slug !== null);
    },
    async recentHeroImages(n) {
      return sent()
        .map((r) => r.hero_image_url)
        .filter((url): url is string => url !== null)
        .slice(0, n);
    },
    async nextIssueNumber() {
      return Array.from(rows.values()).reduce((max, r) => Math.max(max, r.issue_number ?? 0), 0) + 1;
    },
  };

  return {
    issues,
    rows,
    /** Puts an issue straight into the table, defaults filled in, for arranging a test. */
    seed(fields: Partial<IssueRow> = {}): IssueRow {
      const at = stamp();
      const row: IssueRow = {
        subject: '',
        preheader: '',
        issue_date: '2026-10-14',
        title: '',
        hero_image_url: null,
        hero_image_alt: '',
        body: { type: 'doc', content: [] },
        share_url: null,
        ...plain,
        ...blank,
        id: nextId(),
        status: 'draft',
        created_by: ADMIN_EMAIL,
        updated_by: null,
        created_at: at,
        updated_at: at,
        ...clone(fields),
      };
      rows.set(row.id, row);
      return clone(row);
    },
    get(id: string): IssueRow | undefined {
      const row = rows.get(id);
      return row ? clone(row) : undefined;
    },
  };
}

/** Signed upload URLs that record the paths asked for. */
export function createFakeImages(imagesBase: string) {
  const paths: string[] = [];
  const storage: ImageStorage = {
    async createUploadUrl(path) {
      paths.push(path);
      const token = `token-${paths.length}`;
      return {
        path,
        token,
        signedUrl: `https://abc.supabase.co/storage/v1/object/upload/sign/newsletter-images/${path}?token=${token}`,
        publicUrl: `${imagesBase}/${path}`,
      };
    },
  };
  return { storage, paths };
}

export function makeDeps(overrides: Partial<NewsletterDeps> = {}) {
  const clock = createClock();
  const memory = createMemoryDb(clock.now);
  const issueStore = createMemoryIssues(clock.now);
  const images = createFakeImages(IMAGES_BASE);
  const resend = createFakeResend();
  const settings = createMemorySettings();
  /** Every wait a handler asked for, in ms. The fake returns at once and leaves the clock alone. */
  const sleeps: number[] = [];
  const deps: NewsletterDeps = {
    db: memory.db,
    issues: issueStore.issues,
    settings: settings.store,
    posts: () => POSTS,
    images: images.storage,
    resend: resend.client,
    config: {
      segmentId: SEGMENT,
      fromEmail: 'Hope Trust <newsletter@hopetrustindia.com>',
      replyTo: 'frontoffice@hopetrustindia.com',
      siteUrl: SITE,
      imagesBase: IMAGES_BASE,
    },
    now: clock.now,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    verifyAdmin: (req) => (req.headers.get('authorization') === `Bearer ${ADMIN_TOKEN}` ? { email: ADMIN_EMAIL } : null),
    ...overrides,
  };
  return { deps, clock, memory, issueStore, images, resend, sleeps, settings };
}

export function jsonRequest(url: string, method: string, body?: unknown, headers: Record<string, string> = {}): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
