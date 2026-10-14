// Keeps Resend's "Newsletter" segment in step with newsletter_subscribers
// (spec §9.3). Supabase is the record of consent, so the segment should hold
// exactly the subscribed rows. The one change that flows the other way is an
// unsubscribe made on Resend's own page.
//
// Pull reads every contact in the segment, then:
//   - rows unsubscribed on Resend's page become unsubscribed here, unless the
//     row has a change waiting to go to Resend (that change is newer consent);
//   - contacts subscribed in Resend but unsubscribed here get our unsubscribe again;
//   - contacts with no consent on record (no row, or still pending) leave the segment.
// Push sends rows whose resend_synced_at is null, oldest change first, until
// the time budget runs out, and marks each one synced only if it hasn't
// changed since it was read.

import type { SubscriberRow } from '../../../lib/newsletter/subscriber';
import type { SyncRow } from './newsletter-db.mts';
import type { NewsletterDeps } from './newsletter-deps.mts';
import { ResendError, type ResendClient, type ResendContact } from './resend.mts';

export interface PullPlan {
  /** Row ids unsubscribed on Resend's page. */
  markUnsubscribed: string[];
  /** Row ids unsubscribed here whose contact is subscribed in Resend again. */
  repush: string[];
  /** Contact ids in the segment with no consent on record. */
  removeFromSegment: string[];
}

export type PushResult =
  | { kind: 'synced'; contactId: string | null }
  /** An imported address that had already unsubscribed in Resend: it stays unsubscribed. */
  | { kind: 'kept-unsubscribed'; contactId: string };

export interface SyncReport {
  unsubscribedInResend: number;
  removedFromSegment: number;
  pushed: number;
  failed: number;
  /** Rows still waiting to go to Resend after this call. */
  remaining: number;
  /** The first few failures, for the admin screen. */
  errors: string[];
}

/** How long one sync call may work; Netlify may stop a function at 10 s. */
export const SYNC_TIME_BUDGET_MS = 7000;
const PUSH_BATCH = 200;
/** Don't start a row with less than this left: one row takes up to three requests. */
const MIN_TIME_PER_ROW_MS = 600;
const MAX_ERRORS = 5;

export function planPull(contacts: ResendContact[], rows: SyncRow[]): PullPlan {
  const byEmail = new Map(rows.map((r) => [r.email, r]));
  const plan: PullPlan = { markUnsubscribed: [], repush: [], removeFromSegment: [] };
  for (const contact of contacts) {
    const row = byEmail.get(contact.email.toLowerCase());
    if (contact.unsubscribed) {
      if (row?.status === 'subscribed' && row.resend_synced_at !== null) plan.markUnsubscribed.push(row.id);
      continue;
    }
    if (row?.status === 'subscribed') continue;
    if (row?.status === 'unsubscribed') {
      if (row.resend_synced_at !== null) plan.repush.push(row.id);
      continue;
    }
    plan.removeFromSegment.push(contact.id);
  }
  return plan;
}

async function ensureInSegment(resend: ResendClient, contactId: string, segmentId: string): Promise<void> {
  try {
    await resend.addToSegment(contactId, segmentId);
  } catch (err) {
    // Resend may refuse to add a contact that is already a member: check before failing.
    const refused = err instanceof ResendError && err.status >= 400 && err.status < 500 && ![401, 403, 429].includes(err.status);
    if (refused && (await resend.contactSegmentIds(contactId)).includes(segmentId)) return;
    throw err;
  }
}

/** Sends one row's state to Resend. Throws when Resend fails; the row then stays queued. */
export async function pushOne(deps: NewsletterDeps, row: SubscriberRow): Promise<PushResult> {
  const { resend, config } = deps;

  if (row.status === 'unsubscribed') {
    let found = row.resend_contact_id ? await resend.updateContact(row.resend_contact_id, { unsubscribed: true }) : false;
    if (!found) found = await resend.updateContact(row.email, { unsubscribed: true });
    return { kind: 'synced', contactId: found ? row.resend_contact_id : null };
  }
  if (row.status !== 'subscribed') throw new Error(`A ${row.status} row is never sent to Resend`);

  if (row.resend_contact_id && (await resend.updateContact(row.resend_contact_id, { unsubscribed: false }))) {
    await ensureInSegment(resend, row.resend_contact_id, config.segmentId);
    return { kind: 'synced', contactId: row.resend_contact_id };
  }
  const existing = await resend.getContact(row.email);
  if (!existing) return { kind: 'synced', contactId: await resend.createContact(row.email, config.segmentId) };
  if (existing.unsubscribed && row.source === 'import') return { kind: 'kept-unsubscribed', contactId: existing.id };
  if (existing.unsubscribed) await resend.updateContact(existing.id, { unsubscribed: false });
  await ensureInSegment(resend, existing.id, config.segmentId);
  return { kind: 'synced', contactId: existing.id };
}

/** pushOne, then records the result on the row. Returns false if the row changed meanwhile. */
export async function pushAndRecord(deps: NewsletterDeps, row: SubscriberRow): Promise<boolean> {
  const result = await pushOne(deps, row);
  const now = deps.now().toISOString();
  const patch =
    result.kind === 'synced'
      ? { resend_contact_id: result.contactId, resend_synced_at: now }
      : {
          status: 'unsubscribed' as const,
          unsubscribed_at: now,
          unsubscribe_source: 'resend' as const,
          resend_contact_id: result.contactId,
          resend_synced_at: now,
        };
  return (await deps.db.update(row.id, patch, row.updated_at)) !== null;
}

export async function runSync(deps: NewsletterDeps, opts: { pull: boolean; deadline: number }): Promise<SyncReport> {
  const { db, resend, config } = deps;
  const report: SyncReport = { unsubscribedInResend: 0, removedFromSegment: 0, pushed: 0, failed: 0, remaining: 0, errors: [] };
  const fail = (what: string, err: unknown) => {
    report.failed++;
    if (report.errors.length < MAX_ERRORS) report.errors.push(`${what}: ${err instanceof Error ? err.message : String(err)}`);
  };

  if (opts.pull) {
    const contacts: ResendContact[] = [];
    let after: string | undefined;
    do {
      const page = await resend.listSegmentContacts(config.segmentId, after);
      contacts.push(...page.contacts);
      after = page.hasMore && page.contacts.length > 0 ? page.contacts[page.contacts.length - 1].id : undefined;
    } while (after);

    const plan = planPull(contacts, await db.syncRows());
    report.unsubscribedInResend = await db.markPulledUnsubscribed(plan.markUnsubscribed, deps.now().toISOString());
    await db.markNeedsPush(plan.repush);
    for (const contactId of plan.removeFromSegment) {
      try {
        await resend.removeFromSegment(contactId, config.segmentId);
        report.removedFromSegment++;
      } catch (err) {
        fail(`removing contact ${contactId} from the segment`, err);
      }
    }
  }

  for (const row of await db.rowsToPush(PUSH_BATCH)) {
    if (opts.deadline - deps.now().getTime() < MIN_TIME_PER_ROW_MS) break;
    try {
      await pushAndRecord(deps, row);
      report.pushed++;
    } catch (err) {
      fail(row.email, err);
    }
  }
  report.remaining = await db.countToPush();
  return report;
}
