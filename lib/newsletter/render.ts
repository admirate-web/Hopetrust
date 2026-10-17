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

/**
 * The Hope Letter's palette: the client's Cream editorial design
 * (docs/design/newsletter-2026-10-17-hope-letter.html, variant "1"). COLORS and
 * FONT above stay for the confirmation email.
 */
export const HOPE = {
  page: '#E8EEEB',
  white: '#FFFFFF',
  cream: '#F7F5EF',
  teal: '#00373E',
  orange: '#ED7428',
  muted: '#536A6B',
  rule: '#D8DEDA',
  border: '#BECAC8',
  footerRule: '#DFE5E1',
  bandText: '#E0E9E5',
  onOrange: '#002A30',
  panel: '#F9E6D0',
} as const;
export const SERIF = 'Georgia,Times,serif';
export const SANS = 'Arial,Helvetica,sans-serif';

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
        return `<h3 style="margin:24px 0 10px 0;font:normal 20px/1.3 ${SERIF};color:${HOPE.teal};">${inner}</h3>`;
      }
      return `<h2 style="margin:32px 0 12px 0;font:normal 26px/1.25 ${SERIF};color:${HOPE.teal};">${inner}</h2>`;
    }
    case 'bulletList':
    case 'orderedList':
      return renderList(node, ctx);
    case 'blockquote': {
      // The design's question box: cream, with an orange rule on the left.
      const lines = (Array.isArray(node.content) ? node.content : [])
        .map((paragraph) => renderInline(paragraph?.content, ctx))
        .filter((line) => line !== '');
      if (!lines.length) return '';
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;"><tr><td bgcolor="${HOPE.cream}" style="background-color:${HOPE.cream};border-left:3px solid ${HOPE.orange};padding:24px 26px;font:normal 22px/1.4 ${SERIF};color:${HOPE.teal};">${lines.join('<br><br>')}</td></tr></table>`;
    }
    case 'horizontalRule':
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0;"><tr><td style="border-top:1px solid ${HOPE.rule};font-size:0;line-height:0;">&nbsp;</td></tr></table>`;
    case 'image': {
      const src = allowedImageUrl(node.attrs?.src, ctx.imagePrefixes);
      if (!src) return '';
      return `<img src="${esc(src)}" alt="${esc(node.attrs?.alt ?? '')}" width="560" style="display:block;width:100%;max-width:560px;height:auto;border:0;margin:8px 0 20px 0;">`;
    }
    default:
      return '';
  }
}

