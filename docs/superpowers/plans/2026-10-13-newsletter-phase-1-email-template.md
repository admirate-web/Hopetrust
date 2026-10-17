# Newsletter Phase 1: Email Template — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and verify the newsletter email. This covers three pieces:

- the renderer, which turns an issue into the design team's layout;
- the email's images;
- a local script that previews the email and sends a test.

**Architecture:**

- **Renderer:** a pure TypeScript module (`lib/newsletter/render.ts`) turns typed issue data (`lib/newsletter/content.ts`) into table-based email HTML. It imports nothing at runtime, so the same file runs in the browser (the admin preview in plan 3), in Netlify functions, and under Node's built-in TypeScript support (the local script).
- **Images:** the logo, icons and sample photo live in a public Supabase Storage bucket, `newsletter-images`.
- **Sample issue:** built from the design PDF. It drives the size test, the snapshot test and real test sends.

**Tech Stack:**

- TypeScript and Vitest (jsdom environment, `@/` alias).
- Node 24 running `.mts` scripts directly.
- Supabase Storage, through `@supabase/supabase-js`, already a dependency.
- The Resend REST API.
- The Netlify CLI (`netlify functions:serve`), already a devDependency.
- `sharp`, installed in the scratchpad only, to make the images once.

**Spec:** `docs/superpowers/specs/2026-10-13-newsletter-design.md`. This plan covers §14 phase 1 and the email design in §6, and runs the two early checks in §15: the banner over the photo, and `.mts` bundling.

This is **plan 1 of 3**. Plans 2 (subscribers) and 3 (issues, sending, clean-up) are written after this plan's results are in (Task 8), because those results decide details in them.

## Global Constraints

- **Sender:** `Hope Trust <newsletter@hopetrustindia.com>`, with replies to `frontoffice@hopetrustindia.com`.
- **Email HTML:** tables, 600 px wide, inline styles, fluid down to 320 px. No JavaScript, forms or video.
- **Size:** warn above 80 KB (`SIZE_WARN_BYTES = 80 * 1024`); block sending above 95 KB (`SIZE_MAX_BYTES = 95 * 1024`). Gmail clips messages over 102 KB.
- **Links:** only `https:`, `http:`, `mailto:` and `tel:`. Links to `hopetrustindia.com` get `utm_source=newsletter&utm_medium=email&utm_campaign=<issue date>`.
- **Images:** must come from the `newsletter-images` bucket. JPEG or PNG, never WebP; at most 1,200 px wide; up to 5 MB.
- **Colours** (sampled from the PDF): orange `#EE7429`, yellow `#FFDF00`, text `#000000`, white `#FFFFFF`.
- **Typeface:** Montserrat from Google Fonts, with Arial and Helvetica as fallbacks.
- **Date format:** "13th October, 2026".
- **Unsubscribe:** in send mode the button links to `{{{RESEND_UNSUBSCRIBE_URL}}}`; in test and preview mode it links to the website. Every issue has the Unsubscribe button.
- **Share:** `https://wa.me/?text=` followed by "<issue title>, from the Hope Trust newsletter: <blog link>". The default blog link is `https://hopetrustindia.com/blogs/`.
- **Call to action:** "BOOK YOUR SESSION" links to `/book-your-session/`.
- **Footer:**
  - `+91 90008 50001`, Instagram `hopetrust`, `hopetrustindia.com`;
  - grey line: "You're receiving this because you subscribed at hopetrustindia.com."
- **Renderer portability:** no Node-only APIs. Other local files may be imported with `import type` only, never at runtime.
- **New Netlify functions** are TypeScript `.mts` files. Existing `.mjs` functions stay untouched.
- **Commits:** every commit message ends with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

These are the inputs the spec implies but most likely to bite a real user; each has a test in the task that owns the code.

1. **Special characters.** A title or body with quotes, `&`, `<`, emoji, or Hindi or Telugu text must appear exactly as typed and never break the HTML (Task 1 `esc` tests, Task 3 title test).
2. **Long titles.** A title at the 160-character limit must show in full inside the orange banner (Task 3 long-title test; checked by eye in Task 8).
3. **Missing or foreign hero photo.** A draft with no hero photo yet, or one hosted outside the bucket, still renders, with a darker orange behind the banner and no broken image (Task 3 hero tests).
4. **Empty draft.** An empty body with no preview text still renders, and the inbox preview line falls back to the title (Task 3 preheader tests).
5. **Pasted links.** Relative paths (`/blogs/…`) become full `https://hopetrustindia.com/…` links. Dangerous schemes (`javascript:`, `data:`, `//host`) keep their text and lose the link (Task 1 `resolveHref` tests, Task 2 unsafe-link test).

---

## File structure

| File | Status | Responsibility |
|---|---|---|
| `lib/newsletter/content.ts` | Create | Types for an issue and its rich-text body (TipTap JSON, restricted to spec §6.3) |
| `lib/newsletter/render.ts` | Create | Issue → email HTML; text helpers (escaping, dates, links, UTM, image checks); size limits |
| `lib/newsletter/sample-issue.ts` | Create | The design PDF's issue as data, for tests and test sends |
| `tests/vitest/lib/newsletter/render-helpers.test.ts` | Create | Tests for the helpers |
| `tests/vitest/lib/newsletter/render-body.test.ts` | Create | Tests for body rendering |
| `tests/vitest/lib/newsletter/render-issue.test.ts` | Create | Tests for the full email |
| `tests/vitest/lib/newsletter/sample-issue.test.ts` | Create | Size, content and snapshot tests for the sample issue |
| `assets/newsletter/*.png`, `assets/newsletter/sample-hero-2026-10.jpg` | Create | Email images: logo at two sizes, four icons, sample photo |
| `Database/newsletter-storage.sql` | Create | The public `newsletter-images` bucket |
| `scripts/newsletter-upload-assets.mts` | Create | Uploads `assets/newsletter/*` to the bucket's `static/` folder |
| `scripts/newsletter-preview.mts` | Create | Writes the sample email to `.newsletter-preview/`; `--send` emails a test |
| `.gitignore` | Modify | Ignore `.newsletter-preview/` |
| `docs/design/newsletter-template-2026-10.pdf` | Move | The design PDF, moved out of `public/` |
| `docs/superpowers/specs/2026-10-13-newsletter-design.md` | Modify (Task 8) | Record the phase 1 results |

---

### Task 1: Issue types and text helpers

**Files:**
- Create: `lib/newsletter/content.ts`
- Create: `lib/newsletter/render.ts`
- Test: `tests/vitest/lib/newsletter/render-helpers.test.ts`

**Interfaces:**
- **Consumes:** nothing.
- **Produces, in `lib/newsletter/content.ts`:**
  - Types `Mark`, `TextNode`, `HardBreakNode`, `InlineNode`, `ParagraphNode`, `HeadingNode`, `ListItemNode`, `BulletListNode`, `OrderedListNode`, `BlockquoteNode`, `HorizontalRuleNode`, `ImageNode`, `BlockNode`, `BodyDoc`.
  - `IssueForRender` with fields `subject`, `preheader`, `issue_date` (`YYYY-MM-DD`), `title`, `hero_image_url: string | null`, `hero_image_alt`, `body: BodyDoc` and `share_url: string | null`.
- **Produces, in `lib/newsletter/render.ts`:**
  - `COLORS`: `orange`, `yellow`, `text`, `white`, `muted`, `page`, `heroFallback`.
  - `FONT`.
  - `newsletterImagesBase(supabaseUrl: string): string`
  - `esc(value: unknown): string`
  - `formatIssueDate(isoDate: string): string` (throws `RangeError` on bad input)
  - `resolveHref(href: unknown, siteUrl: string): string | null`
  - `withUtm(href: string, campaign: string, siteUrl: string): string`
  - `allowedImageUrl(src: unknown, prefixes: string[]): string | null`
  - The internal helper `dateParts`, which Task 3 uses.

- [ ] **Step 1: Record the test-suite baseline**

Run: `npm run test:run 2>&1 | tail -15`
Expected: Vitest's summary. Note any failures that already exist, so later tasks aren't blamed for them.

- [ ] **Step 2: Write the failing tests**

Create `tests/vitest/lib/newsletter/render-helpers.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  allowedImageUrl,
  esc,
  formatIssueDate,
  newsletterImagesBase,
  resolveHref,
  withUtm,
} from '@/lib/newsletter/render';

const SITE = 'https://hopetrustindia.com';
const IMAGES = 'https://abc.supabase.co/storage/v1/object/public/newsletter-images';

describe('esc', () => {
  it('escapes HTML special characters', () => {
    expect(esc(`<a href="x">Tom & Jerry's</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;',
    );
  });

  it('keeps emoji and Hindi or Telugu text as typed', () => {
    expect(esc('मन शांत है 🌿 మనసు')).toBe('मन शांत है 🌿 మనసు');
  });

  it('treats null and undefined as empty text', () => {
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
  });
});

