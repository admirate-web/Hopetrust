// The automatic fortnightly newsletter (fortnightly spec §5.3–5.6), run every 15
// minutes by netlify/functions/newsletter-auto.mts. Each run works out from the
// clock and the database what is due, and does each step at most once: one blog
// row per send time (a unique index), a claimed preview, and the
// scheduled → sending lock. Nothing goes out without a preview to staff first.

import { ADMIN_URL, noteEmail, previewEmail } from '../../../lib/newsletter/auto-emails';
import { EMPTY_BODY, blogIssueFields, broadcastMarker, issueRenderOptions, todayInIndia, type IssueRow } from '../../../lib/newsletter/issue';
import { RECENT_PHOTO_ISSUES, chooseNextPost } from '../../../lib/newsletter/posts';
import { renderIssueHtml } from '../../../lib/newsletter/render';
import {
  LATE_LIMIT_MS,
  NO_POST_LEFT,
  NO_SUBSCRIBERS,
  dueSlot,
  formatSlot,
  gapAllows,
  gapReason,
} from '../../../lib/newsletter/schedule';
import { bookPanel } from '../../../lib/newsletter/settings';
import type { NewsletterDeps } from './newsletter-deps.mts';
import { AUTOMATIC_ACTOR, type BlogSlotFields } from './newsletter-issues-db.mts';
import { findBroadcast, sendLocked } from './newsletter-send.mts';

export interface AutoReport {
  /** What this run did, e.g. "previewed <id>", "sent <id>", "missed <id>". */
  actions: string[];
}

export const SWITCHED_OFF = 'Automatic sending was switched off.';
export const MISSED_LATE = "It was more than 3 hours late, so it wasn't sent.";
export const MISSED_NO_PREVIEW = "The preview email didn't go out, so it wasn't sent.";
const NOT_FOUND =
  "Resend has no record of this send, so nothing went out. It's a draft again: send it by hand from the Newsletter tab if it should still go.";
/** A scheduled function may run for 30 seconds; the full sync gets half. */
const AUTO_SYNC_BUDGET_MS = 15_000;
/** A send still unfinished after this long may have been stopped by Netlify. */
const STALE_SENDING_MS = 2 * 60_000;
/** How long Resend gets to list a broadcast before "not found" counts. */
const CHECK_AFTER_MS = 10 * 60_000;
const FAR_FUTURE = '9999-12-31T00:00:00.000Z';
const subscribers = (n: number) => `${n} subscriber${n === 1 ? '' : 's'}`;

/** This run's clock: deps.now(), or NEWSLETTER_AUTO_NOW under `netlify dev` only (the live check). */
function withClock(deps: NewsletterDeps, env: Record<string, string | undefined>): NewsletterDeps {
  const override = env.NETLIFY_DEV === 'true' ? env.NEWSLETTER_AUTO_NOW : undefined;
  const at = override ? new Date(override) : null;
  return at && !Number.isNaN(at.getTime()) ? { ...deps, now: () => new Date(at.getTime()) } : deps;
}

