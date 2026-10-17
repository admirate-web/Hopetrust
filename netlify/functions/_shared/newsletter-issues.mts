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
  blogIssueFields,
  broadcastMarker,
  issueDraftSchema,
  issueRenderOptions,
  postSlugFromLink,
  todayInIndia,
} from '../../../lib/newsletter/issue';
import { RECENT_PHOTO_ISSUES, chooseNextPost } from '../../../lib/newsletter/posts';
import {
  NO_POST_LEFT,
  PREVIEW_LEAD_MS,
  formatSlot,
  gapAllows,
  gapReason,
  nextAllowedDate,
  nextSlot,
  sendTimeOn,
} from '../../../lib/newsletter/schedule';
import { bookPanel, settingsSchema, type NewsletterSettings } from '../../../lib/newsletter/settings';
import { emailSchema } from '../../../lib/newsletter/subscriber';
import type { AdminUser } from './admin.mts';
import { clientIp, jsonResponse, preflight, readJsonBody } from './http.mts';
import type { NewsletterDeps } from './newsletter-deps.mts';
import type { IssueSaveFields } from './newsletter-issues-db.mts';
import { findBroadcast, sendLocked } from './newsletter-send.mts';
import type { BroadcastSummary } from './resend.mts';

const METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
const MAX_BODY_BYTES = 512 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const SENT_IS_READ_ONLY = 'This issue has been sent, so it can no longer be changed.';
/** A send still unfinished after this long may have been stopped by Netlify; Check status can then resolve it. */
export const STALE_SENDING_MS = 2 * 60_000;
/** The send's own push to Resend. The Send dialog syncs first, so this only catches late changes. */
const SEND_SYNC_BUDGET_MS = 4000;
const SEND_TIME_PASSED = 'Its send time has passed.';
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
const swapSchema = z.object({ slug: z.string().min(1).max(200) });
const jsonBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;
const sendTimePassed = (deps: NewsletterDeps, scheduledFor: string | null) =>
  scheduledFor !== null && deps.now().getTime() >= Date.parse(scheduledFor);

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
    if (req.method === 'GET' && action === 'settings') return await getSettings(ctx);
    if (req.method === 'PUT' && action === 'settings') return await putSettings(ctx);
    if (req.method === 'GET' && action === 'posts') return await listPosts(ctx);
    if (req.method === 'POST' && id && action === 'swap') return await swap(ctx);
    if (req.method === 'POST' && id && action === 'skip') return await skip(ctx);
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

/**
 * What the editor shows around an issue: who is signed in, the sender, how many
 * people a send would reach, the next issue number, when the last newsletter
 * went out and the next may, the book panel, and the next automatic send.
 */
