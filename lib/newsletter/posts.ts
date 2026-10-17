// Blog posts as The Hope Letter needs them (fortnightly spec §4.1, §5.3, §5.7):
// a photo email clients can show, an intro, a kicker and a reading time, and
// the rule that picks the next post.
//
// scripts/newsletter-posts.mts runs this with Node alone (built-in TypeScript),
// so it imports nothing at runtime, only `import type`.

import type { BlogPost } from '../blog';

export interface NewsletterPost {
  slug: string;
  title: string;
  /** As the post's front matter has it; the newest goes first. */
  date: string;
  excerpt: string;
  intro: string;
  kicker: string;
  /** A JPEG or PNG on a host the renderer allows, or null when the post has no usable photo. */
  image: string | null;
  readingMinutes: number;
  url: string;
}

export const DEFAULT_KICKER = 'A moment for yourself';
const SITE = 'https://hopetrustindia.com';
const GENERIC_CATEGORY = 'Blog';
const MIN_INTRO = 120;
const MAX_INTRO = 320;
const UNSPLASH = /^https:\/\/images\.unsplash\.com\//i;
const EMAIL_SAFE = /\.(jpe?g|png)$/i;
/** Blocks that aren't prose: headings, lists, images, quotes, tables, code, HTML or MDX, rules, and quotations. */
const NOT_PROSE = /^(#|[-*+]\s|\d+[.)]\s|!\[|>|\||```|<|import\s|export\s|---|[“"‘'])/;
const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&nbsp;': ' ',
  '&quot;': '"',
  '&#39;': "'",
  '&rsquo;': '’',
  '&lsquo;': '‘',
  '&ldquo;': '“',
  '&rdquo;': '”',
  '&hellip;': '…',
  '&mdash;': '—',
  '&ndash;': '–',
};

/**
 * The post's photo as the email can use it: Unsplash as a fixed JPEG (its
 * auto=format can serve WebP, which Outlook for Windows doesn't show), site
 * images as JPEG or PNG on the live site. Anything else is null.
 */
export function emailImageUrl(featuredImage: string | undefined | null): string | null {
  const src = String(featuredImage ?? '').trim();
  if (!src) return null;
  if (UNSPLASH.test(src)) return `${src.split('?')[0]}?w=1200&h=750&fit=crop&fm=jpg&q=80`;
  const path = src.startsWith('/') ? src : src.startsWith(`${SITE}/`) ? src.slice(SITE.length) : null;
  if (!path || !EMAIL_SAFE.test(path.split('?')[0])) return null;
  return `${SITE}${path}`;
}

function clean(block: string): string {
  return block
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s*\(https?:\/\/[^)\s]+\)/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z]+;|&#\d+;/gi, (entity) => ENTITIES[entity.toLowerCase()] ?? entity)
    .replace(/\*{1,3}|_{2,3}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Cuts at the last sentence end within MAX_INTRO characters, or at a word with an ellipsis. */
function cut(text: string): string {
  if (text.length <= MAX_INTRO) return text;
  let end = 0;
  for (const match of Array.from(text.matchAll(/[.!?]["”’)]?(?=\s|$)/g))) {
    const at = (match.index ?? 0) + match[0].length;
    if (at > MAX_INTRO) break;
    end = at;
  }
  if (end > 0) return text.slice(0, end);
  const words = text.slice(0, MAX_INTRO).replace(/\s+\S*$/, '').replace(/[\s,;:–—-]+$/, '');
  return `${words}…`;
}

/** The post's first prose paragraph of at least 120 characters, cleaned and cut (spec §5.3); '' when none qualifies. */
export function firstParagraph(markdown: string): string {
  for (const block of String(markdown ?? '').split(/\n\s*\n/)) {
    const raw = block.trim();
    if (!raw || NOT_PROSE.test(raw)) continue;
    const text = clean(raw);
    if (text.length >= MIN_INTRO) return cut(text);
  }
  return '';
}

/** The intro: the first paragraph, else the summary, else the excerpt (written for search results, so last). */
export function introFor(post: Pick<BlogPost, 'content' | 'summary' | 'excerpt'>): string {
  return firstParagraph(post.content) || clean(String(post.summary ?? '')) || clean(String(post.excerpt ?? ''));
}

export function kickerFor(categories: string[]): string {
  const first = String(categories?.[0] ?? '').trim();
  return first && first !== GENERIC_CATEGORY ? first : DEFAULT_KICKER;
}

export function toNewsletterPost(post: BlogPost): NewsletterPost {
  const date = (post.date as unknown) instanceof Date ? (post.date as unknown as Date).toISOString() : String(post.date);
  const minutes = Number.parseInt(String(post.readingTime ?? ''), 10);
  return {
    slug: post.slug,
    title: String(post.title ?? '').trim(),
    date,
    excerpt: clean(String(post.excerpt ?? '')),
    intro: introFor(post),
    kicker: kickerFor(post.categories ?? []),
    image: emailImageUrl(post.featuredImage),
    readingMinutes: Number.isFinite(minutes) && minutes > 0 ? minutes : 1,
    url: `${SITE}/blogs/${post.slug}/`,
  };
}

/**
 * The newest post (by date) with a usable photo that hasn't been sent, and
 * whose photo wasn't in the recent issues (spec §5.3). Null when none is left.
 */
export function chooseNextPost(posts: NewsletterPost[], sentSlugs: string[], recentImages: string[]): NewsletterPost | null {
  const candidates = posts
    .filter((p) => p.image !== null && !sentSlugs.includes(p.slug) && !recentImages.includes(p.image))
    .sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
  return candidates[0] ?? null;
}
