// /api/admin-newsletter-issues: the Issues screen's API (spec §8.1, §9, §11).
// Admin JWT required. A save sends the whole draft, guarded by the version the
// editor loaded, so two admins can't overwrite each other. Test sends, sends
// and deletes go to admin_audit_log.

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { renderIssueHtml } from '../../../lib/newsletter/render';
import {
  EMPTY_BODY,
  ISSUE_LIMITS,
  broadcastMarker,
  broadcastName,
  issueDraftSchema,
  issueRenderOptions,
  sendProblems,
  todayInIndia,
  type IssueRow,
} from '../../../lib/newsletter/issue';
import { emailSchema } from '../../../lib/newsletter/subscriber';
import type { AdminUser } from './admin.mts';
import { clientIp, jsonResponse, preflight, readJsonBody } from './http.mts';
import type { NewsletterDeps } from './newsletter-deps.mts';
import { runSync } from './newsletter-sync.mts';
import { ResendError, type BroadcastSummary } from './resend.mts';

const METHODS = 'GET, POST, PATCH, DELETE, OPTIONS';
const MAX_BODY_BYTES = 512 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const SENT_IS_READ_ONLY = 'This issue has been sent, so it can no longer be changed.';
/** A send still unfinished after this long may have been stopped by Netlify; Check status can then resolve it. */
export const STALE_SENDING_MS = 2 * 60_000;
/** The send's own push to Resend. The Send dialog syncs first, so this only catches late changes. */
const SEND_SYNC_BUDGET_MS = 4000;
const MAX_BROADCAST_PAGES = 20;
const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

interface Ctx {
  req: Request;
  deps: NewsletterDeps;
  admin: AdminUser;
  id: string;
  reply: (body: unknown, status?: number) => Response;
}

const saveSchema = issueDraftSchema.extend({ updated_at: z.string().min(1).max(64) });
const uploadSchema = z.object({ content_type: z.enum(['image/jpeg', 'image/png']) });
const testSchema = z.object({
  to: z
    .array(z.string())
    .min(1, 'Add at least one address.')
    .max(ISSUE_LIMITS.testRecipients, `Send a test to at most ${ISSUE_LIMITS.testRecipients} addresses.`),
});
const jsonBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;

export async function handleAdminIssues(req: Request, deps: NewsletterDeps | null): Promise<Response> {
  const reply = (body: unknown, status = 200) => jsonResponse(body, status, METHODS);
  if (req.method === 'OPTIONS') return preflight(METHODS);
  if (!deps) return reply({ error: 'Server misconfiguration' }, 500);
  const admin = deps.verifyAdmin(req);
  if (!admin) return reply({ error: 'Unauthorized' }, 401);

  const params = new URL(req.url).searchParams;
  const id = params.get('id') ?? '';
  const action = params.get('action') ?? '';
  if (id && !UUID.test(id)) return reply({ error: 'A valid id is required' }, 400);
  const ctx: Ctx = { req, deps, admin, id, reply };
  try {
    if (req.method === 'GET') return id ? await getOne(ctx) : await list(ctx);
    if (req.method === 'POST' && !id && !action) return await create(ctx);
    if (req.method === 'PATCH' && id) return await save(ctx);
    if (req.method === 'DELETE' && id) return await remove(ctx);
    if (req.method === 'POST' && id && action === 'upload-url') return await uploadUrl(ctx);
    if (req.method === 'POST' && id && action === 'test') return await testSend(ctx);
    if (req.method === 'POST' && id && action === 'send') return await send(ctx);
    if (req.method === 'POST' && id && action === 'check') return await checkStatus(ctx);
    return reply({ error: 'Method not allowed' }, 405);
  } catch (err) {
    console.error('[admin-newsletter-issues]', err);
    return reply({ error: 'Something went wrong. Please try again.' }, 500);
  }
}

/** Who is signed in, the sender, and how many people a send would reach: the editor shows all three. */
async function context({ deps, admin }: Ctx) {
  const counts = await deps.db.counts();
  return { me: admin.email, from: deps.config.fromEmail, subscribed: counts.subscribed };
}