describe('formatIssueDate', () => {
  it.each([
    ['2026-10-13', '13th October, 2026'],
    ['2026-10-01', '1st October, 2026'],
    ['2026-10-02', '2nd October, 2026'],
    ['2026-10-03', '3rd October, 2026'],
    ['2026-10-11', '11th October, 2026'],
    ['2026-10-12', '12th October, 2026'],
    ['2026-10-22', '22nd October, 2026'],
    ['2026-12-31', '31st December, 2026'],
  ])('%s becomes %s', (input, expected) => {
    expect(formatIssueDate(input)).toBe(expected);
  });

  it('rejects anything that is not a YYYY-MM-DD date', () => {
    expect(() => formatIssueDate('13/10/2026')).toThrow(RangeError);
    expect(() => formatIssueDate('2026-13-01')).toThrow(RangeError);
    expect(() => formatIssueDate('')).toThrow(RangeError);
  });
});

describe('resolveHref', () => {
  it('keeps https, http, mailto and tel links', () => {
    expect(resolveHref('https://en.wikipedia.org/wiki/Rumi', SITE)).toBe('https://en.wikipedia.org/wiki/Rumi');
    expect(resolveHref('http://example.com/', SITE)).toBe('http://example.com/');
    expect(resolveHref('mailto:frontoffice@hopetrustindia.com', SITE)).toBe('mailto:frontoffice@hopetrustindia.com');
    expect(resolveHref('tel:+919000850001', SITE)).toBe('tel:+919000850001');
  });

  it('turns site-relative paths into full links', () => {
    expect(resolveHref('/blogs/x/', SITE)).toBe('https://hopetrustindia.com/blogs/x/');
    expect(resolveHref('/blogs/x/', `${SITE}/`)).toBe('https://hopetrustindia.com/blogs/x/');
  });

  it('drops javascript:, data: and protocol-relative links', () => {
    expect(resolveHref('javascript:alert(1)', SITE)).toBeNull();
    expect(resolveHref('  JAVASCRIPT:alert(1)', SITE)).toBeNull();
    expect(resolveHref('data:text/html,hi', SITE)).toBeNull();
    expect(resolveHref('//evil.example/x', SITE)).toBeNull();
    expect(resolveHref(undefined, SITE)).toBeNull();
  });
});

describe('withUtm', () => {
  it('tags links to the Hope Trust site', () => {
    expect(withUtm('https://hopetrustindia.com/blogs/x/', '2026-10-13', SITE)).toBe(
      'https://hopetrustindia.com/blogs/x/?utm_source=newsletter&utm_medium=email&utm_campaign=2026-10-13',
    );
  });

  it('tags www links and keeps existing query parameters', () => {
    expect(withUtm('https://www.hopetrustindia.com/contact/?a=1', '2026-10-13', SITE)).toBe(
      'https://www.hopetrustindia.com/contact/?a=1&utm_source=newsletter&utm_medium=email&utm_campaign=2026-10-13',
    );
  });

  it('leaves other sites, mailto links and already-tagged links alone', () => {
    expect(withUtm('https://en.wikipedia.org/wiki/Rumi', '2026-10-13', SITE)).toBe('https://en.wikipedia.org/wiki/Rumi');
    expect(withUtm('mailto:frontoffice@hopetrustindia.com', '2026-10-13', SITE)).toBe(
      'mailto:frontoffice@hopetrustindia.com',
    );
    const tagged = 'https://hopetrustindia.com/?utm_source=whatsapp';
    expect(withUtm(tagged, '2026-10-13', SITE)).toBe(tagged);
  });
});

describe('allowedImageUrl', () => {
  const prefixes = [`${IMAGES}/`];

  it('accepts images in the newsletter bucket', () => {
    expect(allowedImageUrl(`${IMAGES}/issues/a.jpg`, prefixes)).toBe(`${IMAGES}/issues/a.jpg`);
  });

  it('rejects other hosts, look-alike buckets, http and path tricks', () => {
    expect(allowedImageUrl('https://evil.example/a.jpg', prefixes)).toBeNull();
    expect(
      allowedImageUrl('https://abc.supabase.co/storage/v1/object/public/newsletter-images-x/a.jpg', prefixes),
    ).toBeNull();
    expect(allowedImageUrl(`${IMAGES}/../other-bucket/a.jpg`, prefixes)).toBeNull();
    expect(allowedImageUrl(`${IMAGES.replace('https:', 'http:')}/a.jpg`, prefixes)).toBeNull();
    expect(allowedImageUrl(null, prefixes)).toBeNull();
    expect(allowedImageUrl('', prefixes)).toBeNull();
  });
});