async function context({ deps, admin }: Ctx) {
  const [counts, nextNumber, lastSentAt, settings] = await Promise.all([
    deps.db.counts(),
    deps.issues.nextIssueNumber(),
    deps.issues.lastSentAt(),
    deps.settings.get(),
  ]);
  const automatic = settings.auto_enabled && settings.first_send_date;
  return {
    me: admin.email,
    from: deps.config.fromEmail,
    subscribed: counts.subscribed,
    next_issue_number: nextNumber,
    last_sent_at: lastSentAt,
    next_allowed_date: nextAllowedDate(lastSentAt),
    panel: bookPanel(settings),
    next_send_at: automatic ? nextSlot(settings.first_send_date as string, deps.now()).toISOString() : null,
  };
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
  const before = await deps.issues.get(id);
  if (!before) return reply({ error: 'Issue not found' }, 404);
  if (before.status === 'scheduled' && sendTimePassed(deps, before.scheduled_for)) {
    return reply({ error: SEND_TIME_PASSED, issue: before }, 409);
  }
  // A blog issue keeps its post's link; a manual one records the post its article link points at,
  // so the automatic newsletter never sends that post again (fortnightly spec §6).
  let toSave: IssueSaveFields;
  if (before.kind === 'blog') {
    toSave = { ...fields, share_url: before.share_url };
  } else {
    const linked = postSlugFromLink(fields.share_url);
    toSave = { ...fields, post_slug: linked && deps.posts().some((p) => p.slug === linked) ? linked : null };
  }
  const saved = await deps.issues.saveDraft(id, toSave, admin.email, version);
  if (saved) return reply({ issue: saved });

  const current = await deps.issues.get(id);
  if (!current) return reply({ error: 'Issue not found' }, 404);
  if (current.status !== 'draft' && current.status !== 'scheduled') {
    return reply({ error: SENT_IS_READ_ONLY, issue: current }, 409);
  }
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

  const [settings, nextNumber] = await Promise.all([deps.settings.get(), deps.issues.nextIssueNumber()]);
  const { html } = renderIssueHtml(
    issue,
    issueRenderOptions(deps.config.imagesBase, 'test', { panel: bookPanel(settings), nextIssueNumber: nextNumber }),
  );
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
 * Sends the issue to every subscriber (spec §9.1), unless a newsletter went out
 * less than 14 days ago. The guarded lock lets one send through; sendLocked does the rest.
 */
async function send({ req, deps, admin, id, reply }: Ctx): Promise<Response> {
  // Never two newsletters less than 14 India days apart (fortnightly spec §5.2).
  const lastSentAt = await deps.issues.lastSentAt();
  if (!gapAllows(lastSentAt, deps.now())) {
    const next = formatSlot(sendTimeOn(nextAllowedDate(lastSentAt) as string));
    return reply({ error: `The next newsletter can go out on ${next}.`, issue: await deps.issues.get(id) }, 409);
  }
  const locked = await deps.issues.lockForSend(id, admin.email, await deps.issues.nextIssueNumber(), 'draft');
  if (!locked) {
    const current = await deps.issues.get(id);
    if (!current) return reply({ error: 'Issue not found' }, 404);
    const error = current.status === 'sent' ? 'This issue has already been sent.' : 'This issue is already being sent.';
    return reply({ error, issue: current }, 409);
  }

  const out = await sendLocked(deps, locked, admin.email, {
    syncPull: false,
    syncBudgetMs: SEND_SYNC_BUDGET_MS,
    retryTo: 'draft',
  });
  if (out.kind === 'retry') return reply({ error: out.error, issue: out.issue }, 409);
  if (out.kind === 'blocked') {
    return reply({ error: out.error, ...(out.problems ? { problems: out.problems } : {}), issue: out.issue }, out.status);
  }
  if (out.kind === 'unclear') return reply({ error: out.error, issue: out.issue }, 502);

  await deps.db.audit({
    action: 'NEWSLETTER_SEND',
    actorEmail: admin.email,
    resourceType: 'newsletter_issue',
    resourceId: id,
    metadata: { broadcast_id: out.broadcastId, recipients: out.recipients },
    ip: clientIp(req),
  });
  return reply(out.warning ? { issue: out.issue, warning: out.warning } : { issue: out.issue });
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

/**
 * The next automatic send as the Automatic screen shows it (fortnightly spec
 * §5.1): its preview and send times, the post in line, and why it won't go
 * out, if it won't. Null until a first send date is set.
 */
async function nextAutomatic(deps: NewsletterDeps, settings: NewsletterSettings) {
  if (!settings.first_send_date) return null;
  const send = nextSlot(settings.first_send_date, deps.now());
  const [row, lastSentAt, sentSlugs, recent] = await Promise.all([
    deps.issues.blogSlot(send.toISOString()),
    deps.issues.lastSentAt(),
    deps.issues.sentPostSlugs(),
    deps.issues.recentHeroImages(RECENT_PHOTO_ISSUES),
  ]);
  const posts = deps.posts();
  const post = row?.post_slug ? (posts.find((p) => p.slug === row.post_slug) ?? null) : chooseNextPost(posts, sentSlugs, recent);
  let blocked: string | null = null;
  if (row?.status === 'skipped') blocked = row.reason;
  else if (lastSentAt && !gapAllows(lastSentAt, send)) blocked = gapReason(lastSentAt);
  else if (!post) blocked = NO_POST_LEFT;
  return {
    preview_at: new Date(send.getTime() - PREVIEW_LEAD_MS).toISOString(),
    send_at: send.toISOString(),
    post: post ? { slug: post.slug, title: post.title } : null,
    blocked,
  };
}

async function getSettings({ deps, reply }: Ctx): Promise<Response> {
  const settings = await deps.settings.get();
  return reply({ settings, next: await nextAutomatic(deps, settings) });
}

async function putSettings({ req, deps, admin, reply }: Ctx): Promise<Response> {
  const body = await readJsonBody(req, 16 * 1024);
  if (!body.ok) return reply({ error: body.error }, body.status);
  const parsed = settingsSchema.safeParse(body.value);
  if (!parsed.success) return reply({ error: parsed.error.issues[0]?.message ?? 'Please check the settings.' }, 400);
  const settings = await deps.settings.save(parsed.data, admin.email);
  await deps.db.audit({
    action: 'NEWSLETTER_SETTINGS',
    actorEmail: admin.email,
    resourceType: 'newsletter_settings',
    metadata: {
      auto_enabled: settings.auto_enabled,
      first_send_date: settings.first_send_date,
      preview_recipients: settings.preview_recipients.length,
      panel_enabled: settings.panel_enabled,
    },
    ip: clientIp(req),
  });
  return reply({ settings, next: await nextAutomatic(deps, settings) });
}

/** Every post for the Swap post dialog, newest first, marking sent ones and those without a photo. */
async function listPosts({ deps, reply }: Ctx): Promise<Response> {
  const sent = await deps.issues.sentPostSlugs();
  return reply({
    posts: deps.posts().map((p) => ({
      slug: p.slug,
      title: p.title,
      date: p.date,
      has_image: p.image !== null,
      sent: sent.includes(p.slug),
    })),
  });
}

/** Points a scheduled blog issue at another post, refilling its fields (fortnightly spec §5.4). */
async function swap({ req, deps, admin, id, reply }: Ctx): Promise<Response> {
  const body = await readJsonBody(req, 1024);
  if (!body.ok) return reply({ error: body.error }, body.status);
  const parsed = swapSchema.safeParse(body.value);
  if (!parsed.success) return reply({ error: 'Choose a post.' }, 400);
  const issue = await deps.issues.get(id);
  if (!issue) return reply({ error: 'Issue not found' }, 404);
  if (issue.kind !== 'blog' || issue.status !== 'scheduled') {
    return reply({ error: 'Only a scheduled newsletter can change its post.', issue }, 409);
  }
  if (sendTimePassed(deps, issue.scheduled_for)) return reply({ error: SEND_TIME_PASSED, issue }, 409);
  const post = deps.posts().find((p) => p.slug === parsed.data.slug);
  if (!post) return reply({ error: "That post isn't in the list." }, 404);

  const fields = blogIssueFields(post, todayInIndia(new Date(issue.scheduled_for as string)));
  const saved = await deps.issues.saveDraft(id, fields, admin.email, issue.updated_at);
  if (!saved) {
    return reply({ error: 'Someone changed this newsletter just now. Reload, then try again.', issue: await deps.issues.get(id) }, 409);
  }
  await deps.db.audit({
    action: 'NEWSLETTER_ISSUE_SWAP',
    actorEmail: admin.email,
    resourceType: 'newsletter_issue',
    resourceId: id,
    metadata: { from: issue.post_slug, to: post.slug },
    ip: clientIp(req),
  });
  return reply({ issue: saved });
}

/** Skips this fortnight's automatic newsletter. Its post isn't used up (fortnightly spec §5.4). */
async function skip({ req, deps, admin, id, reply }: Ctx): Promise<Response> {
  const issue = await deps.issues.setOutcome(id, ['scheduled'], 'skipped', `Skipped in /arel-ops by ${admin.email}.`);
  if (!issue) {
    const current = await deps.issues.get(id);
    if (!current) return reply({ error: 'Issue not found' }, 404);
    return reply({ error: 'Only a scheduled newsletter can be skipped.', issue: current }, 409);
  }
  await deps.db.audit({
    action: 'NEWSLETTER_ISSUE_SKIP',
    actorEmail: admin.email,
    resourceType: 'newsletter_issue',
    resourceId: id,
    metadata: { post: issue.post_slug, scheduled_for: issue.scheduled_for },
    ip: clientIp(req),
  });
  return reply({ issue });
}
