// Keeps Resend's "Newsletter" segment in step with newsletter_subscribers
// (spec §9.3). Supabase is the record of consent, so the segment should hold
// exactly the subscribed rows. The one change that flows the other way is an
// unsubscribe made on Resend's own page.
//
// Pull reads every contact in the segment, then:
//   - rows unsubscribed on Resend's page become unsubscribed here, unless the
//     row has a change waiting to go to Resend, or one that reached Resend
//     after the list was read (that change is newer consent);
//   - contacts subscribed in Resend but unsubscribed here get our unsubscribe again;
//   - contacts with no consent on record (no row, or still pending) leave the
//     segment, and the contact of an erased person with no row is deleted.
// Push sends rows whose resend_synced_at is null, oldest change first, until
// the time budget runs out, and marks each one synced only if it hasn't
// changed since it was read.

import type { SubscriberRow } from '../../../lib/newsletter/subscriber';
import { hashEmail } from './newsletter-crypto.mts';
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
  /** Contact ids of erased people with no row: Resend shouldn't keep the address at all. */
  deleteContact: string[];
}

export type PushResult =
  | { kind: 'synced'; contactId: string | null }
  /** An imported address that had already unsubscribed in Resend: it stays unsubscribed. */
  | { kind: 'kept-unsubscribed'; contactId: string };

export interface SyncReport {
  unsubscribedInResend: number;
  /** Contacts with no consent on record taken out of the segment, or deleted for an erased person. */
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

/** `erased`: hashes from newsletter_erased (hashEmail), for the contacts with no row. */
export function planPull(contacts: ResendContact[], rows: SyncRow[], erased: Set<string> = new Set()): PullPlan {
  const byEmail = new Map(rows.map((r) => [r.email, r]));
  const plan: PullPlan = { markUnsubscribed: [], repush: [], removeFromSegment: [], deleteContact: [] };
  for (const contact of contacts) {
    const row = byEmail.get(contact.email.toLowerCase());
    if (!row && erased.has(hashEmail(contact.email))) {
      plan.deleteContact.push(contact.id);
      continue;
    }
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
    if (row.resend_contact_id && (await resend.updateContact(row.resend_contact_id, { unsubscribed: true }))) {
      return { kind: 'synced', contactId: row.resend_contact_id };
    }
    // No id, or a stale one: find the contact by address and keep its real id.
    const contact = await resend.getContact(row.email);
    if (!contact) return { kind: 'synced', contactId: null };
    const updated = await resend.updateContact(contact.id, { unsubscribed: true });
    return { kind: 'synced', contactId: updated ? contact.id : null };
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

/**
 * The pull's rule for one subscribed row, for a sign-up that can't wait for
 * the next sync: if the contact unsubscribed on Resend's page, the row
 * becomes unsubscribed now. Returns the row as it stands. Throws if Resend
 * can't be asked.
 */
export async function pullOne(deps: NewsletterDeps, row: SubscriberRow): Promise<SubscriberRow> {
  const listedAt = deps.now().toISOString();
  const contact = await deps.resend.getContact(row.email);
  if (!contact?.unsubscribed) return row;
  const changed = await deps.db.markPulledUnsubscribed([row.id], deps.now().toISOString(), listedAt);
  return changed > 0 ? ((await deps.db.findById(row.id)) ?? row) : row;
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
    // Before the list: a row synced after this may be newer than what Resend says.
    const listedAt = deps.now().toISOString();
    const contacts: ResendContact[] = [];
    let after: string | undefined;
    do {
      const page = await resend.listSegmentContacts(config.segmentId, after);
      contacts.push(...page.contacts);
      after = page.hasMore && page.contacts.length > 0 ? page.contacts[page.contacts.length - 1].id : undefined;
    } while (after);

    const rows = await db.syncRows();
    const known = new Set(rows.map((r) => r.email));
    const strangers = contacts.filter((c) => !known.has(c.email.toLowerCase()));
    const erased = strangers.length > 0 ? await db.erasedHashes(strangers.map((c) => hashEmail(c.email))) : new Set<string>();
    const plan = planPull(contacts, rows, erased);

    report.unsubscribedInResend = await db.markPulledUnsubscribed(plan.markUnsubscribed, deps.now().toISOString(), listedAt);
    await db.markNeedsPush(plan.repush);
    for (const contactId of plan.removeFromSegment) {
      try {
        await resend.removeFromSegment(contactId, config.segmentId);
        report.removedFromSegment++;
      } catch (err) {
        fail(`removing contact ${contactId} from the segment`, err);
      }
    }
    for (const contactId of plan.deleteContact) {
      try {
        await resend.deleteContact(contactId);
        report.removedFromSegment++;
      } catch (err) {
        fail(`deleting the contact of an erased person (${contactId})`, err);
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