async function list(ctx: Ctx): Promise<Response> {
  const [issues, about] = await Promise.all([ctx.deps.issues.list(), context(ctx)]);
  return ctx.reply({ issues, ...about });
}

async function getOne(ctx: Ctx): Promise<Response> {
  const [issue, about] = await Promise.all([ctx.deps.issues.get(ctx.id), context(ctx)]);
  return issue ? ctx.reply({ issue, ...about }) : ctx.reply({ error: 'Issue not found' }, 404);
}

async function create({ deps, admin, reply }: Ctx): Promise<Response> {
  const issue = await deps.issues.create(
    {
      subject: '',
      preheader: '',
      issue_date: todayInIndia(deps.now()),
      title: '',
      hero_image_url: null,
      hero_image_alt: '',
      body: EMPTY_BODY,
      share_url: null,
      kicker: '',
      intro: '',
      question: '',
    },
    admin.email,
  );
  return reply({ issue }, 201);
}

async function save({ req, deps, admin, id, reply }: Ctx): Promise<Response> {
  const body = await readJsonBody(req, MAX_BODY_BYTES);
  if (!body.ok) return reply({ error: body.error }, body.status);
  const parsed = saveSchema.safeParse(body.value);
  if (!parsed.success) return reply({ error: parsed.error.issues[0]?.message ?? 'Please check the form.' }, 400);
  const { updated_at: version, ...fields } = parsed.data;
  if (jsonBytes(fields.body) > ISSUE_LIMITS.bodyJsonBytes) {
    return reply({ error: 'The body is too long to save. Split it across two issues.' }, 413);
  }
  const saved = await deps.issues.saveDraft(id, fields, admin.email, version);
  if (saved) return reply({ issue: saved });

  const current = await deps.issues.get(id);
  if (!current) return reply({ error: 'Issue not found' }, 404);
  if (current.status !== 'draft') return reply({ error: SENT_IS_READ_ONLY, issue: current }, 409);
  return reply(
    {
      error: 'Someone saved this issue after you opened it. Reload to see their changes, then make yours again.',
      issue: current,
    },
    409,
  );
}

async function remove({ req, deps, admin, id, reply }: Ctx): Promise<Response> {
  const issue = await deps.issues.get(id);
  if (!issue) return reply({ error: 'Issue not found' }, 404);
  if (!(await deps.issues.deleteDraft(id))) {
    return reply({ error: 'Only drafts can be deleted. A sent issue stays as the record of what went out.' }, 409);
  }
  await deps.db.audit({
    action: 'NEWSLETTER_ISSUE_DELETE',
    actorEmail: admin.email,
    resourceType: 'newsletter_issue',
    resourceId: id,
    metadata: { subject: issue.subject },
    ip: clientIp(req),
  });
  return reply({ ok: true });
}

async function uploadUrl({ req, deps, id, reply }: Ctx): Promise<Response> {
  const body = await readJsonBody(req, 1024);
  if (!body.ok) return reply({ error: body.error }, body.status);
  const parsed = uploadSchema.safeParse(body.value);
  if (!parsed.success) return reply({ error: 'Only JPEG and PNG images can be uploaded.' }, 400);
  const issue = await deps.issues.get(id);
  if (!issue) return reply({ error: 'Issue not found' }, 404);
  if (issue.status !== 'draft') return reply({ error: SENT_IS_READ_ONLY }, 409);
  const ext = parsed.data.content_type === 'image/png' ? 'png' : 'jpg';
  const ticket = await deps.images.createUploadUrl(`issues/${id}/${randomUUID()}.${ext}`);
  return reply({ path: ticket.path, token: ticket.token, signed_url: ticket.signedUrl, public_url: ticket.publicUrl });
}

