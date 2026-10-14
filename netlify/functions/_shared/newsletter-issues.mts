// /api/admin-newsletter-issues: the Issues screen's API (spec §8.1, §9, §11).
// Admin JWT required. A save sends the whole draft, guarded by the version the
// editor loaded, so two admins can't overwrite each other. Test sends, sends
// and deletes go to admin_audit_log.

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { EMPTY_BODY, ISSUE_LIMITS, issueDraftSchema, todayInIndia } from '../../../lib/newsletter/issue';
import type { AdminUser } from './admin.mts';
import { clientIp, jsonResponse, preflight, readJsonBody } from './http.mts';
import type { NewsletterDeps } from './newsletter-deps.mts';

const METHODS = 'GET, POST, PATCH, DELETE, OPTIONS';
const MAX_BODY_BYTES = 512 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const SENT_IS_READ_ONLY = 'This issue has been sent, so it can no longer be changed.';

interface Ctx {
  req: Request;
  deps: NewsletterDeps;
  admin: AdminUser;
  id: string;
  reply: (body: unknown, status?: number) => Response;
}

const saveSchema = issueDraftSchema.extend({ updated_at: z.string().min(1).max(64) });
const uploadSchema = z.object({ content_type: z.enum(['image/jpeg', 'image/png']) });
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