/** The issue body as email-safe HTML, using only the content allowed by spec §6.3. */
export function renderBodyHtml(doc: BodyDoc, opts: BodyRenderOptions): string {
  const blocks = doc && Array.isArray(doc.content) ? doc.content : [];
  const ctx: InlineContext = { ...opts, linkColor: HOPE.teal };
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

/** Text cut to `max` code points with an ellipsis, so the cut never lands inside an emoji. */
function previewCut(text: string, max: number): string {
  const chars = Array.from(text.replace(/\s+/g, ' ').trim());
  return chars.length > max ? `${chars.slice(0, max - 1).join('').trimEnd()}…` : chars.join('');
}

/** The first paragraph's text, used as the inbox preview line when none is set. */
export function bodyPreviewText(doc: BodyDoc | undefined, max = 140): string {
  const blocks = doc && Array.isArray(doc.content) ? doc.content : [];
  for (const block of blocks) {
    if (block?.type !== 'paragraph') continue;
    const text = previewCut(inlineText(block.content), max);
    if (text) return text;
  }
  return '';
}

/** Every word of a body, for its reading time. */
function textOf(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const n = node as { type?: unknown; text?: unknown; content?: unknown };
  if (n.type === 'text' && typeof n.text === 'string') return n.text;
  return Array.isArray(n.content) ? n.content.map(textOf).join(' ') : '';
}

/** A manual issue's reading time: 200 words a minute, at least one minute. */
export function readingMinutesOf(doc: BodyDoc): number {
  const words = textOf(doc).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

/** The title's lead, and the part after the first ": ", which the design sets in italic. */
export function splitTitle(title: string): { lead: string; emphasis: string | null } {
  const text = String(title ?? '').trim();
  const at = text.indexOf(': ');
  if (at < 0) return { lead: text, emphasis: null };
  return { lead: text.slice(0, at + 1).trim(), emphasis: text.slice(at + 2).trim() || null };
}

/** The design's four share links. They carry no tracking tags: the people who open them weren't sent the newsletter. */
export function shareLinks(title: string, url: string): { email: string; whatsapp: string; facebook: string; linkedin: string } {
  const enc = encodeURIComponent;
  return {
    email: `mailto:?subject=${enc(`${title} | Hope Trust`)}&body=${enc(`I thought you might enjoy this article from Hope Trust.\r\n\r\n${url}`)}`,
    whatsapp: `https://wa.me/?text=${enc(`${title} — Hope Trust\n${url}`)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}`,
  };
}

export type RenderMode = 'preview' | 'test' | 'send';

/** The optional book panel from the settings (fortnightly spec §4 part 8). */
export interface BookPanel {
  eyebrow: string;
  title: string;
  text: string;
  linkText: string;
  url: string;
}

export interface RenderOptions {
  mode: RenderMode;
  /** Public site origin without a trailing slash, e.g. https://hopetrustindia.com */
  siteUrl: string;
  /** Where the logo lives, without a trailing slash. */
  assetBaseUrl: string;
  /** Hero and body images must start with one of these; each ends in "/". */
  imagePrefixes: string[];
  /** The settings' book panel, shown when set. */
  panel?: BookPanel | null;
  /** Shown while the issue has no number yet: previews, tests and the preview email. */
  nextIssueNumber?: number | null;
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

const WIDTH = 640;
const INSTAGRAM_HREF = 'https://www.instagram.com/hopetrust/';
const FACEBOOK_HREF = 'https://www.facebook.com/hopetrust';
const CONTACT_EMAIL = 'frontoffice@hopetrustindia.com';
const ADDRESS_LINES = [
  'C/o UCCHVAS Rehabilitation Center, Plot no. 564-A-36-111',
  'Opp. Lotus Pond Road, MLA Colony, Banjara Hills',
  'Hyderabad, Telangana 500034, India',
];
const WHY_LINE = "You're receiving this because you subscribed at hopetrustindia.com.";
const PREHEADER_FILLER = '&#847;&zwnj;&nbsp;'.repeat(60);

/** The design's small capitals label; `html` is already escaped. */
function eyebrow(html: string): string {
  return `<p style="margin:0;font-family:${SANS};font-size:11px;line-height:1.5;color:${HOPE.muted};font-weight:700;letter-spacing:1.8px;">${html}</p>`;
}

/** A button that keeps its shape in classic Outlook (VML) and everywhere else (a padded link). */
function button(href: string, label: string, width: number, background: string, color: string): string {
  const h = esc(href);
  const text = esc(label);
  return `<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${h}" style="height:48px;v-text-anchor:middle;width:${width}px;" arcsize="8%" stroke="f" fillcolor="${background}"><w:anchorlock/><center style="color:${color};font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">${text}</center></v:roundrect><![endif]--><!--[if !mso]><!--><a href="${h}" target="_blank" style="display:inline-block;min-width:${width - 40}px;padding:14px 20px;background-color:${background};border:1px solid ${background};border-radius:4px;color:${color};font-family:${SANS};font-size:16px;font-weight:700;line-height:20px;text-align:center;text-decoration:none;mso-hide:all;">${text}</a><!--<![endif]-->`;
}

function shareCell(href: string, label: string): string {
  return `<td class="share-cell" width="25%" align="center" style="padding:0 3px;"><a href="${esc(href)}" target="_blank" aria-label="Share via ${label}" style="display:block;border:1px solid ${HOPE.border};border-radius:4px;padding:12px 3px;font-family:${SANS};font-size:12px;line-height:18px;font-weight:700;color:${HOPE.teal};text-decoration:none;">${label}</a></td>`;
}

function socialCell(href: string, label: string): string {
  return `<td style="padding:0 5px;"><a href="${esc(href)}" target="_blank" aria-label="Follow Hope Trust on ${label}" style="display:inline-block;border:1px solid ${HOPE.border};border-radius:4px;padding:11px 17px;font:700 12px/18px ${SANS};color:${HOPE.teal};text-decoration:none;">${label}</a></td>`;
}

const footerLine = (html: string, margin: string, size = 12, color: string = HOPE.muted) =>
  `<p style="margin:${margin};font-family:${SANS};font-size:${size}px;line-height:1.65;color:${color};">${html}</p>`;

/** The complete email for one issue: The Hope Letter (fortnightly spec §4). */
export function renderIssueHtml(issue: IssueForRender, opts: RenderOptions): RenderResult {
  const siteUrl = opts.siteUrl.replace(/\/+$/, '');
  const assetBase = opts.assetBaseUrl.replace(/\/+$/, '');
  const campaign = String(issue.issue_date || '');
  const onSite = (path: string) => withUtm(`${siteUrl}${path}`, campaign, siteUrl);
  const title = String(issue.title || '');
  const isBlog = issue.kind === 'blog';
  const intro = String(issue.intro || '').trim();
  const question = String(issue.question || '').trim();
  const kicker = String(issue.kicker || '').trim();
  const number = issue.issue_number ?? opts.nextIssueNumber ?? null;
  const minutes = isBlog && issue.reading_minutes ? issue.reading_minutes : readingMinutesOf(issue.body);
  const resolved = resolveHref(issue.share_url, siteUrl);
  const article = resolved && /^https?:/i.test(resolved) ? resolved : null;
  const articleHref = article ? withUtm(article, campaign, siteUrl) : null;
  const share = shareLinks(title, article ?? `${siteUrl}/blogs/`);
  const hero = allowedImageUrl(issue.hero_image_url, opts.imagePrefixes);
  const preheader =
    String(issue.preheader || '').trim() || (isBlog ? previewCut(intro, 140) : bodyPreviewText(issue.body)) || title;
  const unsubscribeHref = opts.mode === 'send' ? UNSUBSCRIBE_PLACEHOLDER : `${siteUrl}/`;
  const year = /^\d{4}/.test(campaign) ? campaign.slice(0, 4) : String(new Date().getUTCFullYear());
  const { lead, emphasis } = splitTitle(title);
  const titleHtml = emphasis ? `${esc(lead)}<br><em style="font-weight:normal;">${esc(emphasis)}</em>` : esc(lead);
  const issueLine = [number !== null ? `ISSUE ${String(number).padStart(2, '0')}` : '', esc(kicker.toUpperCase())]
    .filter(Boolean)
    .join(' &nbsp;/&nbsp; ');
  const panel = opts.panel ?? null;
  const panelHref = panel ? resolveHref(panel.url, siteUrl) : null;
  const heroImg = hero
    ? `<img src="${esc(hero)}" width="${WIDTH}" alt="${esc(issue.hero_image_alt)}" style="display:block;width:100%;max-width:${WIDTH}px;height:auto;border:0;">`
    : '';

  const rows: string[] = [
    `<tr><td style="height:5px;font-size:0;line-height:0;background-color:${HOPE.orange};"></td></tr>`,
    // Masthead.
    `<tr><td class="side-pad" style="padding:30px 40px 26px;background-color:${HOPE.cream};"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td width="82" valign="middle"><a href="${esc(onSite('/'))}" target="_blank"><img src="${esc(`${assetBase}/logo-round-v1.png`)}" width="70" height="71" alt="Hope Trust — Psychological Wellness, since 2002" style="display:block;border:0;"></a></td><td valign="middle" style="padding-left:13px;">${eyebrow('HOPE TRUST · FORTNIGHTLY')}<p style="margin:5px 0 0;font:normal 32px/1.1 ${SERIF};color:${HOPE.teal};">The Hope Letter</p></td></tr></table></td></tr>`,
    `<tr><td class="side-pad" style="padding:0 40px 27px;background-color:${HOPE.cream};"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td style="border-top:1px solid ${HOPE.rule};padding-top:16px;">${eyebrow(issueLine || '&nbsp;')}</td></tr></table></td></tr>`,
    `<tr><td class="side-pad" style="padding:0 40px 30px;background-color:${HOPE.cream};"><h1 class="main-title" style="margin:0;font:normal 42px/1.13 ${SERIF};letter-spacing:-0.7px;color:${HOPE.teal};overflow-wrap:anywhere;word-break:break-word;">${titleHtml}</h1><p style="margin:23px 0 0;font-family:${SANS};font-size:10px;line-height:1.65;color:${HOPE.muted};font-weight:700;letter-spacing:1.2px;">BY HOPE TRUST &nbsp;·&nbsp; <span style="white-space:nowrap;">${minutes} MIN READ</span></p></td></tr>`,
  ];
  if (heroImg) rows.push(`<tr><td>${articleHref ? `<a href="${esc(articleHref)}" target="_blank">${heroImg}</a>` : heroImg}</td></tr>`);

  if (isBlog) {
    if (intro) {
      rows.push(
        `<tr><td class="side-pad" style="padding:30px 40px 24px;"><p style="margin:0;font-family:${SANS};font-size:17px;line-height:1.65;color:${HOPE.teal};">${esc(intro)}</p></td></tr>`,
      );
    }
  } else {
    const body = renderBodyHtml(issue.body, { siteUrl, campaign, imagePrefixes: opts.imagePrefixes });
    rows.push(
      `<tr><td class="side-pad" style="padding:30px 40px 8px;font-family:${SANS};font-size:17px;line-height:1.65;color:${HOPE.teal};overflow-wrap:anywhere;word-break:break-word;">\n${body}\n</td></tr>`,
    );
  }
  if (question) {
    rows.push(
      `<tr><td class="side-pad" style="padding:0 40px 24px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td style="padding:24px 26px;background-color:${HOPE.cream};border-left:3px solid ${HOPE.orange};">${eyebrow('A QUESTION TO TAKE WITH YOU')}<p style="margin:12px 0 0;font:normal 24px/1.4 ${SERIF};color:${HOPE.teal};">${esc(question)}</p></td></tr></table></td></tr>`,
    );
  }
  if (articleHref) {
    rows.push(`<tr><td class="side-pad" style="padding:0 40px 27px;">${button(articleHref, 'Read the article', 184, HOPE.teal, HOPE.white)}</td></tr>`);
  }

  rows.push(
    `<tr><td class="side-pad" style="padding:0 37px 32px;"><p style="margin:0 0 12px;font-family:${SANS};font-size:14px;line-height:1.65;color:${HOPE.teal};font-weight:700;">Share a little hope.</p><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>${shareCell(share.email, 'Email')}${shareCell(share.whatsapp, 'WhatsApp')}${shareCell(share.facebook, 'Facebook')}${shareCell(share.linkedin, 'LinkedIn')}</tr></table></td></tr>`,
    // The booking band.
    `<tr><td class="side-pad" style="padding:30px 40px;background-color:${HOPE.teal};"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td class="stack" valign="middle" style="width:320px;"><h2 style="margin:0 0 9px;font:normal 26px/1.25 ${SERIF};color:${HOPE.white};">A conversation can be<br>a place to start.</h2><p style="margin:0;font-family:${SANS};font-size:14px;line-height:1.65;color:${HOPE.bandText};">Explore our therapists and choose an online or in-clinic session.</p></td><td class="stack stack-cta" valign="middle" align="right">${button(onSite('/book-your-session/'), 'Book session', 154, HOPE.orange, HOPE.onOrange)}</td></tr></table></td></tr>`,
    `<tr><td style="height:30px;line-height:30px;font-size:0;">&nbsp;</td></tr>`,
  );

  if (panel) {
    const link = panelHref
      ? `<a href="${esc(withUtm(panelHref, campaign, siteUrl))}" target="_blank" style="color:${HOPE.teal};font-family:${SANS};font-weight:700;font-size:15px;line-height:1.6;text-decoration:underline;text-underline-offset:4px;">${esc(panel.linkText)}</a>`
      : '';
    rows.push(
      `<tr><td class="side-pad" style="padding:0 40px 30px;background-color:${HOPE.white};"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td style="padding:24px 28px;background-color:${HOPE.panel};border-left:3px solid ${HOPE.orange};">${eyebrow(esc(panel.eyebrow.toUpperCase()))}<h2 style="margin:9px 0 7px;font:normal 28px/1.2 ${SERIF};color:${HOPE.teal};">${esc(panel.title)}</h2><p style="margin:0 0 14px;font-family:${SANS};font-size:14px;line-height:1.65;color:${HOPE.teal};">${esc(panel.text)}</p>${link}</td></tr></table></td></tr>`,
    );
  }

  rows.push(
    `<tr><td class="side-pad" style="padding:28px 32px 24px;text-align:center;border-top:1px solid ${HOPE.footerRule};background-color:${HOPE.cream};">${eyebrow('STAY CONNECTED WITH HOPE TRUST')}<div style="height:15px;line-height:15px;">&nbsp;</div><table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr>${socialCell(INSTAGRAM_HREF, 'Instagram')}${socialCell(FACEBOOK_HREF, 'Facebook')}</tr></table>` +
      footerLine('Hope Trust · Psychological Wellness', '23px 0 0') +
      footerLine(ADDRESS_LINES.map(esc).join('<br>'), '7px 0 0', 11) +
      footerLine(`<a href="mailto:${CONTACT_EMAIL}" style="color:inherit;text-decoration:none;">${CONTACT_EMAIL}</a>`, '2px 0 0') +
      footerLine('The Hope Letter · One thoughtful read, every fortnight.', '16px 0 0') +
      footerLine(
        `<a href="${esc(unsubscribeHref)}" style="color:${HOPE.teal};text-decoration:underline;display:inline-block;padding:12px 5px;">Unsubscribe</a> &nbsp;·&nbsp; <a href="${esc(onSite('/privacy-policy/'))}" target="_blank" style="color:${HOPE.teal};text-decoration:underline;display:inline-block;padding:12px 5px;">Privacy policy</a>`,
        '0',
        12,
        HOPE.teal,
      ) +
      footerLine(esc(WHY_LINE), '2px 0 0', 11) +
      footerLine(`© ${year} Hope Trust`, '2px 0 0', 11) +
      `</td></tr>`,
  );

  const html = `<!DOCTYPE html>
<html lang="en" dir="ltr" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(String(issue.subject || title).trim())} | The Hope Letter</title>
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
<style>
:root{color-scheme:light;supported-color-schemes:light;}
html,body{margin:0!important;padding:0!important;width:100%!important;}
body{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
table,td{mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;}
img{border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;}
a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important;}
@media only screen and (max-width:640px){
.email-shell{width:100%!important;}
.outer{padding:0!important;}
.side-pad{padding-left:24px!important;padding-right:24px!important;}
.main-title{font-size:33px!important;line-height:1.16!important;}
.stack{display:block!important;width:100%!important;box-sizing:border-box!important;}
.stack-cta{padding-top:20px!important;text-align:left!important;}
.share-cell a{font-size:11px!important;padding-left:1px!important;padding-right:1px!important;}
}
</style>
</head>
<body style="margin:0;padding:0;background-color:${HOPE.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${esc(preheader)}${PREHEADER_FILLER}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${HOPE.page};"><tr><td class="outer" style="padding:30px 12px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${WIDTH}" align="center" class="email-shell" style="width:${WIDTH}px;max-width:${WIDTH}px;background-color:${HOPE.white};">
${rows.join('\n')}
</table>
</td></tr></table>
</body>
</html>`;

  return { html, bytes: new TextEncoder().encode(html).length };
}