/** A test to up to five addresses (spec §8.1, §9.2): the test version, through Resend's regular email API. */
async function testSend({ req, deps, admin, id, reply }: Ctx): Promise<Response> {
  const body = await readJsonBody(req, 8 * 1024);
  if (!body.ok) return reply({ error: body.error }, body.status);
  const parsed = testSchema.safeParse(body.value);
  if (!parsed.success) return reply({ error: parsed.error.issues[0]?.message ?? 'Check the addresses.' }, 400);
  const to: string[] = [];
  for (const raw of parsed.data.to) {
    const email = emailSchema.safeParse(raw);
    if (!email.success) return reply({ error: `"${raw.trim().slice(0, 80)}" isn't a valid email address.` }, 400);
    if (!to.includes(email.data)) to.push(email.data);
  }
  const issue = await deps.issues.get(id);
  if (!issue) return reply({ error: 'Issue not found' }, 404);

  const { html } = renderIssueHtml(issue, issueRenderOptions(deps.config.imagesBase, 'test'));
  try {
    await deps.resend.sendEmail({
      from: deps.config.fromEmail,
      to,
      replyTo: deps.config.replyTo,
      subject: `[TEST] ${issue.subject.trim() || issue.title.trim() || 'Newsletter'}`,
      html,
    });
  } catch (err) {
    console.error('[admin-newsletter-issues] test send', err);
    return reply({ error: `Resend didn't send the test: ${errorText(err)}` }, 502);
  }
  await deps.db.audit({
    action: 'NEWSLETTER_TEST_SEND',
    actorEmail: admin.email,
    resourceType: 'newsletter_issue',
    resourceId: id,
    metadata: { recipients: to.length },
    ip: clientIp(req),
  });
  return reply({ ok: true, to });
}

/**
 * Sends the issue to every subscriber (spec §9.1). The guarded lock lets one
 * send through. After it, every way out either finishes the issue or puts it
 * back to draft. The exception is an unclear answer from Resend: that waits
 * for Check status, so an issue can never go out twice.
 */
async function send({ req, deps, admin, id, reply }: Ctx): Promise<Response> {
  const locked = await deps.issues.lockForSend(id, admin.email, await deps.issues.nextIssueNumber(), 'draft');
  if (!locked) {
    const current = await deps.issues.get(id);
    if (!current) return reply({ error: 'Issue not found' }, 404);
    const error = current.status === 'sent' ? 'This issue has already been sent.' : 'This issue is already being sent.';
    return reply({ error, issue: current }, 409);
  }
  const giveBack = async (status: number, error: string, extra: Record<string, unknown> = {}) => {
    const issue = await deps.issues.backToDraft(id, error);
    return reply({ error, ...extra, issue }, status);
  };

  const options = issueRenderOptions(deps.config.imagesBase, 'send');
  let html = '';
  let subscribed = 0;
  try {
    // Step 3: our unsubscribes and deletes must reach Resend before it sends.
    const sync = await runSync(deps, { pull: false, deadline: deps.now().getTime() + SEND_SYNC_BUDGET_MS });
    if (sync.remaining > 0) {
      const said = sync.errors.length > 0 ? ` Resend said: ${sync.errors.join('; ')}.` : '';
      const changes = sync.remaining === 1 ? "1 subscriber change hasn't" : `${sync.remaining} subscriber changes haven't`;
      return await giveBack(
        409,
        `${changes} reached Resend yet, so nothing was sent.${said} Try again in a minute. If it keeps happening, unsubscribe or delete those people on the Subscribers screen.`,
      );
    }
    // Step 4, with the blocks of §8.1.
    subscribed = (await deps.db.counts()).subscribed;
    const rendered = renderIssueHtml(locked, options);
    html = rendered.html;
    const problems = sendProblems({ issue: locked, html, bytes: rendered.bytes, subscribed, imagePrefixes: options.imagePrefixes });
    if (problems.length > 0) return await giveBack(400, problems.join(' '), { problems });
  } catch (err) {
    console.error('[admin-newsletter-issues] before sending', err);
    return giveBack(502, `Nothing was sent: ${errorText(err)}. Try again in a minute.`);
  }

  // Step 5.
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
    console.error('[admin-newsletter-issues] send', err);
    if (err instanceof ResendError && err.status >= 400 && err.status < 500) {
      // Step 7: Resend said no, so nothing went out.
      return giveBack(502, `Resend refused the newsletter, so nothing was sent: ${err.message}`);
    }
    // Step 8: it may or may not have gone out.
    const error =
      "We couldn't confirm whether Resend sent this issue. Wait a minute, then press Check status. Don't send it again before that.";
    const issue = await deps.issues.markNeedsCheck(id, error);
    return reply({ error, issue }, 502);
  }

  // Step 6. It went out, so from here nothing may put it back to draft.
  let issue: IssueRow | null = null;
  try {
    issue = await deps.issues.markSent(id, {
      resend_broadcast_id: broadcastId,
      recipient_count: subscribed,
      sent_at: deps.now().toISOString(),
    });
  } catch (err) {
    console.error('[admin-newsletter-issues] recording a sent issue', err);
  }
  await deps.db.audit({
    action: 'NEWSLETTER_SEND',
    actorEmail: admin.email,
    resourceType: 'newsletter_issue',
    resourceId: id,
    metadata: { broadcast_id: broadcastId, recipients: subscribed },
    ip: clientIp(req),
  });
  if (!issue) {
    return reply({
      issue: locked,
      warning: "It was sent, but we couldn't record that here. Press Check status in a few minutes to update this page.",
    });
  }
  return reply({ issue });
}

