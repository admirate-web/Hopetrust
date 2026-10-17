// The send itself (base spec §9.1 from step 3), shared by the admin Send button
// and the automatic fortnightly send (fortnightly spec §5.5). The caller has
// already locked the issue (→ sending, with its number). From here every way
// out finishes the issue, puts it back, or leaves it for Check status, so an
// issue can never go out twice.

import { renderIssueHtml } from '../../../lib/newsletter/render';
import { broadcastName, issueRenderOptions, sendProblems, type IssueRow } from '../../../lib/newsletter/issue';
import { bookPanel } from '../../../lib/newsletter/settings';
import type { NewsletterDeps } from './newsletter-deps.mts';
import { runSync } from './newsletter-sync.mts';
import { ResendError, type BroadcastSummary } from './resend.mts';

export type SendOutcome =
  | { kind: 'sent'; issue: IssueRow; broadcastId: string; recipients: number; warning?: string }
  /** Back to draft, with the reason. */
  | { kind: 'blocked'; status: number; error: string; problems?: string[]; issue: IssueRow | null }
  /** A subscriber change hasn't reached Resend: back to `retryTo`, so it can be tried again. */
  | { kind: 'retry'; error: string; issue: IssueRow | null }
  /** Resend's answer was unclear: needs_check. */
  | { kind: 'unclear'; error: string; issue: IssueRow | null };

export const UNCLEAR_SEND =
  "We couldn't confirm whether Resend sent this issue. Wait a minute, then press Check status. Don't send it again before that.";
const MAX_BROADCAST_PAGES = 20;
const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

export async function sendLocked(
  deps: NewsletterDeps,
  locked: IssueRow,
  actor: string,
  opts: { syncPull: boolean; syncBudgetMs: number; retryTo: 'draft' | 'scheduled' },
): Promise<SendOutcome> {
  const id = locked.id;
  const blocked = async (status: number, error: string, problems?: string[]): Promise<SendOutcome> => ({
    kind: 'blocked',
    status,
    error,
    ...(problems ? { problems } : {}),
    issue: await deps.issues.backToDraft(id, error),
  });
  /** Nothing went out and it may work later: the automatic send goes back to scheduled, and the next run tries again until the 3-hour limit (fortnightly spec §5.6). */
  const retry = async (error: string): Promise<SendOutcome> => ({
    kind: 'retry',
    error,
    issue: await deps.issues.backToDraft(id, error, 'scheduled'),
  });

  let html = '';
  let subscribed = 0;
  try {
    // Our unsubscribes and deletes must reach Resend before it sends.
    const sync = await runSync(deps, { pull: opts.syncPull, deadline: deps.now().getTime() + opts.syncBudgetMs });
    if (sync.remaining > 0) {
      const said = sync.errors.length > 0 ? ` Resend said: ${sync.errors.join('; ')}.` : '';
      const changes = sync.remaining === 1 ? "1 subscriber change hasn't" : `${sync.remaining} subscriber changes haven't`;
      const error = `${changes} reached Resend yet, so nothing was sent.${said} Try again in a minute. If it keeps happening, unsubscribe or delete those people on the Subscribers screen.`;
      return { kind: 'retry', error, issue: await deps.issues.backToDraft(id, error, opts.retryTo) };
    }
    subscribed = (await deps.db.counts()).subscribed;
    const options = issueRenderOptions(deps.config.imagesBase, 'send', { panel: bookPanel(await deps.settings.get()) });
    const rendered = renderIssueHtml(locked, options);
    html = rendered.html;
    const problems = sendProblems({ issue: locked, html, bytes: rendered.bytes, subscribed, imagePrefixes: options.imagePrefixes });
    if (problems.length > 0) return await blocked(400, problems.join(' '), problems);
  } catch (err) {
    console.error('[newsletter-send] before sending', err);
    const error = `Nothing was sent: ${errorText(err)}. Try again in a minute.`;
    return opts.retryTo === 'scheduled' ? retry(error) : blocked(502, error);
  }

  let broadcastId: string;
  try {
    broadcastId = await deps.resend.sendBroadcast({
      segmentId: deps.config.segmentId,
      from: deps.config.fromEmail,
      replyTo: deps.config.replyTo,
      subject: locked.subject.trim(),
      html,
      name: broadcastName(locked),
    });
  } catch (err) {
    console.error('[newsletter-send] send', err);
    if (err instanceof ResendError && err.status === 429 && opts.retryTo === 'scheduled') {
      // Too busy, even after the client's own retry: nothing went out.
      return retry(`Resend was too busy to take the newsletter, so nothing was sent: ${err.message}.`);
    }
    if (err instanceof ResendError && err.status >= 400 && err.status < 500) {
      // Resend said no, so nothing went out.
      return blocked(502, `Resend refused the newsletter, so nothing was sent: ${err.message}`);
    }
    // It may or may not have gone out.
    return { kind: 'unclear', error: UNCLEAR_SEND, issue: await deps.issues.markNeedsCheck(id, UNCLEAR_SEND) };
  }

  // It went out, so from here nothing may put it back.
  let issue: IssueRow | null = null;
  try {
    issue = await deps.issues.markSent(id, {
      resend_broadcast_id: broadcastId,
      recipient_count: subscribed,
      sent_at: deps.now().toISOString(),
    });
  } catch (err) {
    console.error(`[newsletter-send] recording a sent issue (${actor})`, err);
  }
  return issue
    ? { kind: 'sent', issue, broadcastId, recipients: subscribed }
    : {
        kind: 'sent',
        issue: locked,
        broadcastId,
        recipients: subscribed,
        warning: "It was sent, but we couldn't record that here. Press Check status in a few minutes to update this page.",
      };
}

/**
 * The newest broadcast whose name holds `marker`, among those Resend went on to
 * send; null when the list ends without one. Throws rather than answering "not
 * found" after 20 full pages, because a wrong "not found" would let it go out again.
 */
export async function findBroadcast(deps: NewsletterDeps, marker: string): Promise<BroadcastSummary | null> {
  let after: string | undefined;
  for (let page = 0; page < MAX_BROADCAST_PAGES; page++) {
    const { broadcasts, hasMore } = await deps.resend.listBroadcasts(after);
    const match = broadcasts.find((b) => b.name.includes(marker) && b.status !== 'draft');
    if (match) return match;
    if (!hasMore || broadcasts.length === 0) return null;
    after = broadcasts[broadcasts.length - 1].id;
  }
  throw new Error(`Checked ${(MAX_BROADCAST_PAGES * 100).toLocaleString('en-US')} broadcasts without finding this send. Look in Resend's dashboard before sending again`);
}
