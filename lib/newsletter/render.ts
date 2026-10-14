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
  IssueForRender,
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

/**
 * The image URL if it is https and inside one of `prefixes` (each ending in "/"), else null.
 * Quotes, brackets and whitespace are percent-encoded, because the hero photo
 * also goes inside a CSS url('…') string, where they would end it early.
 */
export function allowedImageUrl(src: unknown, prefixes: string[]): string | null {
  if (typeof src !== 'string' || src.trim() === '') return null;
  let normalized: string;
  try {
    normalized = new URL(src.trim()).href;
  } catch {
    return null;
  }
  if (!normalized.startsWith('https://')) return null;
  if (!prefixes.some((prefix) => prefix.endsWith('/') && normalized.startsWith(prefix))) return null;
  return normalized.replace(/['"()\\\s]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`);
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
  // Indent with margin, not padding: Outlook's Word engine ignores list padding and clips the bullets.
  return items ? `<${tag}${startAttr} style="margin:0 0 16px 24px;padding:0;">${items}</${tag}>` : '';
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
    if (text) {
      // Count code points, so the cut never lands inside an emoji.
      const chars = Array.from(text);
      return chars.length > max ? `${chars.slice(0, max - 1).join('').trimEnd()}…` : text;
    }
  }
  return '';
}

export type RenderMode = 'preview' | 'test' | 'send';

export interface RenderOptions {
  mode: RenderMode;
  /** Public site origin without a trailing slash, e.g. https://hopetrustindia.com */
  siteUrl: string;
  /** Where the logo and icons live, without a trailing slash. */
  assetBaseUrl: string;
  /** Hero and body images must start with one of these; each ends in "/". */
  imagePrefixes: string[];
}

export interface RenderResult {
  html: string;
  /** UTF-8 size of `html`. */
  bytes: number;
}

/** Resend replaces this with each recipient's own unsubscribe link (broadcasts only). */
export const UNSUBSCRIBE_PLACEHOLDER = '{{{RESEND_UNSUBSCRIBE_URL}}}';
/** Gmail clips messages over 102 KB, and click tracking makes every link longer. */
export const SIZE_WARN_BYTES = 80 * 1024;
export const SIZE_MAX_BYTES = 95 * 1024;

const PHONE_LABEL = '+91 90008 50001';
const PHONE_HREF = 'tel:+919000850001';
const INSTAGRAM_LABEL = 'hopetrust';
const INSTAGRAM_HREF = 'https://www.instagram.com/hopetrust/';
const WHY_LINE = "You're receiving this because you subscribed at hopetrustindia.com.";
const PREHEADER_FILLER = '&#847;&zwnj;&nbsp;'.repeat(60);

function pill(href: string, label: string, align: 'left' | 'right', iconUrl?: string): string {
  const icon = iconUrl
    ? `<img src="${esc(iconUrl)}" width="16" height="16" alt="" style="display:inline-block;vertical-align:middle;border:0;width:16px;height:16px;">&nbsp;&nbsp;`
    : '';
  return `<table role="presentation" align="${align}" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${COLORS.yellow}" style="background-color:${COLORS.yellow};border-radius:20px;mso-padding-alt:8px 18px;"><a href="${esc(href)}" style="display:inline-block;padding:8px 18px;font-family:${FONT};font-size:14px;line-height:1.2;font-weight:500;color:${COLORS.text};text-decoration:none;">${icon}<span style="vertical-align:middle;">${esc(label)}</span></a></td></tr></table>`;
}

function footerLink(href: string, iconUrl: string, label: string): string {
  return `<a href="${esc(href)}" style="color:${COLORS.white};text-decoration:none;font-family:${FONT};font-size:14px;line-height:1.4;font-weight:500;white-space:nowrap;"><img src="${esc(iconUrl)}" width="18" height="18" alt="" style="display:inline-block;vertical-align:middle;border:0;width:18px;height:18px;">&nbsp;&nbsp;<span style="vertical-align:middle;color:${COLORS.white};">${esc(label)}</span></a>`;
}

function dateHtml(isoDate: string): string {
  try {
    const { day, suffix, month, year } = dateParts(isoDate);
    return `${day}<sup style="font-size:60%;line-height:0;vertical-align:super;">${suffix}</sup> ${month}, ${year}`;
  } catch {
    return esc(isoDate);
  }
}

function heroRow(issue: IssueForRender, opts: RenderOptions, logoUrl: string): string {
  const hero = allowedImageUrl(issue.hero_image_url, opts.imagePrefixes);
  // Darker than the banner, so the banner still stands out when images are blocked or missing.
  const bg = COLORS.heroFallback;
  const cellStyle = hero
    ? `background-color:${bg};background-image:url('${esc(hero)}');background-position:center center;background-size:cover;background-repeat:no-repeat;`
    : `background-color:${bg};`;
  const vmlOpen = hero
    ? `<!--[if gte mso 9]><v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:600px;"><v:fill type="frame" src="${esc(hero)}" color="${bg}" aspect="atleast" /><v:textbox style="mso-fit-shape-to-text:true" inset="0,0,0,0"><![endif]-->`
    : '';
  const vmlClose = hero ? '<!--[if gte mso 9]></v:textbox></v:rect><![endif]-->' : '';
  const alt = String(issue.hero_image_alt || '').trim();
  const photoLabel = hero && alt ? `<div role="img" aria-label="${esc(alt)}" style="font-size:0;line-height:0;"></div>` : '';
  return `<tr><td ${hero ? `background="${esc(hero)}" ` : ''}bgcolor="${bg}" valign="top" style="${cellStyle}">
${vmlOpen}<div>${photoLabel}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td align="left" style="padding:16px 16px 0 16px;"><img src="${esc(logoUrl)}" width="96" height="97" alt="Hope Trust" style="display:block;border:0;width:96px;height:auto;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#FFFFFF;"></td></tr>
<tr><td class="hero-spacer" height="150" style="height:150px;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td class="px-hero" style="padding:0 28px 28px 28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="title" bgcolor="${COLORS.orange}" style="background-color:${COLORS.orange};border-radius:28px;padding:18px 24px;text-align:center;font-family:${FONT};font-size:26px;line-height:1.3;font-weight:500;color:${COLORS.white};overflow-wrap:anywhere;word-break:break-word;">${esc(issue.title)}</td></tr></table></td></tr>
</table>
</div>${vmlClose}
</td></tr>`;
}

/** The complete newsletter email for one issue (spec §6). */
export function renderIssueHtml(issue: IssueForRender, opts: RenderOptions): RenderResult {
  const siteUrl = opts.siteUrl.replace(/\/+$/, '');
  const assetBase = opts.assetBaseUrl.replace(/\/+$/, '');
  const campaign = String(issue.issue_date || '');
  const title = String(issue.title || '');
  const body = renderBodyHtml(issue.body, { siteUrl, campaign, imagePrefixes: opts.imagePrefixes });
  const preheader = String(issue.preheader || '').trim() || bodyPreviewText(issue.body) || title;
  const unsubscribeHref = opts.mode === 'send' ? UNSUBSCRIBE_PLACEHOLDER : `${siteUrl}/`;
  const shareResolved = resolveHref(issue.share_url, siteUrl);
  const shareTarget = shareResolved && /^https?:/i.test(shareResolved) ? shareResolved : `${siteUrl}/blogs/`;
  const shareHref = `https://wa.me/?text=${encodeURIComponent(`${title}, from the Hope Trust newsletter: ${shareTarget}`)}`;
  const bookHref = withUtm(`${siteUrl}/book-your-session/`, campaign, siteUrl);
  const siteHref = withUtm(`${siteUrl}/`, campaign, siteUrl);
  const siteLabel = new URL(siteUrl).hostname.replace(/^www\./, '');

  const html = `<!DOCTYPE html>
<html lang="en" dir="ltr" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(issue.subject || title)}</title>
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><style>body,table,td,p,a,h2,h3,li{font-family:Arial,Helvetica,sans-serif !important;}</style><![endif]-->
<!--[if !mso]><!--><link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;700&amp;display=swap" rel="stylesheet"><!--<![endif]-->
<style>
:root{color-scheme:light;supported-color-schemes:light;}
body{margin:0;padding:0;width:100% !important;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
img{-ms-interpolation-mode:bicubic;}
@media only screen and (max-width:620px){
.px{padding-left:20px !important;padding-right:20px !important;}
.px-hero{padding-left:16px !important;padding-right:16px !important;}
.hero-spacer{height:96px !important;}
.title{font-size:22px !important;}
.stack{display:block !important;width:100% !important;text-align:center !important;padding:6px 0 !important;}
}
</style>
</head>
<body style="margin:0;padding:0;background-color:${COLORS.page};">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${COLORS.page};opacity:0;">${esc(preheader)}${PREHEADER_FILLER}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.page}" style="background-color:${COLORS.page};">
<tr><td align="center" style="padding:24px 0;">
<!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.white}" style="width:100%;max-width:600px;background-color:${COLORS.white};">
<tr><td class="px" bgcolor="${COLORS.orange}" align="right" style="background-color:${COLORS.orange};padding:12px 24px;font-family:${FONT};font-size:20px;line-height:1.3;font-weight:500;color:${COLORS.white};">${dateHtml(campaign)}</td></tr>
${heroRow(issue, opts, `${assetBase}/logo-v1.png`)}
<tr><td class="px" style="padding:32px 40px 8px 40px;font-family:${FONT};font-size:15px;line-height:1.65;color:${COLORS.text};overflow-wrap:anywhere;word-break:break-word;">
${body}
</td></tr>
<tr><td class="px" align="center" style="padding:16px 40px 36px 40px;"><table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${COLORS.yellow}" style="background-color:${COLORS.yellow};border-radius:40px;mso-padding-alt:14px 44px;"><a href="${esc(bookHref)}" style="display:inline-block;padding:14px 44px;font-family:${FONT};font-size:20px;line-height:1.2;letter-spacing:1px;font-weight:500;color:${COLORS.text};text-decoration:none;">BOOK YOUR SESSION</a></td></tr></table></td></tr>
<tr><td class="px" bgcolor="${COLORS.orange}" style="background-color:${COLORS.orange};padding:18px 24px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td class="stack" width="33%" align="left" style="padding:0;">${footerLink(PHONE_HREF, `${assetBase}/icon-phone-v1.png`, PHONE_LABEL)}</td>
<td class="stack" width="34%" align="center" style="padding:0;">${footerLink(INSTAGRAM_HREF, `${assetBase}/icon-instagram-v1.png`, INSTAGRAM_LABEL)}</td>
<td class="stack" width="33%" align="right" style="padding:0;">${footerLink(siteHref, `${assetBase}/icon-globe-v1.png`, siteLabel)}</td>
</tr></table></td></tr>
<tr><td class="px" style="padding:20px 24px 8px 24px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="40%" align="left" valign="middle">${pill(shareHref, 'Share', 'left', `${assetBase}/icon-send-v1.png`)}</td>
<td width="20%" align="center" valign="middle"><img src="${esc(`${assetBase}/logo-small-v1.png`)}" width="44" height="44" alt="Hope Trust" style="display:inline-block;border:0;width:44px;height:auto;"></td>
<td width="40%" align="right" valign="middle">${pill(unsubscribeHref, 'Unsubscribe', 'right')}</td>
</tr></table></td></tr>
<tr><td class="px" style="padding:8px 24px 28px 24px;text-align:center;font-family:${FONT};font-size:12px;line-height:1.5;color:${COLORS.muted};">${esc(WHY_LINE)}</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;

  return { html, bytes: new TextEncoder().encode(html).length };
}
