// =============================================================================
// Admin client for /api/admin-newsletter-subscribers (spec §8.2, §11).
// Used by the Newsletter tab in the admin dashboard.
// =============================================================================

import type { ImportRow } from '@/lib/newsletter/import';
import type { AdminSubscriber, SubscriberSource, SubscriberStatus } from '@/lib/newsletter/subscriber';
import type { IssueRow, IssueSummary } from '@/lib/newsletter/issue';
import type { BookPanel } from '@/lib/newsletter/render';
import type { NewsletterSettings } from '@/lib/newsletter/settings';

export class UnauthorizedError extends Error {
  constructor() {
    super('Session expired. Please log in again.');
    this.name = 'UnauthorizedError';
  }
}

export interface SubscriberQuery {
  q?: string;
  status?: SubscriberStatus | '';
  source?: SubscriberSource | '';
  limit?: number;
  offset?: number;
}

export interface SubscriberList {
  subscribers: AdminSubscriber[];
  total: number;
  counts: Record<SubscriberStatus, number>;
  /** Changes not yet in Resend. */
  needs_push: number;
  limit: number;
  offset: number;
}

export interface ImportChunk {
  batch_id: string;
  statement: string;
  attested: true;
  rows: ImportRow[];
}

export interface ImportResult {
  inserted: number;
  skipped_existing: number;
  skipped_erased: number;
  invalid: number;
  duplicates: number;
}

export interface SyncResult {
  unsubscribedInResend: number;
  removedFromSegment: number;
  pushed: number;
  failed: number;
  remaining: number;
  errors: string[];
}

function queryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  return search.toString();
}