describe('newsletterImagesBase', () => {
  it('builds the public bucket URL', () => {
    expect(newsletterImagesBase('https://abc.supabase.co/')).toBe(IMAGES);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/vitest/lib/newsletter/render-helpers.test.ts`
Expected: FAIL; Vite can't resolve `@/lib/newsletter/render`.

- [ ] **Step 4: Write the types**

Create `lib/newsletter/content.ts`:

```ts
// Shapes of a newsletter issue and its rich-text body.
//
// The body is TipTap (ProseMirror) JSON, restricted to the content allowed by
// spec §6.3. Field names match the newsletter_issues table.

export type Mark =
  | { type: 'bold' }
  | { type: 'italic' }
  | { type: 'link'; attrs: { href: string } };

export interface TextNode {
  type: 'text';
  text: string;
  marks?: Mark[];
}

export interface HardBreakNode {
  type: 'hardBreak';
}

export type InlineNode = TextNode | HardBreakNode;

export interface ParagraphNode {
  type: 'paragraph';
  content?: InlineNode[];
}

export interface HeadingNode {
  type: 'heading';
  attrs: { level: 2 | 3 };
  content?: InlineNode[];
}

export interface BulletListNode {
  type: 'bulletList';
  content: ListItemNode[];
}

export interface OrderedListNode {
  type: 'orderedList';
  attrs?: { start?: number };
  content: ListItemNode[];
}

export interface ListItemNode {
  type: 'listItem';
  content: Array<ParagraphNode | BulletListNode | OrderedListNode>;
}

export interface BlockquoteNode {
  type: 'blockquote';
  content: ParagraphNode[];
}

export interface HorizontalRuleNode {
  type: 'horizontalRule';
}

export interface ImageNode {
  type: 'image';
  attrs: { src: string; alt?: string | null };
}

export type BlockNode =
  | ParagraphNode
  | HeadingNode
  | BulletListNode
  | OrderedListNode
  | BlockquoteNode
  | HorizontalRuleNode
  | ImageNode;

export interface BodyDoc {
  type: 'doc';
  content: BlockNode[];
}

/** The fields the email is built from. */
export interface IssueForRender {
  subject: string;
  preheader: string;
  /** YYYY-MM-DD */
  issue_date: string;
  title: string;
  hero_image_url: string | null;
  hero_image_alt: string;
  body: BodyDoc;
  /** Blog link the Share button sends; null means https://hopetrustindia.com/blogs/ */
  share_url: string | null;
}
```

- [ ] **Step 5: Write the helpers**

Create `lib/newsletter/render.ts`:

```ts
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
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/vitest/lib/newsletter/render-helpers.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 7: Type-check the new files**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "lib/newsletter" || echo "no type errors in lib/newsletter"`
Expected: `no type errors in lib/newsletter`

- [ ] **Step 8: Commit**

```bash
git add lib/newsletter/content.ts lib/newsletter/render.ts tests/vitest/lib/newsletter/render-helpers.test.ts
git commit -m "feat(newsletter): add issue types and email text helpers" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Render the issue body

**Files:**
- Modify: `lib/newsletter/render.ts`: add a type import at the top, and append body rendering.
- Test: `tests/vitest/lib/newsletter/render-body.test.ts`

**Interfaces:**
- **Consumes:** `esc`, `resolveHref`, `withUtm`, `allowedImageUrl`, `COLORS` and `FONT` (Task 1); the body types (Task 1).
- **Produces:**
  - `interface BodyRenderOptions { siteUrl: string; campaign: string; imagePrefixes: string[] }`
  - `renderBodyHtml(doc: BodyDoc, opts: BodyRenderOptions): string`
  - `bodyPreviewText(doc: BodyDoc | undefined, max?: number): string`

- [ ] **Step 1: Write the failing tests**

Create `tests/vitest/lib/newsletter/render-body.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { bodyPreviewText, renderBodyHtml } from '@/lib/newsletter/render';
import type { BlockNode, BodyDoc } from '@/lib/newsletter/content';

const SITE = 'https://hopetrustindia.com';
const IMAGES = 'https://abc.supabase.co/storage/v1/object/public/newsletter-images';
const opts = { siteUrl: SITE, campaign: '2026-10-13', imagePrefixes: [`${IMAGES}/`] };
const doc = (...content: BlockNode[]): BodyDoc => ({ type: 'doc', content });

describe('renderBodyHtml', () => {
  it('renders a paragraph with bold, italic and a tagged site link', () => {
    const html = renderBodyHtml(
      doc({
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Know ' },
          { type: 'text', text: 'thyself', marks: [{ type: 'bold' }, { type: 'italic' }] },
          { type: 'text', text: ' — read more', marks: [{ type: 'link', attrs: { href: '/blogs/x/' } }] },
        ],
      }),
      opts,
    );
    expect(html).toContain(
      '<p style="margin:0 0 16px 0;">Know <em style="font-style:italic;"><strong style="font-weight:700;">thyself</strong></em>',
    );
    expect(html).toContain(
      '<a href="https://hopetrustindia.com/blogs/x/?utm_source=newsletter&amp;utm_medium=email&amp;utm_campaign=2026-10-13" style="color:#EE7429;text-decoration:underline;"> — read more</a></p>',
    );
  });

  it('escapes text so it can never become HTML', () => {
    const html = renderBodyHtml(
      doc({ type: 'paragraph', content: [{ type: 'text', text: '<script>alert("x")</script>' }] }),
      opts,
    );
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(html).not.toContain('<script');
  });

  it('keeps the text of an unsafe link but drops the link', () => {
    const html = renderBodyHtml(
      doc({
        type: 'paragraph',
        content: [{ type: 'text', text: 'click me', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }],
      }),
      opts,
    );
    expect(html).toContain('click me');
    expect(html).not.toContain('href=');
    expect(html).not.toContain('javascript');
  });

  it('keeps emoji and Hindi text, and turns hard breaks into <br>', () => {
    const html = renderBodyHtml(
      doc({
        type: 'paragraph',
        content: [{ type: 'text', text: 'मन शांत है' }, { type: 'hardBreak' }, { type: 'text', text: '🌿' }],
      }),
      opts,
    );
    expect(html).toContain('मन शांत है<br>🌿');
  });

  it('centres level-2 headings, keeps level-3 headings left, and skips empty headings', () => {
    const html = renderBodyHtml(
      doc(
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'You are a River' }] },
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Humour Helps' }] },
        { type: 'heading', attrs: { level: 2 }, content: [] },
      ),
      opts,
    );
    expect(html).toMatch(/<h2 [^>]*text-align:center;[^>]*>You are a River<\/h2>/);
    expect(html).toMatch(/<h3 [^>]*>Humour Helps<\/h3>/);
    expect(html.match(/<h2 /g)).toHaveLength(1);
  });

  it('renders bulleted and numbered lists, including a nested one', () => {
    const html = renderBodyHtml(
      doc({
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'Pause' }] },
              {
                type: 'orderedList',
                attrs: { start: 3 },
                content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Breathe' }] }] }],
              },
            ],
          },
        ],
      }),
      opts,
    );
    expect(html).toBe(
      '<ul style="margin:0 0 16px 0;padding:0 0 0 24px;"><li style="margin:0 0 8px 0;">Pause' +
        '<ol start="3" style="margin:0 0 16px 0;padding:0 0 0 24px;"><li style="margin:0 0 8px 0;">Breathe</li></ol>' +
        '</li></ul>',
    );
  });

  it('renders a pull-quote as an orange block with white links', () => {
    const html = renderBodyHtml(
      doc({
        type: 'blockquote',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: '“I am large, & I contain multitudes.”' }] },
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Walt Whitman', marks: [{ type: 'link', attrs: { href: 'https://en.wikipedia.org/wiki/Walt_Whitman' } }] },
            ],
          },
        ],
      }),
      opts,
    );
    expect(html).toContain('bgcolor="#EE7429"');
    expect(html).toContain(
      '“I am large, &amp; I contain multitudes.”<br><br><a href="https://en.wikipedia.org/wiki/Walt_Whitman" style="color:#FFFFFF;text-decoration:underline;">Walt Whitman</a>',
    );
  });

  it('renders a divider as an orange rule', () => {
    expect(renderBodyHtml(doc({ type: 'horizontalRule' }), opts)).toContain('border-top:2px solid #EE7429;');
  });

  it('shows bucket images with their alt text and skips images from anywhere else', () => {
    const html = renderBodyHtml(
      doc(
        { type: 'image', attrs: { src: `${IMAGES}/issues/river.jpg`, alt: 'A mountain river' } },
        { type: 'image', attrs: { src: 'https://evil.example/x.jpg', alt: 'nope' } },
      ),
      opts,
    );
    expect(html).toContain(`<img src="${IMAGES}/issues/river.jpg" alt="A mountain river" width="520"`);
    expect(html).not.toContain('evil.example');
  });

  it('skips unknown content, keeps empty paragraphs as spacing, and survives a missing doc', () => {
    const html = renderBodyHtml(
      {
        type: 'doc',
        content: [
          { type: 'codeBlock', content: [{ type: 'text', text: 'rm -rf /' }] } as unknown as BlockNode,
          { type: 'paragraph' },
        ],
      },
      opts,
    );
    expect(html).not.toContain('rm -rf');
    expect(html).toBe('<p style="margin:0 0 16px 0;">&nbsp;</p>');
    expect(renderBodyHtml(undefined as unknown as BodyDoc, opts)).toBe('');
  });
});

describe('bodyPreviewText', () => {
  it('uses the first paragraph that has text, with spaces tidied', () => {
    expect(
      bodyPreviewText(
        doc(
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Heading' }] },
          { type: 'paragraph' },
          { type: 'paragraph', content: [{ type: 'text', text: '  Before you can   love,' }, { type: 'hardBreak' }, { type: 'text', text: 'trust.' }] },
        ),
      ),
    ).toBe('Before you can love, trust.');
  });

  it('shortens long text to 140 characters with an ellipsis', () => {
    const long = 'word '.repeat(60).trim();
    const preview = bodyPreviewText(doc({ type: 'paragraph', content: [{ type: 'text', text: long }] }));
    expect(preview.length).toBeLessThanOrEqual(140);
    expect(preview.endsWith('…')).toBe(true);
  });

  it('returns an empty string when there is no paragraph text', () => {
    expect(bodyPreviewText(doc())).toBe('');
    expect(bodyPreviewText(undefined)).toBe('');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/vitest/lib/newsletter/render-body.test.ts`
Expected: FAIL. `renderBodyHtml` and `bodyPreviewText` aren't exported yet, so calling them throws `is not a function`.

- [ ] **Step 3: Add the type import at the top of `lib/newsletter/render.ts`**

Insert directly below the header comment, before `export const COLORS`:

```ts
import type {
  BlockNode,
  BodyDoc,
  BulletListNode,
  InlineNode,
  ListItemNode,
  Mark,
  OrderedListNode,
} from './content';
```

- [ ] **Step 4: Append the body renderer to `lib/newsletter/render.ts`**

```ts
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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/vitest/lib/newsletter/`
Expected: PASS for both `render-helpers.test.ts` and `render-body.test.ts`.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "lib/newsletter" || echo "no type errors in lib/newsletter"`
Expected: `no type errors in lib/newsletter`

- [ ] **Step 7: Commit**

```bash
git add lib/newsletter/render.ts tests/vitest/lib/newsletter/render-body.test.ts
git commit -m "feat(newsletter): render the issue body as email HTML" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Build the full email from the design

**Files:**
- Modify: `lib/newsletter/render.ts`:
  - add `IssueForRender` to the type import;
  - append the layout code.
- Test: `tests/vitest/lib/newsletter/render-issue.test.ts`

**Interfaces:**
- **Consumes:**
  - `renderBodyHtml` and `bodyPreviewText` (Task 2);
  - `dateParts`, `esc`, `resolveHref`, `withUtm`, `allowedImageUrl`, `COLORS` and `FONT` (Task 1).
- **Produces:**
  - `type RenderMode = 'preview' | 'test' | 'send'`
  - `interface RenderOptions { mode: RenderMode; siteUrl: string; assetBaseUrl: string; imagePrefixes: string[] }`
  - `interface RenderResult { html: string; bytes: number }`
  - `const UNSUBSCRIBE_PLACEHOLDER = '{{{RESEND_UNSUBSCRIBE_URL}}}'`
  - `const SIZE_WARN_BYTES = 81920`
  - `const SIZE_MAX_BYTES = 97280`
  - `renderIssueHtml(issue: IssueForRender, opts: RenderOptions): RenderResult`
- **Asset file names it expects under `assetBaseUrl`:** `logo-v1.png`, `logo-small-v1.png`, `icon-phone-v1.png`, `icon-instagram-v1.png`, `icon-globe-v1.png`, `icon-send-v1.png`. Task 5 creates them.

- [ ] **Step 1: Write the failing tests**

Create `tests/vitest/lib/newsletter/render-issue.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  COLORS,
  UNSUBSCRIBE_PLACEHOLDER,
  esc,
  renderIssueHtml,
  type RenderMode,
} from '@/lib/newsletter/render';
import type { IssueForRender } from '@/lib/newsletter/content';

const SITE = 'https://hopetrustindia.com';
const IMAGES = 'https://abc.supabase.co/storage/v1/object/public/newsletter-images';
const HERO = `${IMAGES}/issues/hero.jpg`;

const issue = (overrides: Partial<IssueForRender> = {}): IssueForRender => ({
  subject: 'Subject line',
  preheader: 'Preview line',
  issue_date: '2026-10-13',
  title: 'The Most Important Connection',
  hero_image_url: HERO,
  hero_image_alt: 'A counsellor and a client talking',
  body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello.' }] }] },
  share_url: null,
  ...overrides,
});

const render = (overrides: Partial<IssueForRender> = {}, mode: RenderMode = 'send') =>
  renderIssueHtml(issue(overrides), {
    mode,
    siteUrl: SITE,
    assetBaseUrl: `${IMAGES}/static`,
    imagePrefixes: [`${IMAGES}/`],
  });

const shareHrefFor = (title: string, link: string) =>
  esc(`https://wa.me/?text=${encodeURIComponent(`${title}, from the Hope Trust newsletter: ${link}`)}`);

describe('renderIssueHtml: unsubscribe', () => {
  it('links the Unsubscribe button to Resend’s placeholder in send mode, exactly once', () => {
    const { html } = render();
    expect(html).toContain(`href="${UNSUBSCRIBE_PLACEHOLDER}"`);
    expect(html.split(UNSUBSCRIBE_PLACEHOLDER)).toHaveLength(2);
  });

  it('links the Unsubscribe button to the website in test and preview mode', () => {
    for (const mode of ['test', 'preview'] as const) {
      const { html } = render({}, mode);
      expect(html).not.toContain(UNSUBSCRIBE_PLACEHOLDER);
      expect(html).toMatch(/<a href="https:\/\/hopetrustindia\.com\/" [^>]*><span[^>]*>Unsubscribe<\/span><\/a>/);
    }
  });
});

describe('renderIssueHtml: header and hero', () => {
  it('shows the date with a raised ordinal, as in the design', () => {
    expect(render().html).toContain(
      '13<sup style="font-size:60%;line-height:0;vertical-align:super;">th</sup> October, 2026',
    );
  });

  it('shows the raw date text instead of failing when the date is malformed', () => {
    expect(render({ issue_date: 'soon' }).html).toContain('>soon</td>');
  });

  it('puts the photo behind the banner, with an Outlook fallback and the alt text for screen readers', () => {
    const { html } = render();
    expect(html).toContain(`background-image:url('${HERO}')`);
    expect(html).toContain(`<v:fill type="frame" src="${HERO}"`);
    expect(html).toContain('role="img" aria-label="A counsellor and a client talking"');
    expect(html).toContain(`src="${IMAGES}/static/logo-v1.png"`);
  });

  it.each([
    ['no photo', null],
    ['a photo from outside the bucket', 'https://evil.example/hero.jpg'],
  ])('falls back to a darker orange behind the banner when there is %s', (_label, url) => {
    const { html } = render({ hero_image_url: url });
    expect(html).not.toContain('background-image');
    expect(html).not.toContain('v:rect');
    expect(html).not.toContain('evil.example');
    expect(html).toContain(`bgcolor="${COLORS.heroFallback}"`);
  });

  it('escapes the title, keeping emoji and Hindi text as typed', () => {
    const title = '"Mind & Body" <Part 2> 🌿 मन';
    const { html } = render({ title });
    expect(html).toContain('&quot;Mind &amp; Body&quot; &lt;Part 2&gt; 🌿 मन');
    expect(html).not.toContain('<Part 2>');
  });

  it('shows a title at the 160-character limit in full', () => {
    const title = 'Connection '.repeat(15).slice(0, 160).trim();
    expect(render({ title }).html).toContain(`>${title}</td>`);
  });

  it('never outputs a script tag, whatever the input', () => {
    const { html } = render({
      title: '<script>alert(1)</script>',
      subject: '<script>alert(2)</script>',
      preheader: '<script>alert(3)</script>',
    });
    expect(html).not.toMatch(/<script/i);
  });
});

describe('renderIssueHtml: inbox preview line', () => {
  it('uses the preview text when one is set', () => {
    expect(render().html).toContain('Preview line&#847;&zwnj;&nbsp;');
  });

  it('falls back to the first paragraph, then to the title', () => {
    expect(render({ preheader: '' }).html).toContain('Hello.&#847;&zwnj;&nbsp;');
    expect(render({ preheader: '', body: { type: 'doc', content: [] } }).html).toContain(
      'The Most Important Connection&#847;&zwnj;&nbsp;',
    );
  });
});

describe('renderIssueHtml: links', () => {
  it('links BOOK YOUR SESSION to the booking page with UTM tags', () => {
    const { html } = render();
    expect(html).toContain(
      'href="https://hopetrustindia.com/book-your-session/?utm_source=newsletter&amp;utm_medium=email&amp;utm_campaign=2026-10-13"',
    );
    expect(html).toContain('>BOOK YOUR SESSION</a>');
  });

  it('links the footer to the phone number, Instagram and the website', () => {
    const { html } = render();
    expect(html).toContain('href="tel:+919000850001"');
    expect(html).toContain('>+91 90008 50001</span>');
    expect(html).toContain('href="https://www.instagram.com/hopetrust/"');
    expect(html).toContain(
      'href="https://hopetrustindia.com/?utm_source=newsletter&amp;utm_medium=email&amp;utm_campaign=2026-10-13"',
    );
    expect(html).toContain('>hopetrustindia.com</span>');
    expect(html).toContain('You&#39;re receiving this because you subscribed at hopetrustindia.com.');
  });

  it('shares the blog home on WhatsApp when no blog link is set', () => {
    expect(render().html).toContain(
      `href="${shareHrefFor('The Most Important Connection', 'https://hopetrustindia.com/blogs/')}"`,
    );
  });

  it('shares the issue’s blog link when one is set, and ignores unusable ones', () => {
    const post = 'https://hopetrustindia.com/blogs/the-most-important-connection-you-can-have-with-yourself/';
    expect(render({ share_url: post }).html).toContain(`href="${shareHrefFor('The Most Important Connection', post)}"`);
    expect(render({ share_url: 'javascript:alert(1)' }).html).toContain(
      `href="${shareHrefFor('The Most Important Connection', 'https://hopetrustindia.com/blogs/')}"`,
    );
  });
});

describe('renderIssueHtml: size', () => {
  it('reports the UTF-8 size of the HTML', () => {
    const { html, bytes } = render({ title: 'मन 🌿' });
    expect(bytes).toBe(new TextEncoder().encode(html).length);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/vitest/lib/newsletter/render-issue.test.ts`
Expected: FAIL; `renderIssueHtml` is not a function.

- [ ] **Step 3: Add `IssueForRender` to the type import in `lib/newsletter/render.ts`**

The import block at the top becomes:

```ts
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
```

- [ ] **Step 4: Append the layout to `lib/newsletter/render.ts`**

```ts
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
  const bg = hero ? COLORS.orange : COLORS.heroFallback;
  const cellStyle = hero
    ? `background-color:${bg};background-image:url('${esc(hero)}');background-position:center center;background-size:cover;background-repeat:no-repeat;`
    : `background-color:${bg};`;
  const vmlOpen = hero
    ? `<!--[if gte mso 9]><v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:600px;"><v:fill type="frame" src="${esc(hero)}" color="${bg}" /><v:textbox style="mso-fit-shape-to-text:true" inset="0,0,0,0"><![endif]-->`
    : '';
  const vmlClose = hero ? '<!--[if gte mso 9]></v:textbox></v:rect><![endif]-->' : '';
  const alt = String(issue.hero_image_alt || '').trim();
  const photoLabel = hero && alt ? `<div role="img" aria-label="${esc(alt)}" style="font-size:0;line-height:0;"></div>` : '';
  return `<tr><td ${hero ? `background="${esc(hero)}" ` : ''}bgcolor="${bg}" valign="top" style="${cellStyle}">
${vmlOpen}<div>${photoLabel}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td align="left" style="padding:16px 16px 0 16px;"><img src="${esc(logoUrl)}" width="96" height="97" alt="Hope Trust" style="display:block;border:0;width:96px;height:auto;"></td></tr>
<tr><td class="hero-spacer" height="150" style="height:150px;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td class="px-hero" style="padding:0 28px 28px 28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="title" bgcolor="${COLORS.orange}" style="background-color:${COLORS.orange};border-radius:28px;padding:18px 24px;text-align:center;font-family:${FONT};font-size:26px;line-height:1.3;font-weight:500;color:${COLORS.white};">${esc(issue.title)}</td></tr></table></td></tr>
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
<table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.white}" style="width:100%;max-width:600px;background-color:${COLORS.white};">
<tr><td class="px" bgcolor="${COLORS.orange}" align="right" style="background-color:${COLORS.orange};padding:12px 24px;font-family:${FONT};font-size:20px;line-height:1.3;font-weight:500;color:${COLORS.white};">${dateHtml(campaign)}</td></tr>
${heroRow(issue, opts, `${assetBase}/logo-v1.png`)}
<tr><td class="px" style="padding:32px 40px 8px 40px;font-family:${FONT};font-size:15px;line-height:1.65;color:${COLORS.text};">
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
</td></tr>
</table>
</body>
</html>`;

  return { html, bytes: new TextEncoder().encode(html).length };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/vitest/lib/newsletter/`
Expected: PASS for all three test files.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "lib/newsletter" || echo "no type errors in lib/newsletter"`
Expected: `no type errors in lib/newsletter`

- [ ] **Step 7: Commit**

```bash
git add lib/newsletter/render.ts tests/vitest/lib/newsletter/render-issue.test.ts
git commit -m "feat(newsletter): build the full email from the design template" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The sample issue from the design PDF

**Files:**
- Create: `lib/newsletter/sample-issue.ts`
- Test: `tests/vitest/lib/newsletter/sample-issue.test.ts`; the snapshot file is created on the first run.

**Interfaces:**
- **Consumes:**
  - the `IssueForRender` and body types (Task 1);
  - `renderIssueHtml`, `SIZE_WARN_BYTES` and `newsletterImagesBase` (Tasks 1 and 3), in the test only.
- **Produces:**
  - `buildSampleIssue(imagesBase: string): IssueForRender`
  - The hero URL is `${imagesBase}/static/sample-hero-2026-10.jpg`. Task 5 uploads that file.

- [ ] **Step 1: Write the failing test**

Create `tests/vitest/lib/newsletter/sample-issue.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { SIZE_WARN_BYTES, newsletterImagesBase, renderIssueHtml } from '@/lib/newsletter/render';
import { buildSampleIssue } from '@/lib/newsletter/sample-issue';

const IMAGES = newsletterImagesBase('https://mjgbotzrjmwggzwkoovi.supabase.co');
const result = renderIssueHtml(buildSampleIssue(IMAGES), {
  mode: 'send',
  siteUrl: 'https://hopetrustindia.com',
  assetBaseUrl: `${IMAGES}/static`,
  imagePrefixes: [`${IMAGES}/`],
});

describe('sample issue (design PDF, October 2026)', () => {
  it('stays under the 80 KB warning size', () => {
    expect(result.bytes).toBeLessThan(SIZE_WARN_BYTES);
  });

  it('has every section heading from the design', () => {
    for (const heading of [
      'You are a River, not a Rock',
      'Listening to Yourself—Without the Static',
      'Face the Inner Shadows',
      'Humour Helps, Seriously',
    ]) {
      expect(result.html).toContain(heading);
    }
  });

  it('turns the PDF’s raw “(https://…)” links into named links', () => {
    expect(result.html).not.toMatch(/\(https?:\/\//);
    for (const name of ['Carl Rogers', 'mindfulness', 'Carl Jung', 'Rumi']) {
      expect(result.html).toContain(`>${name}</a>`);
    }
  });

  it('uses the sample photo from the bucket and the pull-quote from the design', () => {
    expect(result.html).toContain(`${IMAGES}/static/sample-hero-2026-10.jpg`);
    expect(result.html).toContain('“I am large, &amp; I contain multitudes.”');
  });

  it('matches the saved snapshot', () => {
    expect(result.html).toMatchSnapshot();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/vitest/lib/newsletter/sample-issue.test.ts`
Expected: FAIL; Vite can't resolve `@/lib/newsletter/sample-issue`.

- [ ] **Step 3: Write the sample issue**

Create `lib/newsletter/sample-issue.ts`:

```ts
// The design team's October 2026 issue (docs/design/newsletter-template-2026-10.pdf)
// as issue data, with the PDF's raw "(https://…)" links turned back into named
// links. Used by the renderer tests and scripts/newsletter-preview.mts.
// Self-contained on purpose: Node runs it directly, so no runtime imports.

import type { BlockNode, BodyDoc, InlineNode, IssueForRender, Mark } from './content';

const text = (value: string, ...marks: Mark[]): InlineNode =>
  marks.length ? { type: 'text', text: value, marks } : { type: 'text', text: value };
const link = (value: string, href: string): InlineNode => text(value, { type: 'link', attrs: { href } });
const p = (...parts: Array<string | InlineNode>): BlockNode => ({
  type: 'paragraph',
  content: parts.map((part) => (typeof part === 'string' ? text(part) : part)),
});
const h2 = (value: string): BlockNode => ({ type: 'heading', attrs: { level: 2 }, content: [text(value)] });
const h3 = (value: string): BlockNode => ({ type: 'heading', attrs: { level: 3 }, content: [text(value)] });
const quote = (value: string): BlockNode => ({ type: 'blockquote', content: [{ type: 'paragraph', content: [text(value)] }] });
const divider: BlockNode = { type: 'horizontalRule' };

export function buildSampleIssue(imagesBase: string): IssueForRender {
  const body: BodyDoc = {
    type: 'doc',
    content: [
      p('Before you can love, trust, or genuinely know another person, you must first reconcile with yourself. Every relationship in your life, including those with your parents, partner, children, and friends, is built on how you relate to yourself. As Socrates famously remarked, “Know thyself.” Two words that hold a lifetime of work.'),
      p('The Oracle of Delphi’s message was meant as a practical guideline, not a puzzle. It asks: How can you handle life well if you don’t understand your own thoughts, emotions, and desires? If you aren’t clear on who you are, you may chase things—jobs, partners, recognition—thinking they will make you happy. But even when you get them, you may still feel uneasy.'),
      h2('You are a River, not a Rock'),
      p('We often think ‘knowing ourselves’ means having a fixed label for who we are. But we are always changing, like a river that moves and forms new paths over time. What you wanted when you were younger may not be what you want now. What impressed you before may no longer interest you.'),
      p('The poet Walt Whitman stated, “I am large, and I contain multitudes.” What a comfort to be able to change and outgrow past versions of yourself without having to apologise. Growth does not imply betraying who you were; rather, it means honouring who you are becoming.'),
      p('It takes strength to accept change. People often define themselves early in life and hold tight to those ideas. We say, ‘I’m this kind of person,’ as if it’s permanent. But clinging too firmly to a fixed identity can stop personal growth. Being honest with yourself—about what helps, what doesn’t, your fears, and your true wants—is key to wisdom.'),
      p(link('Carl Rogers', 'https://en.wikipedia.org/wiki/Carl_Rogers'), ', a psychologist, stated, “The curious paradox is that when I accept myself just as I am, then I can change.” Acceptance is not apathy; rather, it provides a rich foundation for growth.'),
      h2('Listening to Yourself—Without the Static'),
      p('Getting to know yourself does not require constant reflection or overanalysis. (That way lies madness—and possibly a headache.) It is more about being tuned in. You can’t comprehend what’s truly happening within if you’re always scanning, rushing, or numbing. Silence, alone, and reflection are underappreciated kinds of self-care.'),
      p('Buddhists refer to this as ‘', link('mindfulness', 'https://www.verywellmind.com/mindfulness-the-health-and-stress-relief-benefits-3145189'), '’, or the practice of monitoring one’s thoughts and emotions without judgement. It’s not about repressing them; it’s about recognising them, like clouds flowing across the sky. When you leave a short gap between feeling and reaction, you give yourself the freedom to choose. That’s where maturity exists.'),
      p('The Bhagavad Gita addresses this nicely. Krishna teaches Arjuna that wisdom lies in self-mastery, or in learning to act from awareness rather than impulse. You do not need to become a monk to realise this. You simply need to pause before you lash out, agree to something your intuition says no to, or reach for your third cup of coffee because you’re stressed and exhausted but claiming to be alright.'),
      quote('“I am large, & I contain multitudes.”'),
      p('This self-awareness is not selfish. It’s self-respect. It says, “My inner world matters. I want to understand it so I can live with clarity, not confusion.”'),
      divider,
      h2('Face the Inner Shadows'),
      p('Self-awareness is sometimes uncomfortable. You will notice feelings like envy, defensiveness, or self-sabotage. ', link('Carl Jung', 'https://www.verywellmind.com/carl-jung-biography-archetypes-theories-beliefs-7556254'), ' called this your ‘shadow’—the parts of yourself you try not to see. He warned, “Until you make the unconscious conscious, it will direct your life, and you will call it fate.”'),
      p('That’s why the same conflicts arise in different relationships, or why you keep choosing partners who seem strangely familiar. Until you grasp your internal patterns, they will quietly dominate the show.'),
      p('But when you face these things, something powerful happens. You stop blaming others for every problem. You stop seeing yourself as a victim and begin to take charge of your own growth. In Eastern words, awakening is defined as the simple, radical act of seeing plainly, rather than a halo floating above your head. The Buddha remarked, “Peace comes from within. Do not seek it without.” The barriers to peace aren’t out there; they’re within us – in our attachments, worries, and aversion to change.'),
      p('Yes, things can get messy. Some days, the mirror shows what you’d rather ignore. But seeing your flaws doesn’t mean you are flawed—it means you are human. ', link('Rumi', 'https://en.wikipedia.org/wiki/Rumi'), ' said, “The wound is the place where the Light enters you.”'),
      h3('Humour Helps, Seriously'),
      p('If all of this sounds too serious, humour can help. Self-awareness without humour becomes self-criticism. You must be able to laugh at yourself—gently, not viciously.'),
      p('Over a century later, Oscar Wilde’s counsel remains relevant: “Be yourself; everyone else is already taken.” And comedian Lily Tomlin once observed, “I always wanted to be somebody, but now I realise I should have been more specific.”'),
      p('There’s freedom in ', link('not taking yourself too damn seriously', '/blogs/dont-take-yourself-too-damn-seriously/'), '. Growth doesn’t have to be grim. The more relaxed you are about your self-image, the easier it is to change. A little self-deprecating humour shows you’re comfortable enough to admit your flaws.'),
    ],
  };

  return {
    subject: 'The most important connection you can have',
    preheader: 'Before you can love, trust, or genuinely know another person, you must first reconcile with yourself.',
    issue_date: '2026-10-13',
    title: 'The Most Important Connection You Can Have: With Yourself',
    hero_image_url: `${imagesBase}/static/sample-hero-2026-10.jpg`,
    hero_image_alt: 'A young person talking with a counsellor in a bright living room',
    body,
    share_url: 'https://hopetrustindia.com/blogs/the-most-important-connection-you-can-have-with-yourself/',
  };
}
```

- [ ] **Step 4: Run the test to verify it passes and writes the snapshot**

Run: `npx vitest run tests/vitest/lib/newsletter/sample-issue.test.ts`
Expected: PASS, with "1 snapshot written". Then check the size:

Run: `node -e "const fs=require('fs');const s=fs.readFileSync('tests/vitest/lib/newsletter/__snapshots__/sample-issue.test.ts.snap','utf8');console.log((s.length/1024).toFixed(1)+' KB snapshot')"`
Expected: a size well under 80 KB. That's a rough check of the HTML size; the first test asserts the exact value.

- [ ] **Step 5: Run the whole suite and compare with the baseline from Task 1 Step 1**

Run: `npm run test:run 2>&1 | tail -15`
Expected: the baseline's results, plus the four new newsletter test files passing.

- [ ] **Step 6: Commit**

```bash
git add lib/newsletter/sample-issue.ts tests/vitest/lib/newsletter/sample-issue.test.ts tests/vitest/lib/newsletter/__snapshots__/
git commit -m "feat(newsletter): add the October 2026 sample issue" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Email images, the image bucket and the upload script

**Files:**
- Move: `public/Newsletter_template/newsletter_hopetrust.pdf` to `docs/design/newsletter-template-2026-10.pdf`
- Create:
  - `assets/newsletter/logo-v1.png` (192 px wide)
  - `assets/newsletter/logo-small-v1.png` (88 px wide)
  - `assets/newsletter/icon-phone-v1.png`, `icon-instagram-v1.png`, `icon-globe-v1.png` (white)
  - `assets/newsletter/icon-send-v1.png` (black)
  - `assets/newsletter/sample-hero-2026-10.jpg`
  - `Database/newsletter-storage.sql`
  - `scripts/newsletter-upload-assets.mts`
- One-off and not committed: `<scratchpad>/newsletter-assets/make-assets.mjs`, with `sharp` installed in `<scratchpad>/sharp-tool/`.

**Interfaces:**
- **Consumes:** the asset file names expected by `renderIssueHtml` (Task 3) and the sample hero name (Task 4).
- **Produces:**
  - The public bucket `newsletter-images`, with files at `https://mjgbotzrjmwggzwkoovi.supabase.co/storage/v1/object/public/newsletter-images/static/<file>`.
  - `scripts/newsletter-upload-assets.mts`, run as `node --env-file=.env scripts/newsletter-upload-assets.mts`.

- [ ] **Step 1: Move the design PDF out of `public/`**

```bash
cd "/c/Admirate work/hopetrust_new_2/Hopetrust"
mkdir -p docs/design
mv public/Newsletter_template/newsletter_hopetrust.pdf docs/design/newsletter-template-2026-10.pdf
rmdir public/Newsletter_template
ls docs/design public | head
```

Expected: `docs/design/newsletter-template-2026-10.pdf` exists, and `public/Newsletter_template` is gone.

- [ ] **Step 2: Install `sharp` in its own scratchpad folder**

```bash
SCRATCH="/c/Users/MEGHAS~1/AppData/Local/Temp/claude/c--Admirate-work-hopetrust-new-2/68cb6b5b-7e2f-48c1-a243-898758b6cf85/scratchpad"
mkdir -p "$SCRATCH/sharp-tool" "$SCRATCH/newsletter-assets"
cd "$SCRATCH/sharp-tool" && npm init -y >/dev/null && npm install sharp@0.34.3
```

Expected: `added N packages`, with no errors.

- [ ] **Step 3: Write the asset generator**

Create `<scratchpad>/newsletter-assets/make-assets.mjs`:

```js
// One-off: makes the newsletter email images.
// node make-assets.mjs <sharp-tool dir> <design pdf> <output dir>
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const [toolDir, pdfPath, outDir] = process.argv.slice(2);
const sharp = createRequire(path.join(toolDir, 'index.js'))('sharp');
fs.mkdirSync(outDir, { recursive: true });

// 1. Logo: the site's high-resolution badge (846×855), at twice the size the email shows it.
const logoUrl = 'https://mjgbotzrjmwggzwkoovi.supabase.co/storage/v1/object/public/hopetrust%20assets/logo1.png';
const logo = Buffer.from(await (await fetch(logoUrl)).arrayBuffer());
await sharp(logo).resize({ width: 192 }).png({ compressionLevel: 9 }).toFile(path.join(outDir, 'logo-v1.png'));
await sharp(logo).resize({ width: 88 }).png({ compressionLevel: 9 }).toFile(path.join(outDir, 'logo-small-v1.png'));

// 2. Icons: Lucide shapes (ISC licence). White for the orange footer band, black for the yellow Share button.
const ICONS = {
  phone:
    '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
  instagram:
    '<rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/>',
  globe:
    '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  send:
    '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/>',
};
const svg = (shapes, colour) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="${colour}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${shapes}</svg>`;
for (const [name, colour] of [['phone', '#FFFFFF'], ['instagram', '#FFFFFF'], ['globe', '#FFFFFF'], ['send', '#000000']]) {
  await sharp(Buffer.from(svg(ICONS[name], colour))).png().toFile(path.join(outDir, `icon-${name}-v1.png`));
}

// 3. Sample hero: the design's photo, embedded in the PDF as a 1138×640 JPEG stream.
const pdf = fs.readFileSync(pdfPath);
const source = pdf.toString('latin1');
const objectPattern = /\d+\s+0\s+obj\s*<<([\s\S]*?)>>\s*stream\r?\n/g;
let match;
let jpeg = null;
while ((match = objectPattern.exec(source))) {
  const dict = match[1];
  if (/\/Subtype\s*\/Image/.test(dict) && /DCTDecode/.test(dict) && /\/Width\s+1138\b/.test(dict)) {
    const length = Number(/\/Length\s+(\d+)/.exec(dict)[1]);
    jpeg = pdf.subarray(objectPattern.lastIndex, objectPattern.lastIndex + length);
    break;
  }
}
if (!jpeg) throw new Error('Hero photo not found in the PDF');
await sharp(jpeg).toColorspace('srgb').jpeg({ quality: 82, mozjpeg: true }).toFile(path.join(outDir, 'sample-hero-2026-10.jpg'));

for (const file of fs.readdirSync(outDir)) {
  const meta = await sharp(path.join(outDir, file)).metadata();
  console.log(`${file}: ${meta.width}×${meta.height}, ${fs.statSync(path.join(outDir, file)).size} bytes`);
}
```

- [ ] **Step 4: Generate the images into the repo**

Shell variables don't carry over between commands, so each block sets its own.

```bash
SCRATCH="/c/Users/MEGHAS~1/AppData/Local/Temp/claude/c--Admirate-work-hopetrust-new-2/68cb6b5b-7e2f-48c1-a243-898758b6cf85/scratchpad"
REPO="/c/Admirate work/hopetrust_new_2/Hopetrust"
node "$SCRATCH/newsletter-assets/make-assets.mjs" "$SCRATCH/sharp-tool" "$REPO/docs/design/newsletter-template-2026-10.pdf" "$REPO/assets/newsletter"
```

Expected, seven lines:

- `icon-globe-v1.png`, `icon-instagram-v1.png`, `icon-phone-v1.png` and `icon-send-v1.png`: 48×48 each;
- `logo-small-v1.png`: 88×89;
- `logo-v1.png`: 192×194;
- `sample-hero-2026-10.jpg`: 1138×640, under 150 KB.

- [ ] **Step 5: Look at the logo and the photo**

Open `assets/newsletter/logo-v1.png` and `assets/newsletter/sample-hero-2026-10.jpg` with the Read tool.

Expected:

- The logo is the round Hope Trust badge, sharp, with a transparent outer edge.
- The photo is the one from the design: a young person in a hoodie facing a counsellor. Its colours look normal, not inverted.

- [ ] **Step 6: Write the bucket SQL**

Create `Database/newsletter-storage.sql`:

```sql
-- =============================================================================
-- Newsletter images bucket (spec §10.4)
-- Public, because email clients load the images without logging in.
-- Holds the email's logo and icons (static/) and the photos staff upload for
-- each issue (issues/). There are no anon policies on storage.objects for this
-- bucket: uploads happen only with the service role, or with signed upload
-- URLs that the admin function issues.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('newsletter-images', 'newsletter-images', true, 5242880, array['image/jpeg', 'image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
```

- [ ] **Step 7: Create the bucket. This changes the live Supabase project, so ask the user first.**

Ask: "Create the public `newsletter-images` bucket in the Hopetrust Supabase project now? It's additive and holds only email images."

Once the user agrees, apply `Database/newsletter-storage.sql`. Use the Supabase MCP tool `apply_migration`, with project `mjgbotzrjmwggzwkoovi` and name `newsletter_images_bucket`. The user can instead paste the file into the Supabase SQL editor.

Then check it with `execute_sql`:

```sql
select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'newsletter-images';
```

Expected: one row: `newsletter-images | true | 5242880 | {image/jpeg,image/png}`.

- [ ] **Step 8: Write the upload script**

Create `scripts/newsletter-upload-assets.mts`:

```ts
// Uploads assets/newsletter/* to the newsletter-images bucket under static/.
//
//   node --env-file=.env scripts/newsletter-upload-assets.mts
//
// File names carry a version (logo-v1.png). Change the name when an image
// changes, because email clients and Gmail's image proxy cache aggressively.

import { readdirSync, readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (run with node --env-file=.env).');
  process.exit(1);
}

const TYPES: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
const supabase = createClient(url, serviceKey);
const dir = new URL('../assets/newsletter/', import.meta.url);
let failures = 0;

for (const name of readdirSync(dir).sort()) {
  const contentType = TYPES[extname(name).toLowerCase()];
  if (!contentType) continue;
  const { error } = await supabase.storage
    .from('newsletter-images')
    .upload(`static/${name}`, readFileSync(new URL(name, dir)), {
      contentType,
      cacheControl: '31536000',
      upsert: true,
    });
  if (error) failures += 1;
  console.log(error ? `FAILED static/${name}: ${error.message}` : `uploaded static/${name}`);
}

process.exit(failures ? 1 : 0);
```

- [ ] **Step 9: Upload, then confirm the files are public**

```bash
cd "/c/Admirate work/hopetrust_new_2/Hopetrust"
node --env-file=.env scripts/newsletter-upload-assets.mts
curl -sI "https://mjgbotzrjmwggzwkoovi.supabase.co/storage/v1/object/public/newsletter-images/static/logo-v1.png" | grep -iE "^HTTP|content-type|cache-control"
```

Expected:

- seven `uploaded static/...` lines;
- `HTTP/2 200`;
- `content-type: image/png`;
- `cache-control: max-age=31536000`.

- [ ] **Step 10: Commit**

```bash
git add docs/design/newsletter-template-2026-10.pdf assets/newsletter Database/newsletter-storage.sql scripts/newsletter-upload-assets.mts
git commit -m "feat(newsletter): email logo, icons and image bucket" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Preview and test-send script

**Files:**
- Create: `scripts/newsletter-preview.mts`
- Modify: `.gitignore`, to ignore `/.newsletter-preview/`

**Interfaces:**
- **Consumes:** `renderIssueHtml`, `newsletterImagesBase`, `SIZE_WARN_BYTES` and `SIZE_MAX_BYTES` (Tasks 1 and 3); `buildSampleIssue` (Task 4); the uploaded images (Task 5).
- **Produces:**
  - `node --env-file=.env scripts/newsletter-preview.mts [--send a@b.com …]`, which writes `.newsletter-preview/sample-send.html` and `.newsletter-preview/sample-test.html`.
  - Task 8 uses the script to send test emails.

- [ ] **Step 1: Ignore the preview output**

Append to `.gitignore`:

```
# newsletter previews (scripts/newsletter-preview.mts)
/.newsletter-preview/
```

- [ ] **Step 2: Write the script**

Create `scripts/newsletter-preview.mts`:

```ts
// Renders the sample issue to .newsletter-preview/ and, with --send, emails a test.
//
//   node --env-file=.env scripts/newsletter-preview.mts
//   node --env-file=.env scripts/newsletter-preview.mts --send you@example.com [up to 5 addresses]
//
// It needs NEXT_PUBLIC_SUPABASE_URL for the image URLs. --send also needs
// RESEND_API_KEY. Without NEWSLETTER_FROM_EMAIL it sends from
// onboarding@resend.dev, which Resend delivers only to the Resend account
// owner's own address. Once hopetrustindia.com is verified in Resend, set
// NEWSLETTER_FROM_EMAIL to send to anyone.

import { mkdirSync, writeFileSync } from 'node:fs';
import { SIZE_MAX_BYTES, SIZE_WARN_BYTES, newsletterImagesBase, renderIssueHtml } from '../lib/newsletter/render.ts';
import { buildSampleIssue } from '../lib/newsletter/sample-issue.ts';

const SITE_URL = process.env.NEWSLETTER_SITE_URL || 'https://hopetrustindia.com';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!supabaseUrl) {
  console.error('NEXT_PUBLIC_SUPABASE_URL is not set. Run with: node --env-file=.env scripts/newsletter-preview.mts');
  process.exit(1);
}

const imagesBase = newsletterImagesBase(supabaseUrl);
const issue = buildSampleIssue(imagesBase);
const common = { siteUrl: SITE_URL, assetBaseUrl: `${imagesBase}/static`, imagePrefixes: [`${imagesBase}/`] };
const sendVersion = renderIssueHtml(issue, { ...common, mode: 'send' });
const testVersion = renderIssueHtml(issue, { ...common, mode: 'test' });

mkdirSync('.newsletter-preview', { recursive: true });
writeFileSync('.newsletter-preview/sample-send.html', sendVersion.html);
writeFileSync('.newsletter-preview/sample-test.html', testVersion.html);

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;
console.log(
  `Wrote .newsletter-preview/sample-send.html (${kb(sendVersion.bytes)}) and sample-test.html (${kb(testVersion.bytes)})`,
);
if (sendVersion.bytes > SIZE_MAX_BYTES) console.warn(`Over the ${kb(SIZE_MAX_BYTES)} send limit: Gmail would clip it.`);
else if (sendVersion.bytes > SIZE_WARN_BYTES) console.warn(`Over the ${kb(SIZE_WARN_BYTES)} warning size.`);

const sendFlag = process.argv.indexOf('--send');
if (sendFlag !== -1) {
  const to = process.argv.slice(sendFlag + 1).filter((arg) => arg.includes('@')).slice(0, 5);
  const apiKey = process.env.RESEND_API_KEY;
  if (!to.length) {
    console.error('Give at least one address after --send.');
    process.exit(1);
  }
  if (!apiKey) {
    console.error('RESEND_API_KEY is not set. Add it to .env.');
    process.exit(1);
  }
  const from = process.env.NEWSLETTER_FROM_EMAIL || 'Hope Trust <onboarding@resend.dev>';
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to,
      subject: `[TEST] ${issue.subject}`,
      html: testVersion.html,
      reply_to: 'frontoffice@hopetrustindia.com',
    }),
  });
  const result = await response.json();
  if (!response.ok) {
    console.error('Resend refused the email:', result);
    process.exit(1);
  }
  console.log(`Sent test email ${result.id} from ${from} to ${to.join(', ')}`);
}
```

- [ ] **Step 3: Render the sample**

Run: `node --env-file=.env scripts/newsletter-preview.mts`
Expected: `Wrote .newsletter-preview/sample-send.html (NN.N KB) and sample-test.html (NN.N KB)`, with NN under 80 and no warning line. Node may print an `ExperimentalWarning` about type stripping; that's harmless.

- [ ] **Step 4: Look at it in a browser at desktop and phone widths**

Serve the folder and take screenshots with the Playwright browser tools:

```bash
cd "/c/Admirate work/hopetrust_new_2/Hopetrust/.newsletter-preview" && node -e "require('http').createServer((q,s)=>{const f=require('path').join(process.cwd(),decodeURIComponent(q.url.split('?')[0]));require('fs').readFile(f,(e,d)=>{s.writeHead(e?404:200,{'content-type':'text/html; charset=utf-8'});s.end(e?'not found':d)})}).listen(8765,()=>console.log('http://localhost:8765/sample-test.html'))"
```

Run that in the background. Then:

1. Navigate to `http://localhost:8765/sample-test.html`.
2. Resize to 640×1200 and take a full-page screenshot.
3. Resize to 375×812 and take another.
4. Stop the server afterwards.

Compare both screenshots with the PDF layout (§6.1 of the spec):

- an orange date band showing "13th October, 2026";
- the logo top-left over the photo;
- the orange title banner inside the photo's lower edge;
- left-aligned body text with centred headings;
- the orange pull-quote and the orange divider;
- the yellow BOOK YOUR SESSION button;
- the orange footer band with three white icons;
- Share, the small logo and Unsubscribe;
- the grey line.

At 375 px, the footer items stack, and no part of the layout scrolls sideways.

If anything is off, fix it in `render.ts`. Re-run `npx vitest run tests/vitest/lib/newsletter/ -u` only for intended changes, check the snapshot diff, and re-render.

- [ ] **Step 5: Commit**

```bash
git add .gitignore scripts/newsletter-preview.mts
git commit -m "feat(newsletter): preview and test-send script" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

If Step 4 changed `render.ts` or the snapshot, add them to this commit too.

---

### Task 7: Check that Netlify bundles a TypeScript function importing `lib/newsletter`

This is spec §15's risk check. Nothing from this task is committed.

**Files:**
- Create, then delete: `netlify/functions/zz-newsletter-bundle-check.mts`

**Interfaces:**
- **Consumes:** `renderIssueHtml`, `newsletterImagesBase` and `UNSUBSCRIBE_PLACEHOLDER` (Tasks 1 and 3); `buildSampleIssue` (Task 4).
- **Produces:** a yes/no answer that plans 2 and 3 rely on. Record it in Task 8.

- [ ] **Step 1: Create the temporary function**

Create `netlify/functions/zz-newsletter-bundle-check.mts`:

```ts
// TEMPORARY: checks that Netlify bundles a TypeScript function that imports
// lib/newsletter. Deleted at the end of plan 1, Task 7; never committed.
import { UNSUBSCRIBE_PLACEHOLDER, newsletterImagesBase, renderIssueHtml } from '../../lib/newsletter/render';
import { buildSampleIssue } from '../../lib/newsletter/sample-issue';

export default async () => {
  const imagesBase = newsletterImagesBase('https://example.supabase.co');
  const { html, bytes } = renderIssueHtml(buildSampleIssue(imagesBase), {
    mode: 'send',
    siteUrl: 'https://hopetrustindia.com',
    assetBaseUrl: `${imagesBase}/static`,
    imagePrefixes: [`${imagesBase}/`],
  });
  return Response.json({ bytes, hasUnsubscribe: html.includes(UNSUBSCRIBE_PLACEHOLDER) });
};
```

- [ ] **Step 2: Serve the functions locally and call it**

Start this in the background: `npx netlify functions:serve --offline --port 9999`

Then wait for it and call it:

```bash
for i in $(seq 1 60); do curl -s -o /dev/null -w "%{http_code}" http://localhost:9999/.netlify/functions/zz-newsletter-bundle-check | grep -q 200 && break; sleep 1; done
curl -s http://localhost:9999/.netlify/functions/zz-newsletter-bundle-check
```

Expected: `{"bytes":NNNNN,"hasUnsubscribe":true}`. NNNNN is close to, but not the same as, the send size Task 6 printed, because this function uses a shorter placeholder image host.

- [ ] **Step 3: Build the functions the way a deploy packages them**

```bash
SCRATCH="/c/Users/MEGHAS~1/AppData/Local/Temp/claude/c--Admirate-work-hopetrust-new-2/68cb6b5b-7e2f-48c1-a243-898758b6cf85/scratchpad"
cd "/c/Admirate work/hopetrust_new_2/Hopetrust"
npx netlify functions:build --src netlify/functions --functions "$SCRATCH/fn-build" 2>&1 | tail -5
ls -la "$SCRATCH/fn-build" | grep -i zz-newsletter
```

Expected: the build finishes without errors, and there's a `zz-newsletter-bundle-check` artifact (a zip or folder).

- [ ] **Step 4: Clean up**

Stop the functions server, then:

```bash
rm netlify/functions/zz-newsletter-bundle-check.mts
git status --short netlify/
```

Expected: `git status` shows nothing under `netlify/`.

- [ ] **Step 5: Decide**

- **Both steps passed:** plans 2 and 3 use `.mts` functions that import `lib/newsletter/*.ts`.
- **Either step failed:** record the error message in Task 8. Plans 2 and 3 then use spec §15's fallback: the renderer as `.mjs` with JSDoc types. Don't change the renderer in this plan.

---

### Task 8: Check the email in real inboxes and record the results

This task checks spec §14 phase 1's exit criterion and the "title banner over the photo" risk in §15. It needs the user's help: a Resend API key, and test inboxes on their devices.

**Files:**
- Modify: `docs/superpowers/specs/2026-10-13-newsletter-design.md`, appending §16 "Phase 1 results".
- Modify, only if a check fails: `lib/newsletter/render.ts`, its tests and the snapshot.

**Interfaces:**
- **Consumes:** `scripts/newsletter-preview.mts --send` (Task 6) and the result of Task 7.
- **Produces:** the recorded results that plans 2 and 3 start from.

- [ ] **Step 1: Get what's needed from the user**

Ask for:

1. A Resend API key, added to `.env` as `RESEND_API_KEY=...`. Don't paste it into chat.
2. Whether `hopetrustindia.com` is verified in Resend yet.
   - **If it is:** add `NEWSLETTER_FROM_EMAIL="Hope Trust <newsletter@hopetrustindia.com>"` to `.env`.
   - **If not:** tests can only go to the Resend account owner's address, through `onboarding@resend.dev`.
3. Up to five test addresses, covering as many as possible of: Gmail (web and phone app), Apple Mail (iPhone or Mac), Outlook (web and the Windows app).

- [ ] **Step 2: Send the test**

Run: `node --env-file=.env scripts/newsletter-preview.mts --send <address 1> <address 2> ...`
Expected: `Sent test email <id> from ... to ...`

- [ ] **Step 3: Have the user check each inbox, then record each item as pass or fail per client**

1. The date band, logo and photo appear. The orange title banner sits over the photo's lower edge; classic Outlook may show it slightly differently.
2. Montserrat in Apple Mail; Arial in Gmail and Outlook; never Times New Roman.
3. Headings, the pull-quote, the divider and BOOK YOUR SESSION look like the PDF.
4. Footer: phone, Instagram and website, each with a white icon. Share opens WhatsApp with "The Most Important Connection You Can Have: With Yourself, from the Hope Trust newsletter: <blog link>". Unsubscribe opens the website (expected for a test send).
5. Phone width: nothing scrolls sideways, and the footer items stack.
6. Dark mode: the text is still readable and the logo still visible.
7. Images off (Outlook: don't download pictures): the title still shows on the darker orange background.
8. Gmail doesn't show "[Message clipped]".
9. Gmail's "Show original": note whether SPF, DKIM and DMARC say PASS. They only pass once the domain is verified.

- [ ] **Step 4: If the banner overlap fails in Gmail or Outlook, apply the spec's fallback**

The fallback puts the banner directly under the photo, with no background images and no VML.

Replace `heroRow` in `lib/newsletter/render.ts` with:

```ts
function heroRow(issue: IssueForRender, opts: RenderOptions, logoUrl: string): string {
  const hero = allowedImageUrl(issue.hero_image_url, opts.imagePrefixes);
  const alt = String(issue.hero_image_alt || '').trim();
  const logoRow = `<tr><td align="left" style="padding:16px 16px 12px 16px;"><img src="${esc(logoUrl)}" width="96" height="97" alt="Hope Trust" style="display:block;border:0;width:96px;height:auto;"></td></tr>`;
  const photoRow = hero
    ? `<tr><td style="padding:0;"><img src="${esc(hero)}" width="600" alt="${esc(alt)}" style="display:block;width:100%;max-width:600px;height:auto;border:0;"></td></tr>`
    : '';
  const titleRow = `<tr><td class="px-hero" style="padding:12px 28px 8px 28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="title" bgcolor="${COLORS.orange}" style="background-color:${COLORS.orange};border-radius:28px;padding:18px 24px;text-align:center;font-family:${FONT};font-size:26px;line-height:1.3;font-weight:500;color:${COLORS.white};">${esc(issue.title)}</td></tr></table></td></tr>`;
  return [logoRow, photoRow, titleRow].filter(Boolean).join('\n');
}
```

In `tests/vitest/lib/newsletter/render-issue.test.ts`, replace the two hero tests (the "puts the photo behind the banner…" test and the `it.each` fallback test) with:

```ts
  it('shows the photo above the banner, with its alt text', () => {
    const { html } = render();
    expect(html).toContain(`<img src="${HERO}" width="600" alt="A counsellor and a client talking"`);
    expect(html).not.toContain('background-image');
    expect(html).not.toContain('v:rect');
    expect(html).toContain(`src="${IMAGES}/static/logo-v1.png"`);
  });

  it.each([
    ['no photo', null],
    ['a photo from outside the bucket', 'https://evil.example/hero.jpg'],
  ])('leaves the photo out when there is %s, keeping the banner', (_label, url) => {
    const { html } = render({ hero_image_url: url });
    expect(html).not.toContain('evil.example');
    expect(html).not.toContain(`<img src="${HERO}"`);
    expect(html).toContain('>The Most Important Connection</td>');
  });
```

Then:

1. Run `npx vitest run tests/vitest/lib/newsletter/ -u` and review the snapshot diff. Only the hero area should change.
2. Run `npx vitest run tests/vitest/lib/newsletter/`. Expected: PASS.
3. Re-send the test (Step 2) and re-check items 1 and 7.

In this layout, the photo row is simply missing when there's no photo. `COLORS.heroFallback` stays in `COLORS`; it's unused but harmless.

- [ ] **Step 5: Record the results in the spec**

Append to `docs/superpowers/specs/2026-10-13-newsletter-design.md`:

```markdown
## 16. Phase 1 results

| Check | Result |
|---|---|
| `.mts` function importing `lib/newsletter` (plan 1, Task 7) | <pass, or the error> |
| Gmail web | <items 1–9: pass/fail with a note> |
| Gmail app (Android/iOS) | <…> |
| Apple Mail (iOS/macOS) | <…> |
| Outlook web | <…> |
| Outlook for Windows | <…> |
| Title banner | <overlaps the photo / switched to under-the-photo fallback> |
| Sample issue size | <NN.N KB send version> |
| SPF / DKIM / DMARC | <pass, or "domain not verified yet"> |
```

Fill in each cell with what was actually observed. A client nobody could test gets "not tested".

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/specs/2026-10-13-newsletter-design.md
git commit -m "docs(newsletter): record phase 1 email client checks" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

If Step 4 changed the renderer, commit `lib/newsletter/render.ts`, the hero tests and the snapshot first, with the message `fix(newsletter): put the title banner under the photo`.

---

## After this plan

Write plan 2 (subscribers: SQL, signup and confirmation functions, the confirm page, the signup form in three places, the Subscribers screen with import, export and sync) using the §16 results. Then write plan 3 (issues table, editor, test send, send, clean-up).