/** Settles a send whose outcome was unclear (spec §9.1 step 8). */
async function checkStatus({ req, deps, admin, id, reply }: Ctx): Promise<Response> {
  const issue = await deps.issues.get(id);
  if (!issue) return reply({ error: 'Issue not found' }, 404);
  const stale = issue.status === 'sending' && deps.now().getTime() - Date.parse(issue.updated_at) >= STALE_SENDING_MS;
  if (issue.status !== 'needs_check' && !stale) {
    const error =
      issue.status === 'sending'
        ? 'This issue is still being sent. Check again in two minutes.'
        : 'There is nothing to check for this issue.';
    return reply({ error, issue }, 409);
  }

  let found: BroadcastSummary | null;
  try {
    found = await findBroadcast(deps, broadcastMarker(id));
  } catch (err) {
    console.error('[admin-newsletter-issues] check', err);
    return reply({ error: `Couldn't reach Resend: ${errorText(err)}. Try again in a minute.`, issue }, 502);
  }
  if (!found) {
    const back = await deps.issues.backToDraft(
      id,
      "Resend has no record of this send, so nothing went out. It's a draft again, and you can send it.",
    );
    return reply({ issue: back ?? issue, found: false });
  }

  const { subscribed } = await deps.db.counts();
  const sent = await deps.issues.markSent(id, {
    resend_broadcast_id: found.id,
    recipient_count: subscribed,
    sent_at: found.sentAt ?? deps.now().toISOString(),
  });
  await deps.db.audit({
    action: 'NEWSLETTER_SEND_CONFIRMED',
    actorEmail: admin.email,
    resourceType: 'newsletter_issue',
    resourceId: id,
    metadata: { broadcast_id: found.id },
    ip: clientIp(req),
  });
  return reply({ issue: sent ?? issue, found: true });
}

/** The newest broadcast whose name holds `marker`, among those Resend went on to send. */
async function findBroadcast(deps: NewsletterDeps, marker: string): Promise<BroadcastSummary | null> {
  let after: string | undefined;
  for (let page = 0; page < MAX_BROADCAST_PAGES; page++) {
    const { broadcasts, hasMore } = await deps.resend.listBroadcasts(after);
    const match = broadcasts.find((b) => b.name.includes(marker) && b.status !== 'draft');
    if (match) return match;
    if (!hasMore || broadcasts.length === 0) return null;
    after = broadcasts[broadcasts.length - 1].id;
  }
  return null;
}
