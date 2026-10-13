// Builds the newsletter email HTML from an issue. Design: §6 of
// docs/superpowers/specs/2026-10-13-newsletter-design.md.
//
// This file runs in three places: the admin editor preview (browser), the
// Netlify newsletter functions, and scripts/newsletter-preview.mts (Node's
// built-in TypeScript support). So it uses no Node-only APIs and imports
// nothing at runtime, only `import type`, which disappears when types are
// stripped.

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