export async function runAutomatic(
  base: NewsletterDeps,
  env: Record<string, string | undefined> = process.env,
): Promise<AutoReport> {
  const deps = withClock(base, env);
  const actions: string[] = [];
  const settings = await deps.settings.get();

  const audit = (action: string, row: Pick<IssueRow, 'id'>, metadata: Record<string, unknown> = {}) =>
    deps.db.audit({ action, actorEmail: AUTOMATIC_ACTOR, resourceType: 'newsletter_issue', resourceId: row.id, metadata });
  const email = (subject: string, html: string) =>
    deps.resend.sendEmail({
      from: deps.config.fromEmail,
      to: settings.preview_recipients,
      replyTo: deps.config.replyTo,
      subject,
      html,
    });
  /** A note to staff; a failed note is logged, never fatal. */
  const tell = async (subject: string, lines: string[]) => {
    const note = noteEmail(subject, lines);
    try {
      await email(note.subject, note.html);
    } catch (err) {
      console.error('[newsletter-auto] note', err);
    }
  };

  // 1. Switched off: a scheduled issue goes back to the drafts, and nothing is sent.
  if (!settings.auto_enabled || !settings.first_send_date) {
    for (const row of await deps.issues.overdueScheduled(FAR_FUTURE)) {
      if (await deps.issues.setOutcome(row.id, ['scheduled'], 'draft', SWITCHED_OFF)) {
        actions.push(`switched off ${row.id}`);
        await audit('NEWSLETTER_AUTO_OFF', row);
      }
    }
    return { actions };
  }
  const now = deps.now();

  // 2. More than 3 hours late: missed.
  for (const row of await deps.issues.overdueScheduled(new Date(now.getTime() - LATE_LIMIT_MS).toISOString())) {
    if (await deps.issues.setOutcome(row.id, ['scheduled'], 'missed', MISSED_LATE)) {
      actions.push(`missed ${row.id}`);
      await audit('NEWSLETTER_AUTO_MISSED', row, { reason: MISSED_LATE });
      await tell(`[The Hope Letter] Missed: ${formatSlot(new Date(row.scheduled_for as string))}`, [MISSED_LATE]);
    }
  }

  // 3. A send whose outcome was unclear: Check status, by itself (base spec §9.1 step 8).
  for (const row of await deps.issues.blogNeedsCheck()) {
    const age = now.getTime() - Date.parse(row.updated_at);
    if (row.status === 'sending' && age < STALE_SENDING_MS) continue;
    let found;
    try {
      found = await findBroadcast(deps, broadcastMarker(row.id));
    } catch (err) {
      console.error('[newsletter-auto] check', err);
      continue;
    }
    if (found) {
      const { subscribed } = await deps.db.counts();
      const sent = await deps.issues.markSent(row.id, {
        resend_broadcast_id: found.id,
        recipient_count: subscribed,
        sent_at: found.sentAt ?? now.toISOString(),
      });
      if (sent) {
        actions.push(`confirmed ${row.id}`);
        await audit('NEWSLETTER_SEND_CONFIRMED', row, { broadcast_id: found.id });
        await tell(`[The Hope Letter] Sent to ${subscribers(subscribed)}`, [`"${row.subject}" went out.`]);
      }
    } else if (age >= CHECK_AFTER_MS && (await deps.issues.backToDraft(row.id, NOT_FOUND))) {
      actions.push(`not found ${row.id}`);
      await audit('NEWSLETTER_AUTO_NOT_FOUND', row);
      await tell(`[The Hope Letter] Not sent: ${row.subject}`, [NOT_FOUND]);
    }
  }

  // 4. The send time in reach, if any.
  const slot = dueSlot(settings.first_send_date, now);
  if (!slot) return { actions };
  if (now.getTime() < slot.getTime()) await previewWindow(slot);
  else await sendWindow(slot);
  return { actions };

  /** 48 hours before: choose the post (or the reason not to send), then email staff once. */
  async function previewWindow(at: Date): Promise<void> {
    let row = await deps.issues.blogSlot(at.toISOString());
    if (!row) {
      const created = await deps.issues.createBlog(await planSlot(at));
      if (!created) return; // Another run made it first, and previews it.
      row = created;
      actions.push(`${created.status} ${created.id}`);
      await audit(created.status === 'scheduled' ? 'NEWSLETTER_AUTO_SCHEDULE' : 'NEWSLETTER_AUTO_SKIP', created, {
        post: created.post_slug,
        reason: created.reason,
      });
    }
    if (row.status !== 'scheduled' && row.status !== 'skipped') return;
    if (!(await deps.issues.claimPreview(row.id, now.toISOString()))) return;
    try {
      if (row.status === 'scheduled') {
        const [number, counts] = await Promise.all([deps.issues.nextIssueNumber(), deps.db.counts()]);
        const options = issueRenderOptions(deps.config.imagesBase, 'test', { panel: bookPanel(settings), nextIssueNumber: number });
        const preview = previewEmail(renderIssueHtml(row, options).html, { sendAt: at, subscribed: counts.subscribed, adminUrl: ADMIN_URL });
        await email(preview.subject(row.subject), preview.html);
        actions.push(`previewed ${row.id}`);
        await audit('NEWSLETTER_AUTO_PREVIEW', row, { recipients: settings.preview_recipients.length });
      } else {
        const note = noteEmail(`[The Hope Letter] No newsletter on ${formatSlot(at)}`, [row.reason ?? 'It was skipped.']);
        await email(note.subject, note.html);
        actions.push(`noted skip ${row.id}`);
      }
    } catch (err) {
      console.error('[newsletter-auto] preview', err);
      await deps.issues.releasePreview(row.id);
    }
  }

  /** At the send time (and up to 3 hours after): re-check, then send. */
  async function sendWindow(at: Date): Promise<void> {
    const row = await deps.issues.blogSlot(at.toISOString());
    if (!row || row.status !== 'scheduled') return;
    if (!row.preview_sent_at) {
      if (await deps.issues.setOutcome(row.id, ['scheduled'], 'missed', MISSED_NO_PREVIEW)) {
        actions.push(`missed ${row.id}`);
        await audit('NEWSLETTER_AUTO_MISSED', row, { reason: MISSED_NO_PREVIEW });
        await tell(`[The Hope Letter] Missed: ${formatSlot(at)}`, [MISSED_NO_PREVIEW]);
      }
      return;
    }
    const lastSentAt = await deps.issues.lastSentAt();
    const reason =
      lastSentAt && !gapAllows(lastSentAt, now)
        ? gapReason(lastSentAt)
        : (await deps.db.counts()).subscribed < 1
          ? NO_SUBSCRIBERS
          : null;
    if (reason) {
      if (await deps.issues.setOutcome(row.id, ['scheduled'], 'skipped', reason)) {
        actions.push(`skipped ${row.id}`);
        await audit('NEWSLETTER_AUTO_SKIP', row, { reason });
        await tell(`[The Hope Letter] No newsletter on ${formatSlot(at)}`, [reason]);
      }
      return;
    }

    const locked = await deps.issues.lockForSend(row.id, AUTOMATIC_ACTOR, await deps.issues.nextIssueNumber(), 'scheduled');
    if (!locked) return;
    const out = await sendLocked(deps, locked, AUTOMATIC_ACTOR, {
      syncPull: true,
      syncBudgetMs: AUTO_SYNC_BUDGET_MS,
      retryTo: 'scheduled',
    });
    if (out.kind === 'sent') {
      actions.push(`sent ${row.id}`);
      await audit('NEWSLETTER_SEND', row, { broadcast_id: out.broadcastId, recipients: out.recipients });
      await tell(`[The Hope Letter] Sent to ${subscribers(out.recipients)}`, [
        `"${row.subject}" went out to ${subscribers(out.recipients)}.`,
        ...(out.warning ? [out.warning] : []),
      ]);
    } else if (out.kind === 'blocked') {
      actions.push(`not sent ${row.id}`);
      await tell(`[The Hope Letter] Not sent: ${out.error}`, [
        out.error,
        "It's a draft now. Fix it in the Newsletter tab and send it by hand if it should still go.",
      ]);
    } else {
      // retry: back to scheduled for the next run; unclear: step 3 settles it.
      actions.push(`${out.kind} ${row.id}`);
    }
  }

  /** The blog row for a send time: the next post, or the reason there won't be a newsletter. */
  async function planSlot(at: Date): Promise<BlogSlotFields> {
    const sendDate = todayInIndia(at);
    const skip = (why: string): BlogSlotFields => ({
      subject: `No newsletter on ${formatSlot(at)}`,
      preheader: '',
      issue_date: sendDate,
      title: `No newsletter on ${formatSlot(at)}`,
      hero_image_url: null,
      hero_image_alt: '',
      body: EMPTY_BODY,
      share_url: null,
      kicker: '',
      intro: '',
      question: '',
      kind: 'blog',
      post_slug: null,
      reading_minutes: null,
      scheduled_for: at.toISOString(),
      status: 'skipped',
      reason: why,
    });
    const lastSentAt = await deps.issues.lastSentAt();
    if (lastSentAt && !gapAllows(lastSentAt, at)) return skip(gapReason(lastSentAt));
    if ((await deps.db.counts()).subscribed < 1) return skip(NO_SUBSCRIBERS);
    const [sent, recent] = await Promise.all([deps.issues.sentPostSlugs(), deps.issues.recentHeroImages(RECENT_PHOTO_ISSUES)]);
    const post = chooseNextPost(deps.posts(), sent, recent);
    if (!post) return skip(NO_POST_LEFT);
    return { ...blogIssueFields(post, sendDate), kind: 'blog', scheduled_for: at.toISOString(), status: 'scheduled', reason: null };
  }
}

