// Rules for a newsletter issue (spec §6.2–§6.4, §8.1, §9.1): the shapes the
// admin API sends and receives, the field checks, the body clean-up that
// keeps only what the email can show, and the checks that block a send.
// Shared by the admin-newsletter-issues function and the Newsletter tab.

import { z } from 'zod';
import type { BlockNode, BodyDoc, InlineNode, IssueForRender, ListItemNode, Mark, ParagraphNode } from './content';
import type { NewsletterPost } from './posts';
import {
  SIZE_MAX_BYTES,
  UNSUBSCRIBE_PLACEHOLDER,
  allowedImageUrl,
  resolveHref,
  type BookPanel,
  type RenderOptions,
} from './render';

export type IssueStatus = 'draft' | 'sending' | 'sent' | 'needs_check' | 'scheduled' | 'skipped' | 'missed';
export type IssueKind = IssueForRender['kind'];

/** A row of newsletter_issues (Database/newsletter.sql §6–7), as the admin API returns it. */
export interface IssueRow extends IssueForRender {
  id: string;
  status: IssueStatus;
  /** A blog issue's send time. */
  scheduled_for: string | null;
  /** When a run claimed the preview email; a blog issue is sent only once this is set. */
  preview_sent_at: string | null;
  /** Why a blog issue was skipped or missed, or went back to a draft. */
  reason: string | null;
  last_error: string | null;
  resend_broadcast_id: string | null;
  recipient_count: number | null;
  sent_at: string | null;
  sent_by: string | null;
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

/** What the Issues list shows (spec §8.1). */
export type IssueSummary = Pick<
  IssueRow,
  | 'id'
  | 'subject'
  | 'issue_date'
  | 'status'
  | 'recipient_count'
  | 'sent_at'
  | 'last_error'
  | 'updated_at'
  | 'kind'
  | 'scheduled_for'
  | 'reason'
>;

export const ISSUE_LIMITS = {
  subject: 150,
  preheader: 200,
  title: 160,
  heroAlt: 250,
  kicker: 60,
  intro: 600,
  question: 200,
  url: 1000,
  /** The body as JSON: far above any real issue, which must also render under 95 KB. */
  bodyJsonBytes: 300_000,
  testRecipients: 5,
} as const;

/** Newsletters always link to the live site, wherever they are rendered. */
export const NEWSLETTER_SITE_URL = 'https://hopetrustindia.com';
export const EMPTY_BODY: BodyDoc = { type: 'doc', content: [] };
const MAX_LIST_DEPTH = 3;

/** Today in India, as YYYY-MM-DD: the default date of a new issue. */
export function todayInIndia(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * Drops what Postgres can't store in text or jsonb: \u0000, and half of a
 * surrogate pair. It walks code points, so a whole emoji is never split.
 */
export function cleanText(value: string): string {
  let out = '';
  for (const ch of value) {
    const code = ch.charCodeAt(0);
    if (code === 0 || (ch.length === 1 && code >= 0xd800 && code <= 0xdfff)) continue;
    out += ch;
  }
  return out;
}

const singleLine = (value: string) => cleanText(value).replace(/[\u0000-\u001F\u007F]+/g, ' ').trim();

/** Links may be https, http, mailto, tel, or a path on the site (spec §6.3). */
export function isAllowedLink(href: string): boolean {
  return resolveHref(href, NEWSLETTER_SITE_URL) !== null;
}

function cleanMarks(marks: unknown): Mark[] {
  if (!Array.isArray(marks)) return [];
  const out: Mark[] = [];
  for (const mark of marks) {
    const type = (mark as { type?: unknown } | null)?.type;
    if ((type === 'bold' || type === 'italic') && !out.some((m) => m.type === type)) out.push({ type });
    if (type === 'link' && !out.some((m) => m.type === 'link')) {
      const href = (mark as { attrs?: { href?: unknown } }).attrs?.href;
      if (typeof href === 'string' && href.trim() !== '' && href.length <= ISSUE_LIMITS.url && isAllowedLink(href)) {
        out.push({ type: 'link', attrs: { href: href.trim() } });
      }
    }
  }
  return out;
}

function cleanInline(nodes: unknown): InlineNode[] {
  if (!Array.isArray(nodes)) return [];
  const out: InlineNode[] = [];
  for (const node of nodes) {
    const type = (node as { type?: unknown } | null)?.type;
    if (type === 'hardBreak') {
      out.push({ type: 'hardBreak' });
    } else if (type === 'text') {
      const raw = (node as { text?: unknown }).text;
      const text = typeof raw === 'string' ? cleanText(raw) : '';
      if (!text) continue;
      const marks = cleanMarks((node as { marks?: unknown }).marks);
      out.push(marks.length ? { type: 'text', text, marks } : { type: 'text', text });
    }
  }
  return out;
}

function paragraph(node: unknown): ParagraphNode {
  const content = cleanInline((node as { content?: unknown } | null)?.content);
  return content.length ? { type: 'paragraph', content } : { type: 'paragraph' };
}

/** Pull-quotes and list items hold paragraphs: anything else inside them becomes its text. */
function asParagraphs(node: unknown): ParagraphNode[] {
  const n = node as { type?: unknown; content?: unknown } | null;
  if (n?.type === 'paragraph' || n?.type === 'heading') {
    const p = paragraph(n);
    return p.content ? [p] : [];
  }
  const content = n?.content;
  const container = n?.type === 'bulletList' || n?.type === 'orderedList' || n?.type === 'listItem' || n?.type === 'blockquote';
  return container && Array.isArray(content) ? content.flatMap(asParagraphs) : [];
}

function listItems(items: unknown, depth: number): ListItemNode[] {
  if (!Array.isArray(items)) return [];
  const out: ListItemNode[] = [];
  for (const item of items) {
    const it = item as { type?: unknown; content?: unknown } | null;
    if (it?.type !== 'listItem') continue;
    const content: ListItemNode['content'] = [];
    for (const child of Array.isArray(it.content) ? it.content : []) {
      const type = (child as { type?: unknown } | null)?.type;
      if (type === 'bulletList' || type === 'orderedList') {
        const list = block(child, depth);
        if (list?.type === 'bulletList' || list?.type === 'orderedList') content.push(list);
      } else {
        content.push(...asParagraphs(child));
      }
    }
    if (content.length) out.push({ type: 'listItem', content });
  }
  return out;
}

function block(node: unknown, depth = 0): BlockNode | null {
  if (!node || typeof node !== 'object') return null;
  const n = node as { type?: unknown; attrs?: Record<string, unknown> | null; content?: unknown };
  switch (n.type) {
    case 'paragraph':
      return paragraph(n);
    case 'heading': {
      const content = cleanInline(n.content);
      const level: 2 | 3 = n.attrs?.level === 3 ? 3 : 2;
      return content.length ? { type: 'heading', attrs: { level }, content } : { type: 'heading', attrs: { level } };
    }
    case 'bulletList':
    case 'orderedList': {
      if (depth >= MAX_LIST_DEPTH) return null;
      const items = listItems(n.content, depth + 1);
      if (!items.length) return null;
      if (n.type === 'bulletList') return { type: 'bulletList', content: items };
      const start = n.attrs?.start;
      return typeof start === 'number' && Number.isInteger(start) && start > 1 && start < 10_000
        ? { type: 'orderedList', attrs: { start }, content: items }
        : { type: 'orderedList', content: items };
    }
    case 'blockquote': {
      const content = Array.isArray(n.content) ? n.content.flatMap(asParagraphs) : [];
      return content.length ? { type: 'blockquote', content } : null;
    }
    case 'horizontalRule':
      return { type: 'horizontalRule' };
    case 'image': {
      const src = n.attrs?.src;
      if (typeof src !== 'string' || src.trim() === '' || src.length > ISSUE_LIMITS.url) return null;
      const alt = typeof n.attrs?.alt === 'string' ? singleLine(n.attrs.alt).slice(0, ISSUE_LIMITS.heroAlt) : '';
      return { type: 'image', attrs: { src: src.trim(), alt } };
    }
    default:
      return null;
  }
}

/**
 * The body with only the content spec §6.3 allows. Unknown nodes and marks
 * are dropped; headings other than level 3 become level 2; anything but
 * paragraphs inside a pull-quote or list item becomes its text; a link with
 * another scheme loses the link and keeps its text; lists nest three deep at
 * most; empty paragraphs at the end go.
 */
export function normalizeBody(input: unknown): BodyDoc {
  const doc = input as { type?: unknown; content?: unknown } | null;
  if (!doc || doc.type !== 'doc' || !Array.isArray(doc.content)) return { type: 'doc', content: [] };
  const content: BlockNode[] = [];
  for (const node of doc.content) {
    const clean = block(node);
    if (clean) content.push(clean);
  }
  while (content.length > 0) {
    const last = content[content.length - 1];
    if (last.type !== 'paragraph' || last.content) break;
    content.pop();
  }
  return { type: 'doc', content };
}

const line = (max: number, label: string) =>
  z.string().transform(singleLine).pipe(z.string().max(max, `${label} can be at most ${max} characters.`));

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose the issue date.')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, 'Choose a real date.');

const optionalUrl = (message: string, test: (value: string) => boolean) =>
  z
    .string()
    .nullable()
    .transform((value) => (value === null ? null : value.trim() || null))
    .refine((value) => value === null || (value.length <= ISSUE_LIMITS.url && test(value)), message);

/** The fields staff edit (spec §6.2). Every save sends all of them. */
export const issueDraftSchema = z.object({
  subject: line(ISSUE_LIMITS.subject, 'The subject'),
  preheader: line(ISSUE_LIMITS.preheader, 'The inbox preview text'),
  issue_date: isoDate,
  title: line(ISSUE_LIMITS.title, 'The title'),
  hero_image_url: optionalUrl('The hero photo must be an uploaded image.', (value) => /^https:\/\//i.test(value)),
  hero_image_alt: line(ISSUE_LIMITS.heroAlt, 'The photo description'),
  body: z.unknown().transform(normalizeBody),
  share_url: optionalUrl('The Share link must be a web address, such as https://hopetrustindia.com/blogs/…', (value) =>
    /^https?:/i.test(resolveHref(value, NEWSLETTER_SITE_URL) ?? ''),
  ),
  kicker: line(ISSUE_LIMITS.kicker, 'The kicker').default(''),
  intro: line(ISSUE_LIMITS.intro, 'The intro').default(''),
  question: line(ISSUE_LIMITS.question, 'The question').default(''),
});

export type IssueDraft = z.infer<typeof issueDraftSchema>;

/** The editable fields of an issue. */
export function toDraft(issue: IssueForRender): IssueDraft {
  return {
    subject: issue.subject,
    preheader: issue.preheader,
    issue_date: issue.issue_date,
    title: issue.title,
    hero_image_url: issue.hero_image_url,
    hero_image_alt: issue.hero_image_alt,
    body: issue.body,
    share_url: issue.share_url,
    kicker: issue.kicker ?? '',
    intro: issue.intro ?? '',
    question: issue.question ?? '',
  };
}

/** A comparable form of a draft: equal for two drafts that would save the same. */
export function draftKey(draft: unknown): string {
  const parsed = issueDraftSchema.safeParse(draft);
  return JSON.stringify(parsed.success ? parsed.data : draft);
}

/**
 * How the preview and the functions render an issue: the logo from static/;
 * photos from the bucket, or a blog post's photo on Unsplash or the site
 * (fortnightly spec §4.1).
 */
export function issueRenderOptions(
  imagesBase: string,
  mode: RenderOptions['mode'],
  extra: { panel?: BookPanel | null; nextIssueNumber?: number | null } = {},
): RenderOptions {
  const base = imagesBase.replace(/\/+$/, '');
  return {
    mode,
    siteUrl: NEWSLETTER_SITE_URL,
    assetBaseUrl: `${base}/static`,
    imagePrefixes: [`${base}/`, 'https://images.unsplash.com/', `${NEWSLETTER_SITE_URL}/`],
    panel: extra.panel ?? null,
    nextIssueNumber: extra.nextIssueNumber ?? null,
  };
}

export const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;

export interface SendCheck {
  issue: Pick<IssueForRender, 'subject' | 'title' | 'hero_image_url' | 'hero_image_alt'> &
    Partial<Pick<IssueForRender, 'kind' | 'intro'>>;
  /** The send version of the HTML, and its size. */
  html: string;
  bytes: number;
  subscribed: number;
  imagePrefixes: string[];
}

/** Why the issue can't be sent yet (spec §8.1, §9.1 step 4), in the editor's order. Empty when it can. */
export function sendProblems({ issue, html, bytes, subscribed, imagePrefixes }: SendCheck): string[] {
  const problems: string[] = [];
  if (!issue.subject.trim()) problems.push('Add a subject.');
  if (!issue.title.trim()) problems.push('Add a title.');
  if (issue.kind === 'blog' && !String(issue.intro ?? '').trim()) problems.push('Add an intro.');
  if (!allowedImageUrl(issue.hero_image_url, imagePrefixes)) problems.push('Add a hero photo.');
  if (!issue.hero_image_alt.trim()) problems.push("Describe the hero photo for people who can't see it.");
  if (bytes > SIZE_MAX_BYTES) {
    problems.push(`The email is ${kb(bytes)}, over the ${kb(SIZE_MAX_BYTES)} limit. Shorten it or remove an image.`);
  }
  if (!html.includes(UNSUBSCRIBE_PLACEHOLDER)) problems.push('The email is missing its Unsubscribe link.');
  if (subscribed < 1) problems.push('There are no subscribers to send to.');
  return problems;
}

/**
 * The one place a blog post fills an issue (fortnightly spec §5.3): used when
 * the automatic run schedules an issue and when staff swap its post.
 */
export function blogIssueFields(
  post: NewsletterPost,
  sendIndiaDate: string,
): IssueDraft & { post_slug: string; reading_minutes: number } {
  return {
    subject: post.title.slice(0, ISSUE_LIMITS.subject),
    preheader: post.excerpt.slice(0, ISSUE_LIMITS.preheader),
    issue_date: sendIndiaDate,
    title: post.title.slice(0, ISSUE_LIMITS.title),
    hero_image_url: post.image,
    hero_image_alt: post.title.slice(0, ISSUE_LIMITS.heroAlt),
    body: EMPTY_BODY,
    share_url: post.url,
    kicker: post.kicker.slice(0, ISSUE_LIMITS.kicker),
    intro: post.intro.slice(0, ISSUE_LIMITS.intro),
    question: '',
    post_slug: post.slug,
    reading_minutes: Math.min(120, Math.max(1, Math.round(post.readingMinutes))),
  };
}

/** The blog post an article link points at (…/blogs/<slug>/ on the site), or null. */
export function postSlugFromLink(shareUrl: string | null): string | null {
  const href = resolveHref(shareUrl, NEWSLETTER_SITE_URL);
  if (!href) return null;
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (!/^(www\.)?hopetrustindia\.com$/i.test(url.hostname)) return null;
  const match = /^\/blogs\/([a-z0-9-]+)\/?$/i.exec(url.pathname);
  return match ? match[1].toLowerCase() : null;
}

/** What Check status looks for in a broadcast's name (spec §9.1 step 8). */
export const broadcastMarker = (id: string) => `[issue ${id}]`;

/** Resend's name for the broadcast: the subject, then the marker. */
export function broadcastName(issue: Pick<IssueRow, 'id' | 'subject'>): string {
  const subject = Array.from(issue.subject.trim()).slice(0, 80).join('');
  return `${subject || 'Newsletter'} ${broadcastMarker(issue.id)}`;
}
