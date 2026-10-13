// Builds the newsletter email HTML from an issue. Design: §6 of
// docs/superpowers/specs/2026-10-13-newsletter-design.md.
//
// This file runs in three places: the admin editor preview (browser), the
// Netlify newsletter functions, and scripts/newsletter-preview.mts (Node's
// built-in TypeScript support). So it uses no Node-only APIs and imports
// nothing at runtime, only `import type`, which disappears when types are
// stripped.

import type {
  BlockNode,
  BodyDoc,
  BulletListNode,
  InlineNode,
  ListItemNode,
  Mark,
  OrderedListNode,
} from './content';

/** Colours sampled from the design PDF (docs/design/newsletter-template-2026-10.pdf). */
export const COLORS = {
  orange: '#EE7429',
  yellow: '#FFDF00',
  text: '#000000',
  white: '#FFFFFF',
  muted: '#6B6B6B',
  page: '#F4F4F4',
  heroFallback: '#C4611F',
} as const;

export const FONT = 'Montserrat, Arial, Helvetica, sans-serif';

const SITE_HOSTS = new Set(['hopetrustindia.com', 'www.hopetrustindia.com']);
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Public URL of the newsletter-images bucket, without a trailing slash. */
export function newsletterImagesBase(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/newsletter-images`;
}

/** Escapes text for HTML content and attribute values. */
export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function ordinal(day: number): string {
  if (day % 100 >= 11 && day % 100 <= 13) return 'th';
  if (day % 10 === 1) return 'st';
  if (day % 10 === 2) return 'nd';
  if (day % 10 === 3) return 'rd';
  return 'th';
}

export function dateParts(isoDate: string): { day: number; suffix: string; month: string; year: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  const monthIndex = match ? Number(match[2]) - 1 : -1;
  const day = match ? Number(match[3]) : 0;
  if (!match || monthIndex < 0 || monthIndex > 11 || day < 1 || day > 31) {
    throw new RangeError(`Invalid issue date: ${isoDate}`);
  }
  return { day, suffix: ordinal(day), month: MONTHS[monthIndex], year: Number(match[1]) };
}

/** "2026-10-13" → "13th October, 2026" */
export function formatIssueDate(isoDate: string): string {
  const { day, suffix, month, year } = dateParts(isoDate);
  return `${day}${suffix} ${month}, ${year}`;
}

/** An absolute, allowed link target, or null when the link must be dropped. */
export function resolveHref(href: unknown, siteUrl: string): string | null {
  if (typeof href !== 'string') return null;
  const trimmed = href.trim();
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return siteUrl.replace(/\/+$/, '') + trimmed;
  }
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(trimmed)?.[1]?.toLowerCase();
  return scheme === 'https' || scheme === 'http' || scheme === 'mailto' || scheme === 'tel' ? trimmed : null;
}

/** Adds the newsletter UTM tags to links that point at the Hope Trust site. */
export function withUtm(href: string, campaign: string, siteUrl: string): string {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return href;
  }
  let siteHost = '';
  try {
    siteHost = new URL(siteUrl).hostname;
  } catch {
    // An unusable siteUrl leaves only the production hosts.
  }
  const onSite = SITE_HOSTS.has(url.hostname) || (siteHost !== '' && url.hostname === siteHost);
  if (!onSite || (url.protocol !== 'https:' && url.protocol !== 'http:') || url.searchParams.has('utm_source')) {
    return href;
  }
  url.searchParams.set('utm_source', 'newsletter');
  url.searchParams.set('utm_medium', 'email');
  url.searchParams.set('utm_campaign', campaign);
  return url.toString();
}

/** The image URL if it is https and inside one of `prefixes` (each ending in "/"), else null. */
export function allowedImageUrl(src: unknown, prefixes: string[]): string | null {
  if (typeof src !== 'string' || src.trim() === '') return null;
  let normalized: string;
  try {
    normalized = new URL(src.trim()).href;
  } catch {
    return null;
  }
  if (!normalized.startsWith('https://')) return null;
  return prefixes.some((prefix) => prefix.endsWith('/') && normalized.startsWith(prefix)) ? normalized : null;
}

export interface BodyRenderOptions {
  siteUrl: string;
  /** The utm_campaign value: the issue date. */
  campaign: string;
  imagePrefixes: string[];
}

interface InlineContext extends BodyRenderOptions {
  linkColor: string;
}

function renderInline(nodes: InlineNode[] | undefined, ctx: InlineContext): string {
  if (!Array.isArray(nodes)) return '';
  return nodes
    .map((node) => {
      if (!node || typeof node !== 'object') return '';
      if (node.type === 'hardBreak') return '<br>';
      if (node.type !== 'text' || typeof node.text !== 'string') return '';
      const marks: Mark[] = Array.isArray(node.marks) ? node.marks : [];
      let out = esc(node.text);
      if (marks.some((mark) => mark?.type === 'bold')) out = `<strong style="font-weight:700;">${out}</strong>`;
      if (marks.some((mark) => mark?.type === 'italic')) out = `<em style="font-style:italic;">${out}</em>`;
      const link = marks.find((mark): mark is Extract<Mark, { type: 'link' }> => mark?.type === 'link');
      const href = link ? resolveHref(link.attrs?.href, ctx.siteUrl) : null;
      if (href) {
        out = `<a href="${esc(withUtm(href, ctx.campaign, ctx.siteUrl))}" style="color:${ctx.linkColor};text-decoration:underline;">${out}</a>`;
      }
      return out;
    })
    .join('');
}

function renderListItem(item: ListItemNode, ctx: InlineContext): string {
  let out = '';
  let afterText = false;
  for (const child of Array.isArray(item?.content) ? item.content : []) {
    if (child?.type === 'paragraph') {
      const text = renderInline(child.content, ctx);
      if (!text) continue;
      out += (afterText ? '<br>' : '') + text;
      afterText = true;
    } else if (child?.type === 'bulletList' || child?.type === 'orderedList') {
      out += renderList(child, ctx);
      afterText = false;
    }
  }
  return out;
}

function renderList(node: BulletListNode | OrderedListNode, ctx: InlineContext): string {
  const tag = node.type === 'orderedList' ? 'ol' : 'ul';
  const start = node.type === 'orderedList' ? node.attrs?.start : undefined;
  const startAttr = typeof start === 'number' && Number.isInteger(start) && start > 1 ? ` start="${start}"` : '';
  const items = (Array.isArray(node.content) ? node.content : [])
    .map((item) => renderListItem(item, ctx))
    .filter((item) => item !== '')
    .map((item) => `<li style="margin:0 0 8px 0;">${item}</li>`)
    .join('');
  return items ? `<${tag}${startAttr} style="margin:0 0 16px 0;padding:0 0 0 24px;">${items}</${tag}>` : '';
}

function renderBlock(node: BlockNode, ctx: InlineContext): string {
  if (!node || typeof node !== 'object') return '';
  switch (node.type) {
    case 'paragraph':
      return `<p style="margin:0 0 16px 0;">${renderInline(node.content, ctx) || '&nbsp;'}</p>`;
    case 'heading': {
      const inner = renderInline(node.content, ctx);
      if (!inner) return '';
      if (node.attrs?.level === 3) {
        return `<h3 style="margin:24px 0 10px 0;font-family:${FONT};font-size:18px;line-height:1.35;font-weight:700;color:${COLORS.text};">${inner}</h3>`;
      }
      return `<h2 style="margin:32px 0 12px 0;font-family:${FONT};font-size:22px;line-height:1.3;font-weight:700;color:${COLORS.text};text-align:center;">${inner}</h2>`;
    }
    case 'bulletList':
    case 'orderedList':
      return renderList(node, ctx);
    case 'blockquote': {
      const quoteCtx: InlineContext = { ...ctx, linkColor: COLORS.white };
      const lines = (Array.isArray(node.content) ? node.content : [])
        .map((paragraph) => renderInline(paragraph?.content, quoteCtx))
        .filter((line) => line !== '');
      if (!lines.length) return '';
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;"><tr><td bgcolor="${COLORS.orange}" style="background-color:${COLORS.orange};border-radius:16px;padding:24px 28px;text-align:center;font-family:${FONT};font-size:24px;line-height:1.35;font-weight:500;color:${COLORS.white};">${lines.join('<br><br>')}</td></tr></table>`;
    }
    case 'horizontalRule':
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0;"><tr><td style="border-top:2px solid ${COLORS.orange};font-size:0;line-height:0;">&nbsp;</td></tr></table>`;
    case 'image': {
      const src = allowedImageUrl(node.attrs?.src, ctx.imagePrefixes);
      if (!src) return '';
      return `<img src="${esc(src)}" alt="${esc(node.attrs?.alt ?? '')}" width="520" style="display:block;width:100%;max-width:520px;height:auto;border:0;border-radius:12px;margin:8px 0 20px 0;">`;
    }
    default:
      return '';
  }
}

/** The issue body as email-safe HTML, using only the content allowed by spec §6.3. */
export function renderBodyHtml(doc: BodyDoc, opts: BodyRenderOptions): string {
  const blocks = doc && Array.isArray(doc.content) ? doc.content : [];
  const ctx: InlineContext = { ...opts, linkColor: COLORS.orange };
  return blocks
    .map((block) => renderBlock(block, ctx))
    .filter((html) => html !== '')
    .join('\n');
}

function inlineText(nodes: InlineNode[] | undefined): string {
  if (!Array.isArray(nodes)) return '';
  return nodes
    .map((node) => {
      if (node?.type === 'hardBreak') return ' ';
      return node?.type === 'text' && typeof node.text === 'string' ? node.text : '';
    })
    .join('');
}

/** The first paragraph's text, used as the inbox preview line when none is set. */
export function bodyPreviewText(doc: BodyDoc | undefined, max = 140): string {
  const blocks = doc && Array.isArray(doc.content) ? doc.content : [];
  for (const block of blocks) {
    if (block?.type !== 'paragraph') continue;
    const text = inlineText(block.content).replace(/\s+/g, ' ').trim();
    if (text) return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
  }
  return '';
}