async function call<T>(token: string, query: string, init: RequestInit = {}): Promise<T> {
  // The literal path ends at "?", so tests/vitest/config/api-redirects.test.ts
  // can check that netlify.toml routes it.
  const res = await fetch(`/api/admin-newsletter-subscribers?${query}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    cache: 'no-store',
  });
  if (res.status === 401) throw new UnauthorizedError();
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body as T;
}

export function fetchSubscribers(token: string, query: SubscriberQuery = {}): Promise<SubscriberList> {
  return call(
    token,
    queryString({ q: query.q, status: query.status, source: query.source, limit: query.limit, offset: query.offset }),
  );
}

export function importSubscribers(token: string, chunk: ImportChunk): Promise<ImportResult> {
  return call(token, 'action=import', { method: 'POST', body: JSON.stringify(chunk) });
}

export function syncSubscribers(token: string, pull: boolean): Promise<SyncResult> {
  return call(token, 'action=sync', { method: 'POST', body: JSON.stringify({ pull }) });
}

export async function unsubscribeSubscriber(token: string, id: string): Promise<AdminSubscriber> {
  const body = await call<{ subscriber: AdminSubscriber }>(token, queryString({ id }), { method: 'PATCH' });
  return body.subscriber;
}

export async function deleteSubscriber(token: string, id: string): Promise<void> {
  await call(token, queryString({ id }), { method: 'DELETE' });
}

/** Downloads the CSV export for the current filters. */
export async function downloadSubscribersCsv(token: string, query: SubscriberQuery = {}): Promise<void> {
  const res = await fetch(
    `/api/admin-newsletter-subscribers?${queryString({ q: query.q, status: query.status, source: query.source, format: 'csv' })}`,
    { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' },
  );
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Export failed');
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download =
    /filename="([^"]+)"/.exec(res.headers.get('content-disposition') || '')?.[1] ||
    `newsletter-subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Calls sync until nothing is left to send, or until a call sends nothing:
 * a row Resend keeps refusing, whose error is in the result. Reads Resend's
 * unsubscribes on the first call only. Returns the totals.
 */
export async function syncUntilDone(
  token: string,
  onProgress?: (totals: SyncResult) => void,
  maxCalls = 100,
): Promise<SyncResult> {
  let totals: SyncResult = { unsubscribedInResend: 0, removedFromSegment: 0, pushed: 0, failed: 0, remaining: 0, errors: [] };
  for (let n = 0; n < maxCalls; n++) {
    const r = await syncSubscribers(token, n === 0);
    totals = {
      unsubscribedInResend: totals.unsubscribedInResend + r.unsubscribedInResend,
      removedFromSegment: totals.removedFromSegment + r.removedFromSegment,
      pushed: totals.pushed + r.pushed,
      failed: totals.failed + r.failed,
      remaining: r.remaining,
      errors: [...totals.errors, ...r.errors].slice(0, 5),
    };
    onProgress?.(totals);
    if (r.remaining === 0 || r.pushed === 0) break;
  }
  return totals;
}

// =============================================================================
// Issues: /api/admin-newsletter-issues (spec §8.1, §11)
// =============================================================================

/** An error from the issues API, with the issue as it now stands when the server sent it. */
export class IssueApiError extends Error {
  readonly status: number;
  readonly issue: IssueRow | null;
  readonly problems: string[];

  constructor(message: string, status: number, issue: IssueRow | null, problems: string[]) {
    super(message);
    this.name = 'IssueApiError';
    this.status = status;
    this.issue = issue;
    this.problems = problems;
  }
}

/**
 * Who is signed in, the sender, how many people a send reaches, and what the
 * fortnightly rules need: the next issue number, the last send, the first day
 * the next may go out, the book panel, and the next automatic send.
 */
export interface IssueContext {
  me: string;
  from: string;
  subscribed: number;
  next_issue_number: number;
  last_sent_at: string | null;
  /** YYYY-MM-DD in India, or null when nothing has been sent. */
  next_allowed_date: string | null;
  panel: BookPanel | null;
  next_send_at: string | null;
}

/** The next automatic send, as the Automatic screen shows it. */
export interface AutomaticNext {
  preview_at: string;
  send_at: string;
  post: { slug: string; title: string } | null;
  /** Why it won't go out, when it won't. */
  blocked: string | null;
}

export interface SettingsReply {
  settings: NewsletterSettings;
  next: AutomaticNext | null;
}

/** A post in the Swap post dialog. */
export interface PostChoice {
  slug: string;
  title: string;
  date: string;
  has_image: boolean;
  sent: boolean;
}

export interface IssueList extends IssueContext {
  issues: IssueSummary[];
}

export interface IssueDetail extends IssueContext {
  issue: IssueRow;
}

export type IssueDraftInput = Pick<
  IssueRow,
  | 'subject'
  | 'preheader'
  | 'issue_date'
  | 'title'
  | 'hero_image_url'
  | 'hero_image_alt'
  | 'body'
  | 'share_url'
  | 'kicker'
  | 'intro'
  | 'question'
>;

export interface UploadTicket {
  path: string;
  token: string;
  signed_url: string;
  public_url: string;
}

async function issuesCall<T>(token: string, query: string, init: RequestInit = {}): Promise<T> {
  // The literal path ends at "?", so tests/vitest/config/api-redirects.test.ts
  // can check that netlify.toml routes it.
  const res = await fetch(`/api/admin-newsletter-issues?${query}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    cache: 'no-store',
  });
  if (res.status === 401) throw new UnauthorizedError();
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new IssueApiError(
      body.error || `Request failed (${res.status})`,
      res.status,
      body.issue ?? null,
      Array.isArray(body.problems) ? body.problems : [],
    );
  }
  return body as T;
}

const post = (body?: unknown): RequestInit => (body === undefined ? { method: 'POST' } : { method: 'POST', body: JSON.stringify(body) });

export function listIssues(token: string): Promise<IssueList> {
  return issuesCall(token, '');
}

export function getIssue(token: string, id: string): Promise<IssueDetail> {
  return issuesCall(token, queryString({ id }));
}

export async function createIssue(token: string): Promise<IssueRow> {
  return (await issuesCall<{ issue: IssueRow }>(token, '', post())).issue;
}

/** Saves every field, guarded by the version the editor loaded (`updatedAt`). */
export async function saveIssue(token: string, id: string, draft: IssueDraftInput, updatedAt: string): Promise<IssueRow> {
  const body = await issuesCall<{ issue: IssueRow }>(token, queryString({ id }), {
    method: 'PATCH',
    body: JSON.stringify({ ...draft, updated_at: updatedAt }),
  });
  return body.issue;
}

export async function deleteIssue(token: string, id: string): Promise<void> {
  await issuesCall(token, queryString({ id }), { method: 'DELETE' });
}

export function issueUploadUrl(token: string, id: string, contentType: 'image/jpeg' | 'image/png'): Promise<UploadTicket> {
  return issuesCall(token, queryString({ id, action: 'upload-url' }), post({ content_type: contentType }));
}

/** Returns the addresses the test went to. */
export async function sendTestIssue(token: string, id: string, to: string[]): Promise<string[]> {
  return (await issuesCall<{ to: string[] }>(token, queryString({ id, action: 'test' }), post({ to }))).to;
}

/** Sends to every subscriber. `warning` is set when it went out but couldn't be recorded. */
export function sendIssue(token: string, id: string): Promise<{ issue: IssueRow; warning?: string }> {
  return issuesCall(token, queryString({ id, action: 'send' }), post());
}

export function checkIssue(token: string, id: string): Promise<{ issue: IssueRow; found: boolean }> {
  return issuesCall(token, queryString({ id, action: 'check' }), post());
}

/** The Hope Letter's settings and the next automatic send (fortnightly spec §5.1). */
export function getSettings(token: string): Promise<SettingsReply> {
  return issuesCall(token, queryString({ action: 'settings' }));
}

export function saveSettings(token: string, settings: NewsletterSettings): Promise<SettingsReply> {
  return issuesCall(token, queryString({ action: 'settings' }), { method: 'PUT', body: JSON.stringify(settings) });
}

/** Every blog post for the Swap post dialog, newest first. */
export async function listPosts(token: string): Promise<PostChoice[]> {
  return (await issuesCall<{ posts: PostChoice[] }>(token, queryString({ action: 'posts' }))).posts;
}

/** Points a scheduled newsletter at another post; its fields are refilled from it. */
export async function swapIssuePost(token: string, id: string, slug: string): Promise<IssueRow> {
  return (await issuesCall<{ issue: IssueRow }>(token, queryString({ id, action: 'swap' }), post({ slug }))).issue;
}

/** Skips this fortnight's automatic newsletter. */
export async function skipIssue(token: string, id: string): Promise<IssueRow> {
  return (await issuesCall<{ issue: IssueRow }>(token, queryString({ id, action: 'skip' }), post())).issue;
}
