# The Hope Letter (fortnightly blog newsletter) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every other Tuesday at 10:00 India time, the newest unsent blog post goes to subscribers as The Hope Letter, in the client's Cream editorial design, after a preview to staff 48 hours before. Manual issues keep working, in the same design.

**Architecture:**
- **Blog posts:** a build-time JSON index (`lib/newsletter/posts.generated.json`), made by a Node script from `content/blogs/*.mdx`, is bundled into the functions.
- **The Hope Letter template:** the one renderer (`lib/newsletter/render.ts`) is rewritten to the new design and renders both kinds of issue.
- **Automatic sending:** a scheduled Netlify function (`newsletter-auto`, every 15 minutes) calls `runAutomatic(deps)`. That decides from the clock and the database what is due: a preview, a send, a miss or a check. It does each at most once, guarded by database state.
- **Shared send:** the admin send and the automatic send share one send core, extracted from `newsletter-issues.mts`.

**Tech Stack:** Next.js 15 (static export), React 18.2, TypeScript 5.2, Netlify Functions (`.mts`, including scheduled functions), Supabase, the Resend REST API, zod 3, Vitest 4 with Testing Library, Playwright, Node 24 (built-in TypeScript support, used by the scripts).

**Spec:** `docs/superpowers/specs/2026-10-17-newsletter-fortnightly-blog-design.md` (the "spec"). It builds on `docs/superpowers/specs/2026-10-13-newsletter-design.md` (the "base spec").

## Global Constraints

- **Branch and commits:**
  - Work on `feat-newsletter`, in place.
  - Every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Everything in plan 3's Global Constraints still applies:**
  - the sender, the issue field limits and HTML size limits;
  - the image rules;
  - links in the email are always `https://hopetrustindia.com`;
  - send steps 1–7, the test-send rules and the audit log;
  - `.mts` import extensions;
  - type-only imports in `render.ts`;
  - no spread or `for…of` over a `Set` or `Map` in `lib/`, `components/` and `app/`;
  - the verification bar (vitest: only the 7 known failures; `tsc` 0 errors);
  - the user pastes all SQL.

  Plan 3 is `docs/superpowers/plans/2026-10-14-newsletter-phase-3-issues.md`, lines 17–64.
- **Times.** India time is UTC+05:30 (Asia/Kolkata, no daylight saving).
  - The send is at 10:00 India time, which is `04:30Z`.
  - The preview is 48 hours before the send.
  - Every 14 days counts from `first_send_date`, which must be a Tuesday.
  - Store times in UTC. Show and compare dates as India dates.
- **The 14-day gap:** a newsletter may go out only if the India date is at least 14 days after the India date of the last sent newsletter. Tests and previews don't count.
- **Late sends:** a scheduled issue may still be sent up to 3 hours after its time. After that it becomes `missed`.
- **No preview, no send:** a scheduled issue is sent only if its preview email went out (`preview_sent_at` is set).
- **The post rule:**
  - Take the newest post by `date` that has a usable email photo, isn't on any sent issue, and whose photo isn't any of the last 6 sent issues' hero photos.
  - Usable photos:
    - Unsplash, rewritten to `w=1200&h=750&fit=crop&fm=jpg&q=80`;
    - site paths ending `.jpg`, `.jpeg` or `.png`, as `https://hopetrustindia.com` + path.
  - `.webp` and missing images aren't usable.
- **Defaults:**
  - kicker `A moment for yourself` when the first category is `Blog` or missing;
  - preview recipients `essentials@admirate.in`;
  - automatic sending off;
  - the book panel off.
- **The book panel's sample** (the client's text, from the design):
  - eyebrow `From Rahul Luther`;
  - title `I, Bhogi`;
  - text `A memoir of addiction, recovery and a life of purpose.`;
  - link text `Discover the book →`.
- **Design source:** variant `"1"` of the `design-data` JSON in `docs/design/newsletter-2026-10-17-hope-letter.html`:
  - `"0"` is without the book panel, `"1"` is with it;
  - copy, colours, type, spacing and the mobile media queries come from there;
  - its `data:` images are replaced by hosted ones (Gmail blocks `data:` images).
- **`netlify dev` clock override:** the runner may honour `NEWSLETTER_AUTO_NOW` (an ISO time) only when `process.env.NETLIFY_DEV === 'true'`. Never in production.

## Review Focus

These are the failure modes most likely to bite a real person. Each one has a test in the task that owns it.

1. **Two overlapping or retried runs** never send two previews or two broadcasts. One blog row per send time (a unique index), the preview claim, and the scheduled→sending lock all guard this (Tasks 1 and 7).
2. **A run that misses the window** (an outage or a deploy) never sends late beyond 3 hours, and never sends an issue whose preview didn't go out. It's marked `missed`, and staff are told (Task 7).
3. **Switched off after the preview:** nothing goes out. The scheduled issue becomes a draft (Task 7).
4. **A manual send shortly before or after an automatic one:** the 14-day gap blocks the manual send, with the next allowed date. An automatic send day inside the gap is skipped, with a note (Tasks 3, 6 and 7).
5. **Dates at India midnight:** a send at 04:30Z and a gap measured across the UTC/India date line use India dates (Task 3).

---

## File Structure

**Create**

| File | Responsibility |
|---|---|
| `lib/newsletter/posts.ts` | Blog post → newsletter post: email photo URL, intro, kicker, reading minutes; and the post rule |
| `scripts/newsletter-posts.mts` | Writes `lib/newsletter/posts.generated.json` from `lib/blog.ts` (run by `npm run build`) |
| `lib/newsletter/posts.generated.json` | The index (committed; the build regenerates it) |
| `lib/newsletter/schedule.ts` | Send and preview times, the due slot, the 14-day gap |
| `lib/newsletter/settings.ts` | The settings shape and its zod schema |
| `lib/newsletter/auto-emails.ts` | The preview note and the staff notes (subjects and HTML) |
| `netlify/functions/_shared/newsletter-send.mts` | The send core, shared by the admin send and the automatic send |
| `netlify/functions/_shared/newsletter-auto.mts` | `runAutomatic(deps)` |
| `netlify/functions/newsletter-auto.mts` | The scheduled function (every 15 minutes) |
| `components/admin/newsletter/AutomaticScreen.tsx` | Settings, the next preview and send, the post next in line |
| `components/admin/newsletter/PostPicker.tsx` | The Swap post dialog: search posts by title; sent posts are marked |

**Modify**

| File | Change |
|---|---|
| `Database/newsletter.sql` | Section 7: the new issue columns and statuses, the indexes, and `newsletter_settings` |
| `lib/newsletter/content.ts`, `lib/newsletter/issue.ts` | New fields, statuses and send checks |
| `lib/newsletter/render.ts` | The Cream editorial template |
| `netlify/functions/_shared/newsletter-issues-db.mts`, `newsletter-deps.mts`, `newsletter-issues.mts` | Data access, deps, admin actions and the gap |
| `tests/vitest/functions/newsletter/fakes.ts` | The fakes, to match |
| `scripts/newsletter-upload-assets.mts` | Uploads the round logo |
| `lib/newsletter-admin.ts` | Client calls for settings, posts, swap and skip |
| `components/admin/newsletter/IssueEditor.tsx`, `IssuesScreen.tsx`, `NewsletterTab.tsx`, `IssueSendDialogs.tsx`, `issue-status.ts` | UI |
| `package.json`, `netlify.toml` | Build step; the function needs no redirect |
| `content/blogs/*.mdx` (titles), plus the spec §8 wording files | Content fixes |

---

### Task 1: Data — SQL section 7, types, data access

**Files:**
- Modify: `Database/newsletter.sql` (append section 7)
- Modify: `lib/newsletter/content.ts` (`IssueForRender`)
- Modify: `lib/newsletter/issue.ts` (`IssueStatus`, `IssueRow`, `IssueSummary`, `issueDraftSchema`, `toDraft`)
- Modify: `netlify/functions/_shared/newsletter-issues-db.mts`
- Modify: `tests/vitest/functions/newsletter/fakes.ts`
- Test: `tests/vitest/functions/newsletter/issues-db.test.ts`, `tests/vitest/lib/newsletter/issue.test.ts`

**Interfaces:**
- **Produces, statuses and fields:**
  - `IssueStatus` gains `'scheduled' | 'skipped' | 'missed'`.
  - `IssueForRender` gains:
    - `kind: 'manual' | 'blog'`;
    - `kicker: string`, `intro: string`, `question: string`;
    - `reading_minutes: number | null`;
    - `issue_number: number | null`;
    - `post_slug: string | null`.
  - `IssueRow` gains `scheduled_for: string | null`, `preview_sent_at: string | null` and `reason: string | null`.
  - `IssueSummary` adds `kind`, `scheduled_for` and `reason`.
  - `issueDraftSchema` adds `kicker` (≤60), `intro` (≤600) and `question` (≤200). Each is trimmed text, default `''`.
- **Produces, `IssuesDb` additions:**

  ```ts
  createBlog(fields: BlogSlotFields): Promise<IssueRow | null>; // null when the slot exists (unique violation 23505)
  blogSlot(scheduledFor: string): Promise<IssueRow | null>;
  claimPreview(id: string, at: string): Promise<boolean>;        // preview_sent_at null → at
  releasePreview(id: string): Promise<void>;                     // → null (the email failed)
  lockForSend(id: string, actor: string, issueNumber: number, from: 'draft' | 'scheduled'): Promise<IssueRow | null>;
  setOutcome(id: string, from: IssueStatus[], to: 'skipped' | 'missed' | 'draft', reason: string): Promise<IssueRow | null>;
  overdueScheduled(before: string): Promise<IssueRow[]>;         // kind blog, status scheduled, scheduled_for < before
  blogNeedsCheck(): Promise<IssueRow[]>;
  lastSentAt(): Promise<string | null>;
  sentPostSlugs(): Promise<string[]>;
  recentHeroImages(n: number): Promise<string[]>;                // last n sent issues, newest first
  nextIssueNumber(): Promise<number>;                            // max(issue_number) + 1, or 1
  ```

  `BlogSlotFields` is `IssueDraft & { kind: 'blog'; post_slug: string | null; reading_minutes: number | null; scheduled_for: string; status: 'scheduled' | 'skipped'; reason: string | null }`, with `created_by: 'automatic'`.

  - `saveDraft`'s guard becomes `status in ('draft','scheduled')`.
  - `backToDraft(id, error, to: 'draft' | 'scheduled' = 'draft')` moves sending or needs_check → `to`, and clears `issue_number`.
  - `SUMMARY_COLUMNS` adds `kind, scheduled_for, reason`.

- [ ] **Step 1: Append section 7 to `Database/newsletter.sql`.** Style it like section 6: `if not exists` throughout, so it can be run again. Contents:
  - **On `newsletter_issues`, add the columns:**
    - `kind text not null default 'manual' check (kind in ('manual','blog'))`;
    - `post_slug text` (≤200);
    - `kicker text not null default ''` (≤60);
    - `intro text not null default ''` (≤600);
    - `question text not null default ''` (≤200);
    - `reading_minutes int` (1–120);
    - `issue_number int`;
    - `scheduled_for timestamptz`;
    - `preview_sent_at timestamptz`;
    - `reason text` (≤500).
  - **Replace the status check** `newsletter_issues_status_check`, adding `scheduled`, `skipped` and `missed`.
  - **Unique indexes:**
    - `newsletter_issues_blog_slot_idx` on `(scheduled_for)` where `kind = 'blog'`;
    - `newsletter_issues_number_idx` on `(issue_number)` where `issue_number is not null`.
  - **`newsletter_settings` table:** one row, `id boolean primary key default true check (id)`. Columns:
    - `auto_enabled boolean not null default false`;
    - `first_send_date date`, checked with `extract(isodow from first_send_date) = 2`;
    - `preview_recipients text[] not null default array['essentials@admirate.in']`;
    - `panel_enabled boolean not null default false`;
    - `panel_eyebrow`, `panel_title` (≤80), `panel_text` (≤200), `panel_link_text` (≤40) and `panel_url` (≤1000);
    - `updated_by text`, `updated_at`, with the `set_updated_at` trigger.

    Insert the row with `on conflict do nothing`. Enable RLS, and revoke all from `anon, authenticated`.
- [ ] **Step 2: Write the failing tests:**
  - `issue.test.ts`:
    - `issueDraftSchema` keeps `kicker`, `intro` and `question` trimmed, and rejects a 61-character kicker with "The kicker…";
    - `toDraft` includes the three fields.
  - `issues-db.test.ts`, against the fake, in the style of the existing tests:
    - `createBlog` returns null for a second row with the same `scheduled_for`;
    - `claimPreview` is true once, then false;
    - `lockForSend(..., 'scheduled')` moves only a scheduled row and stores `issue_number`;
    - `backToDraft` clears `issue_number`;
    - `recentHeroImages(6)` returns sent issues only, newest first.
- [ ] **Step 3: Run** `npx vitest run tests/vitest/lib/newsletter/issue.test.ts tests/vitest/functions/newsletter/issues-db.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement:**
  - the types and the schema;
  - the Supabase `IssuesDb` methods, as guarded updates like the existing ones, and the fake's versions;
  - in `create()` for manual issues, the new columns take their SQL defaults (`kind 'manual'`);
  - to keep the build green, `send()` in `newsletter-issues.mts` now calls `lockForSend(id, admin.email, await deps.issues.nextIssueNumber(), 'draft')`.
- [ ] **Step 5: Run** the two files, then the whole of `tests/vitest/functions/newsletter/`. Expected: PASS.
- [ ] **Step 6: Commit** `feat(newsletter): issue kinds, schedule columns and settings table (SQL section 7)`.

Task 9 sends section 7 to the user to paste. Nothing before Task 9 needs it live.

---

### Task 2: Blog posts — the newsletter index and the post rule

**Files:**
- Create: `lib/newsletter/posts.ts`, `scripts/newsletter-posts.mts`, `lib/newsletter/posts.generated.json`
- Modify: `package.json` (`build`, and a new `newsletter:posts` script)
- Test: `tests/vitest/lib/newsletter/posts.test.ts`

**Interfaces:**
- Consumes: `BlogPost` from `lib/blog.ts` (type-only import, because `posts.ts` must run under Node alone, like `render.ts`).
- Produces:

  ```ts
  export interface NewsletterPost { slug: string; title: string; date: string; excerpt: string; intro: string; kicker: string; image: string | null; readingMinutes: number; url: string }
  export const DEFAULT_KICKER = 'A moment for yourself';
  export function emailImageUrl(featuredImage: string | undefined | null): string | null;
  export function firstParagraph(markdown: string): string;          // '' when none qualifies
  export function introFor(post: Pick<BlogPost, 'content' | 'summary' | 'excerpt'>): string;
  export function kickerFor(categories: string[]): string;
  export function toNewsletterPost(post: BlogPost): NewsletterPost;   // url = https://hopetrustindia.com/blogs/<slug>/
  export function chooseNextPost(posts: NewsletterPost[], sentSlugs: string[], recentImages: string[]): NewsletterPost | null;
  ```

- [ ] **Step 1: Write the failing tests** in `posts.test.ts`:
  - **`emailImageUrl`:**
    - `'https://images.unsplash.com/photo-1?w=800&h=500&fit=crop&auto=format'` → `'https://images.unsplash.com/photo-1?w=1200&h=750&fit=crop&fm=jpg&q=80'`;
    - `'/images/blog/a.jpg'` → `'https://hopetrustindia.com/images/blog/a.jpg'`;
    - `'/images/blog/a.webp'` → `null`;
    - `''` → `null`.
  - **`firstParagraph`** skips a heading, a list, an image, a `>` quote and a paragraph that opens with `“` or `"`. It skips a paragraph under 120 characters. It turns `[Carl Rogers](https://x)` into `Carl Rogers`, and removes ` (https://x.example/y)`. It cuts at the last sentence end at or before 320 characters. A paragraph of 400 characters with sentence ends at 150 and 300 gives 300.
  - **`introFor`:** the first paragraph when one qualifies; else the summary; else the excerpt.
  - **`kickerFor`:** `['Blog']` → `DEFAULT_KICKER`; `['Addiction','Blog']` → `'Addiction'`; `[]` → `DEFAULT_KICKER`.
  - **`chooseNextPost`:**
    - picks the newest by `date`;
    - skips a slug in `sentSlugs`;
    - skips `image: null`;
    - skips a post whose image is in `recentImages`, and returns the next one;
    - returns `null` when none is left.
- [ ] **Step 2: Run** `npx vitest run tests/vitest/lib/newsletter/posts.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `posts.ts`.**
  - No runtime imports.
  - Parse `readingMinutes` from `BlogPost.readingTime`. For example `"9 min read"` → 9; at least 1.
  - The Unsplash rewrite keeps the path and replaces the whole query.
- [ ] **Step 4: Write `scripts/newsletter-posts.mts`.**
  - It imports `../lib/blog.ts` and `../lib/newsletter/posts.ts` with extensions, and writes the sorted `NewsletterPost[]` (newest first) as JSON with 2-space indent.
  - Add `"newsletter:posts": "node scripts/newsletter-posts.mts"`.
  - Prefix `build` with `node scripts/newsletter-posts.mts && `.
  - Run it, and commit the generated file.
  - The build regenerates it on Netlify, so new posts join on deploy.
- [ ] **Step 5: Run** the test again, then `npm run newsletter:posts`.
  - Expected: PASS.
  - The JSON has 389 entries, and `image` is non-null for 236 of them (`node -e` count).
- [ ] **Step 6: Commit** `feat(newsletter): blog post index for the newsletter, and the post rule`.

---

### Task 3: Schedule and the 14-day gap

**Files:**
- Create: `lib/newsletter/schedule.ts`
- Test: `tests/vitest/lib/newsletter/schedule.test.ts`

**Interfaces:**
- Consumes: `todayInIndia(now)` from `issue.ts`.
- Produces:

  ```ts
  export const PREVIEW_LEAD_MS = 48 * 3600_000;
  export const LATE_LIMIT_MS = 3 * 3600_000;
  export const MIN_GAP_DAYS = 14;
  export function sendTimeOn(indiaDate: string): Date;                       // 10:00 India → `${date}T04:30:00.000Z`
  export function dueSlot(firstSendDate: string, now: Date): Date | null;    // the send time S with S-48h <= now < S+3h
  export function nextSlot(firstSendDate: string, now: Date): Date;          // the first send time >= now (for the screens)
  export function addDays(indiaDate: string, days: number): string;
  export function nextAllowedDate(lastSentAt: string | null): string | null; // India date of lastSentAt + 14
  export function gapAllows(lastSentAt: string | null, at: Date): boolean;   // todayInIndia(at) >= nextAllowedDate
  export function formatSlot(at: Date): string;                              // "Tue 21 Oct"
  ```

- [ ] **Step 1: Write the failing tests:**
  - `sendTimeOn('2026-10-20')` is `2026-10-20T04:30:00.000Z`.
  - With first `2026-10-20`:
    - `dueSlot` at `2026-10-18T04:29Z` is `null`;
    - at `2026-10-18T04:30Z` it's `2026-10-20T04:30Z`;
    - at `2026-10-20T07:29Z` it's still that slot;
    - at `2026-10-20T07:30Z` it's `null`;
    - at `2026-11-01T04:30Z` it's `2026-11-03T04:30Z`;
    - before the first date's preview window it's `null`.
  - `nextSlot` crosses a year end: `2026-12-29` → `2027-01-12`.
  - **`gapAllows`:**
    - last sent `2026-10-20T04:35Z`: true on `2026-11-03T04:30Z`, false on `2026-11-02T18:29Z`;
    - last sent `2026-10-19T19:00Z` (India date 20 Oct) and at `2026-11-02T19:00Z` (India date 3 Nov): true;
    - `null` is always true.
  - `formatSlot(new Date('2026-10-20T04:30Z'))` is `'Tue 20 Oct'`.
- [ ] **Step 2: Run** `npx vitest run tests/vitest/lib/newsletter/schedule.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Do date arithmetic on India dates as UTC-midnight dates. Don't use `toLocaleString` with time zones, which varies in Node builds.
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `feat(newsletter): fortnightly schedule and the 14-day gap`.

---

### Task 4: The Hope Letter template (Cream editorial)

**Files:**
- Modify: `lib/newsletter/render.ts`, `lib/newsletter/issue.ts` (`issueRenderOptions`, `sendProblems`)
- Modify: `scripts/newsletter-upload-assets.mts` (adds `logo-round-v1.png`)
- Test: `tests/vitest/lib/newsletter/render-issue.test.ts` (and its snapshots), `render-helpers.test.ts`, `issue.test.ts`

**Interfaces:**
- Consumes: the Task 1 fields.
- Produces:

  ```ts
  export interface BookPanel { eyebrow: string; title: string; text: string; linkText: string; url: string }
  // RenderOptions gains:
  panel: BookPanel | null;
  /** Shown when the issue has no number yet (preview, test, preview email). */
  nextIssueNumber: number | null;
  export function splitTitle(title: string): { lead: string; emphasis: string | null }; // at the first ': '
  export function readingMinutesOf(doc: BodyDoc): number;                              // ceil(words / 200), min 1
  export function shareLinks(title: string, url: string): { email: string; whatsapp: string; facebook: string; linkedin: string };
  export function issueRenderOptions(imagesBase: string, mode: RenderMode, extra?: { panel?: BookPanel | null; nextIssueNumber?: number | null }): RenderOptions;
  ```

  `issueRenderOptions`'s `imagePrefixes` become the bucket, `https://images.unsplash.com/` and `https://hopetrustindia.com/`.

- [ ] **Step 1: Write the failing tests** in `render-issue.test.ts`. Replace the PDF-design expectations, and keep the mode, size and escaping tests:
  - **A blog issue, rendered:**
    - It contains, in this order: `The Hope Letter`, `Issue 07` (the `issue_number`), the kicker, the title lead, `<em`, the emphasis, `By Hope Trust`, `9 min read`, the hero `<img` with the post-title alt, the intro, `Read the article`, `Share a little hope.`, `Book session`, `Stay connected with Hope Trust` (case-insensitive), `frontoffice@hopetrustindia.com` and `Privacy policy`.
    - It has no question box when `question` is `''`.
    - It has one when set, labelled `A question to take with you`.
  - **Links:** `Read the article` links to the post URL with `utm_source=newsletter`. The four share links contain the encoded post URL (`wa.me`, `facebook.com/sharer/sharer.php?u=`, `linkedin.com/sharing/share-offsite/?url=`, `mailto:?subject=`).
  - **Manual issue:** the body HTML in place of the intro. `Read the article` appears only with `share_url`.
  - **Unsubscribe and size:**
    - send mode contains `UNSUBSCRIBE_PLACEHOLDER`, and test mode links Unsubscribe to the site;
    - a long body still reports `bytes`.
  - **Issue number:** `nextIssueNumber: 3` and `issue_number: null` → `Issue 03`. Both null → no "Issue" label.
  - **Book panel:** shown only when `opts.panel` is set, with its five fields.
  - **Helpers:**
    - `splitTitle('The Most Important Connection You Can Have: With Yourself')` → lead `…Have:`, emphasis `With Yourself`;
    - `splitTitle('No colon')` → emphasis null;
    - `readingMinutesOf` of a 450-word body is 3.
  - **`sendProblems`** for a blog issue with an empty intro includes "Add an intro.". A hero on `images.unsplash.com` passes.
- [ ] **Step 2: Run** `npx vitest run tests/vitest/lib/newsletter/`. Expected: FAIL.
- [ ] **Step 3: Rewrite `renderIssueHtml`** from the design source (Global Constraints):
  - **Keep:** the preheader, the MSO head, `color-scheme: light`, `UNSUBSCRIBE_PLACEHOLDER`, `withUtm` on every site link (`utm_campaign` = `issue_date`), `esc` everywhere and `allowedImageUrl` for photos.
  - **Logo:** extract the round logo from the design's base64 into the upload script's local folder as `logo-round-v1.png`, opaque background. The template uses `${assetBaseUrl}/logo-round-v1.png`.
  - **The body:** style `renderBodyHtml`'s headings, links and pull-quotes to the design: Georgia headings; pull-quote as the question box.
  - **Leftover exports:** remove `COLORS` and `FONT` values the new design no longer needs, unless `confirm-email.ts` imports them (check with grep).
- [ ] **Step 4: Run** `npx vitest run tests/vitest/lib/newsletter/`. Expected: PASS.
  - Update `__snapshots__` deliberately (`-u`), then read the new snapshot once.
- [ ] **Step 5: Look at it.** Run `node scripts/newsletter-preview.mts`, which writes `.newsletter-preview/`. Open the HTML at 680 px and at 375 px, and compare with `docs/design/newsletter-2026-10-17-hope-letter.html` variant `"1"`. Fix visible differences.
- [ ] **Step 6: Run** `npx tsc --noEmit -p tsconfig.json`. Expected: 0 errors.
- [ ] **Step 7: Commit** `feat(newsletter): The Hope Letter template (client's Cream editorial design)`.

---

### Task 5: Content fixes — broken titles and "fortnightly"

**Files:**
- Modify: the `.mdx` posts whose `title` is broken (spec §8.1), then regenerate `lib/newsletter/posts.generated.json`
- Modify: the spec §8 wording files (`components/BlogListClient.tsx:228`, `components/LargeRectangleSection.tsx:105`, `components/NewsletterDialogButton.tsx:97`, `components/NewsletterConfirm.tsx:73`, `app/privacy-policy/page.tsx:129`, `lib/newsletter/subscriber.ts:52`, and `lib/newsletter/confirm-email.ts` if it says monthly)
- Test: `tests/vitest/lib/newsletter/posts.test.ts` (title check)

- [ ] **Step 1: Write the failing test.** `every post title is clean`: no title in `posts.generated.json` matches `/[a-z][A-Z][a-z]/` (outside a short allow-list of real names, for example `McDonald`), or `/:\S/`, or `/\s{2,}/`.
- [ ] **Step 2: Run it.** Expected: FAIL, listing the titles.
- [ ] **Step 3: Fix each listed title in its `.mdx`.**
  - Where a subtitle was joined on, use `: `. For example: `When Your Heart Stirs for Another: Navigating the Uncharted Waters of Married Attraction`.
  - Read the first 26 queue titles (`chooseNextPost` applied repeatedly) for anything the pattern misses, such as `UsA`.
  - Change titles only, never slugs.
- [ ] **Step 4: Change the wording** "monthly"/"once a month" → "fortnightly"/"once a fortnight" in the spec §8 files.
  - Then fix any test that asserts the old wording. Grep `tests/` for `month`.
- [ ] **Step 5: Run** `npm run newsletter:posts`, the test file, and the vitest files touching the changed components. Expected: PASS.
- [ ] **Step 6: Commit** `fix(content): broken blog titles; the newsletter is fortnightly`.

---

### Task 6: Admin API — settings, posts, swap, skip, the gap, the shared send

**Files:**
- Create: `lib/newsletter/settings.ts`, `netlify/functions/_shared/newsletter-send.mts`
- Modify: `netlify/functions/_shared/newsletter-issues.mts`, `newsletter-deps.mts`, `newsletter-issues-db.mts` (settings access), `tests/vitest/functions/newsletter/fakes.ts`, `lib/newsletter-admin.ts`
- Test: `tests/vitest/functions/newsletter/issues.test.ts`, new `tests/vitest/functions/newsletter/send-core.test.ts`

**Interfaces:**
- **Consumes:** Tasks 1–4.
- **Produces, settings:**

  ```ts
  // lib/newsletter/settings.ts
  export interface NewsletterSettings { auto_enabled: boolean; first_send_date: string | null; preview_recipients: string[]; panel_enabled: boolean; panel_eyebrow: string; panel_title: string; panel_text: string; panel_link_text: string; panel_url: string }
  export const settingsSchema: z.ZodType<NewsletterSettings>; // first_send_date a Tuesday; 1–5 valid recipients; panel fields required when panel_enabled; panel_url https:// or a site path
  export function bookPanel(s: NewsletterSettings): BookPanel | null;
  // lib/newsletter/issue.ts: the one place a post fills an issue (used by swap here and by Task 7)
  export function blogIssueFields(post: NewsletterPost, sendIndiaDate: string): IssueDraft & { post_slug: string; reading_minutes: number };
  //  subject = title, preheader = excerpt, issue_date = sendIndiaDate, kicker, title, intro, question '',
  //  hero_image_url = image, hero_image_alt = title, body = EMPTY_BODY, share_url = url
  export function postSlugFromLink(shareUrl: string | null): string | null; // https://hopetrustindia.com/blogs/<slug>/ or /blogs/<slug>/ → slug
  ```

- **Produces, the send core:**

  ```ts
  // newsletter-send.mts
  export type SendOutcome =
    | { kind: 'sent'; issue: IssueRow; warning?: string }
    | { kind: 'blocked'; status: number; error: string; problems?: string[]; issue: IssueRow | null } // back to draft
    | { kind: 'retry'; error: string; issue: IssueRow | null }                                       // sync unfinished: back to opts.retryTo
    | { kind: 'unclear'; error: string; issue: IssueRow | null };                                    // needs_check
  export async function sendLocked(deps: NewsletterDeps, locked: IssueRow, actor: string, opts: { syncPull: boolean; syncBudgetMs: number; retryTo: 'draft' | 'scheduled' }): Promise<SendOutcome>;
  export async function findBroadcast(deps: NewsletterDeps, marker: string): Promise<BroadcastSummary | null>; // moved; throws after 20 pages instead of returning null
  ```

- **Produces, deps:** `NewsletterDeps` gains `settings: { get(): Promise<NewsletterSettings>; save(s: NewsletterSettings, actor: string): Promise<NewsletterSettings> }` and `posts: () => NewsletterPost[]`.
  - `liveDeps` imports `posts.generated.json` (esbuild bundles it).
  - The fakes take a posts array.
- **Produces, API:**
  - **`context()`** adds `next_issue_number`, `last_sent_at`, `next_allowed_date` and `panel`.
  - **Routes:**
    - `GET ?action=settings` returns `{ settings, next: { preview_at, send_at, post: { slug, title } | null, blocked: string | null } }`;
    - `PUT ?action=settings` validates with `settingsSchema` and writes an audit entry `NEWSLETTER_SETTINGS`;
    - `GET ?action=posts` returns `{ posts: { slug, title, date, has_image, sent }[] }`;
    - `POST ?id&action=swap` with `{ slug }`;
    - `POST ?id&action=skip`.
  - **Client:** `lib/newsletter-admin.ts` gains `getSettings`, `saveSettings`, `listPosts`, `swapIssuePost` and `skipIssue`. `IssueContext` gains the four context fields.

- [ ] **Step 1: Write the failing tests:**
  - **`send-core.test.ts`.** Move the existing send cases from `issues.test.ts` that test the core (sync remaining, problems, 4xx, unclear, sent) here, unchanged in meaning, calling `sendLocked`. Add: `findBroadcast` throws after 20 full pages.
  - **`issues.test.ts`:**
    - manual send is refused with 409 and "The next newsletter can go out on ‹date›." when `lastSentAt` is 10 days ago;
    - send locks with `nextIssueNumber()`;
    - `PUT ?action=settings` rejects a Wednesday and 6 recipients, and accepts a Tuesday;
    - `GET ?action=posts` marks a sent slug `sent: true`;
    - swap on a scheduled issue refills subject, preheader, kicker, title, intro, hero, `share_url`, `post_slug` and `reading_minutes` from the post, and writes an audit entry;
    - swap or skip on a draft is 409;
    - skip → `skipped` with reason `Skipped in /arel-ops by <email>.`;
    - save on a scheduled issue whose `scheduled_for` has passed is 409, "Its send time has passed.";
    - saving a manual issue whose article link is `https://hopetrustindia.com/blogs/<a real slug>/` stores that `post_slug`, and an unknown slug stores null;
    - the 409 message's ‹date› is `formatSlot(sendTimeOn(nextAllowedDate(lastSentAt)))`, for example `Tue 3 Nov`.
- [ ] **Step 2: Run** `npx vitest run tests/vitest/functions/newsletter/`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Extract `sendLocked` from `send()` with the same messages. `send()` now:
    1. checks `gapAllows(lastSentAt, now)`;
    2. locks with `nextIssueNumber()`;
    3. calls `sendLocked(..., { syncPull: false, syncBudgetMs: 4000, retryTo: 'draft' })`;
    4. maps the outcome to the old responses.
  - `checkStatus` uses the moved `findBroadcast`.
  - Add the routes. `action` routes are matched before the id-less GET.
  - Render previews with `issueRenderOptions(base, mode, { panel, nextIssueNumber })` everywhere the handler renders.
- [ ] **Step 4: Run** the folder again, then `npx tsc --noEmit -p tsconfig.json`. Expected: PASS, 0 errors.
- [ ] **Step 5: Commit** `feat(newsletter): settings, post swap and skip, the 14-day gap, shared send core`.

---

### Task 7: The automatic run

**Files:**
- Create: `lib/newsletter/auto-emails.ts`, `netlify/functions/_shared/newsletter-auto.mts`, `netlify/functions/newsletter-auto.mts`
- Test: `tests/vitest/functions/newsletter/auto.test.ts`, `tests/vitest/lib/newsletter/auto-emails.test.ts`

**Interfaces:**
- **Consumes:**
  - `dueSlot`, `gapAllows`, `formatSlot` and `PREVIEW_LEAD_MS` (Task 3);
  - `chooseNextPost` (Task 2);
  - `sendLocked` and `findBroadcast` (Task 6);
  - the `IssuesDb` additions (Task 1).
- **Produces:**

  ```ts
  export interface AutoReport { actions: string[] } // e.g. ['previewed <id>', 'sent <id>', 'missed <id>']
  export async function runAutomatic(deps: NewsletterDeps): Promise<AutoReport>;
  // auto-emails.ts
  export function previewEmail(issueHtml: string, info: { sendAt: Date; subscribed: number; adminUrl: string }): { subject: (s: string) => string; html: string }; // note injected after <body>
  export function noteEmail(subject: string, lines: string[]): { subject: string; html: string };
  ```

**Behaviour, in this order on every run** (spec §5.3–5.6). `now` = `deps.now()`, or `NEWSLETTER_AUTO_NOW` under `netlify dev`.

1. **Settings off or no first date.** Every blog row in `scheduled` → `draft` with reason `Automatic sending was switched off.` Stop.
2. **Overdue.** `overdueScheduled(now − 3h)` → `missed`, with reason `It was more than 3 hours late, so it wasn't sent.` Send a note.
3. **Needs check.** For each `blogNeedsCheck()`, run `findBroadcast`. Found → `markSent`. Not found after 10 minutes → `backToDraft`, with a note.
4. **Find the slot.** `slot = dueSlot(first, now)`. None → stop.
5. **Preview window** (`now < slot`):
   - **No row yet:** decide.
     - `!gapAllows(lastSentAt, slot)` → skipped, `A newsletter went out on ‹date›, less than 14 days before.`
     - No subscribers → skipped, `There are no subscribers.`
     - No post → skipped, `Every blog post with a usable photo has been sent.`
     - Otherwise → scheduled, with `blogIssueFields(post, India date of slot)` (spec §5.3).

     Create it with `createBlog`; null means another run won, so stop.
   - **Then, if `claimPreview`:**
     - scheduled → send `previewEmail` of the test render, to `preview_recipients`;
     - skipped → send `noteEmail('[The Hope Letter] No newsletter on ‹formatSlot›', [reason])`.

     If the email fails, `releasePreview`.
6. **Send window** (`now >= slot`), with the row `scheduled`:
   - **Preview never claimed** → `missed`, `The preview email didn't go out, so it wasn't sent.`
   - **Re-checks:** the gap and subscribers. Skip with a note if either fails.
   - **Lock and send:** `lockForSend(id, 'automatic', nextIssueNumber(), 'scheduled')`. Null → stop. Then `sendLocked(..., { syncPull: true, syncBudgetMs: 15000, retryTo: 'scheduled' })`.
   - **`retry`** (sync not finished): the issue is back to `scheduled`, so the next run tries again inside the 3 hours.
   - **Outcome notes:**
     - sent → `[The Hope Letter] Sent to N subscribers`;
     - blocked → `[The Hope Letter] Not sent: ‹error›`;
     - unclear → nothing (step 3 settles it).

All notes use `noteEmail`. Every state change writes an audit entry with actor `automatic`. No rows exist for a slot whose preview window was missed entirely: nothing is created after `slot`.

- [ ] **Step 1: Write the failing tests** in `auto.test.ts`. Use the fakes with a settable clock and the first date `2026-10-20`. One test per behaviour line above, plus:
  - two `runAutomatic` calls racing on the same clock create one row and one preview email (`Promise.all`);
  - a second run in the send window after `sent` sends nothing;
  - switched off between preview and send → draft, and no broadcast;
  - a manual issue sent on `2026-10-12` → the 20 Oct preview is a skip note; on 3 Nov the issue is previewed normally;
  - `NEWSLETTER_AUTO_NOW` is ignored unless `NETLIFY_DEV` is `'true'`.

  In `auto-emails.test.ts`:
  - `previewEmail` puts the note (send time `Tue 20 Oct, 10:00 am India time`, the subscriber count, the `/arel-ops/` link) right after `<body…>`;
  - `noteEmail` escapes its lines.
- [ ] **Step 2: Run** `npx vitest run tests/vitest/functions/newsletter/auto.test.ts tests/vitest/lib/newsletter/auto-emails.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** `netlify/functions/newsletter-auto.mts` mirrors `newsletter-cleanup.mts`, with `export const config = { schedule: '*/15 * * * *' }`. It's a scheduled function, so no redirect.
- [ ] **Step 4: Run** the tests, then the whole `tests/vitest/functions/newsletter/`. Then `npx netlify functions:build --functions netlify/functions --src netlify/functions`, or as plan 3 Task 7 did, so `newsletter-auto.zip` is built, with its schedule in the manifest. Expected: PASS, and the bundle is there.
- [ ] **Step 5: Commit** `feat(newsletter): automatic fortnightly send with preview, skip and catch-up`.

---

### Task 8: The admin screens

**Files:**
- Create: `components/admin/newsletter/AutomaticScreen.tsx`, `components/admin/newsletter/PostPicker.tsx`
- Modify: `components/admin/newsletter/IssueEditor.tsx`, `IssuesScreen.tsx`, `NewsletterTab.tsx`, `IssueSendDialogs.tsx`, `issue-status.ts`
- Test: `tests/vitest/components/admin/AutomaticScreen.test.tsx`, `PostPicker.test.tsx`, `IssueEditor.test.tsx`, `IssuesScreen.test.tsx`, `NewsletterTab.test.tsx`

**Interfaces:**
- Consumes: the Task 6 client functions and context fields; `formatSlot` and `nextAllowedDate`.
- Produces:
  - `AutomaticScreen({ token, onUnauthorized })`;
  - `PostPicker({ token, onUnauthorized, onPick(slug), onClose })`;
  - `NewsletterTab`'s `Screen` becomes `'issues' | 'subscribers' | 'automatic'`, with tab label `Automatic`.

- [ ] **Step 1: Write the failing tests:**
  - **AutomaticScreen:**
    - shows `Off` and the switch;
    - saving a Wednesday shows the API's error;
    - with settings on, it shows `Next preview: Sun 18 Oct, 10:00 am` and `Next send: Tue 20 Oct, 10:00 am`, and the post title;
    - the recipients field starts with `essentials@admirate.in`;
    - the book panel fields appear when its switch is on.
  - **PostPicker:**
    - typing filters by title, case-insensitive;
    - sent posts show `Sent`;
    - posts without a photo show `No photo`;
    - choosing calls `onPick(slug)`.
  - **IssueEditor:**
    - a manual issue has Kicker, Question and `Article link` (was "Blog link for Share");
    - a scheduled blog issue shows `Goes out Tue 20 Oct, 10:00 am`, an Intro field instead of the body editor, `Swap post` and `Skip this fortnight`, and no `Send to subscribers`;
    - skip asks to confirm, then shows `Skipped`;
    - Swap post asks to confirm that edits will be replaced, then opens `PostPicker`;
    - a skipped, missed or sent blog issue is read-only, with its reason;
    - manual Send is disabled with `The next newsletter can go out on ‹date›.` when the context's `next_allowed_date` is after today;
    - the send dialog warns `This will skip the automatic newsletter on ‹date›.` when the next slot falls inside the new gap.
  - **IssuesScreen:**
    - the scheduled issue is listed first, with `Scheduled · Tue 20 Oct`;
    - `Skipped` and `Missed` have their labels in `issue-status.ts`.
  - **NewsletterTab:** has three screens.
- [ ] **Step 2: Run** `npx vitest run tests/vitest/components/admin/`. Expected: FAIL.
- [ ] **Step 3: Implement.** Follow the existing screens' patterns (banner errors, `onUnauthorized`, Save buttons). The preview passes `panel` and `next_issue_number` from the context to the renderer.
- [ ] **Step 4: Run** `npx vitest run tests/vitest/components/admin/`, then `npx tsc --noEmit -p tsconfig.json`, then the e2e `tests/e2e/newsletter.spec.ts` (update its editor test for the renamed field). Expected: PASS, 0 errors.
- [ ] **Step 5: Commit** `feat(newsletter): Automatic screen, post swap and skip, the new fields in the editor`.

---

### Task 9: Whole-branch checks, the live check, push

**Files:**
- Modify: `docs/superpowers/specs/2026-10-17-newsletter-fortnightly-blog-design.md` (append §13 "Results")

- [ ] **Step 1: Checks.**
  - The whole vitest suite: only the 7 known failures.
  - `npx tsc --noEmit -p tsconfig.json`: 0 errors.
  - `npm run build`: exit 0. Do it in a temp copy if `next dev` is running, per the build gotcha.
  - The functions type-check: no new errors over the baseline of 12.
- [ ] **Step 2: Final review.** Run one fresh reviewer on the most capable model over the plan 4 diff (from `b7adc9b`, without `package-lock.json` and `posts.generated.json`), against this plan's Review Focus, the spec and the Global Constraints. Fix what it finds, then re-run Step 1.
- [ ] **Step 3: SQL.** Give the user section 7 to paste. Check it with read-only queries:
  - the new columns are selectable;
  - the settings row exists with `essentials@admirate.in`;
  - the anon key is refused (42501).
- [ ] **Step 4: Upload the logo.** Run `node --env-file=.env scripts/newsletter-upload-assets.mts`. Then a GET of `…/static/logo-round-v1.png` returns 200 `image/png`.
- [ ] **Step 5: The live check**, under `netlify dev` (move `out/` aside, as plan 3 did). It's plan 3 Task 17, Steps 3–6, on the new design, plus:
  - Set `first_send_date` to the next Tuesday and switch automatic on. Set `NEWSLETTER_AUTO_NOW` to the preview time, and run the function with `npx netlify functions:invoke newsletter-auto`. The preview reaches `essentials@admirate.in`.
  - Edit the question in `/arel-ops`. Set `NEWSLETTER_AUTO_NOW` to the send time and invoke again. The broadcast reaches the one test subscriber, with `Issue 01`, the italic emphasis and working share links.
  - The skip path on a second slot sends a skip note.
  - Afterwards:
    - switch automatic off;
    - delete the test issues (SQL from the user), so the first real issue is `Issue 01`;
    - delete the test subscriber;
    - restore `out/`.
- [ ] **Step 6: Record and push.**
  - Append §13 "Results" to the spec, with each check and what was seen.
  - Commit `docs(newsletter): record plan 4 checks`.
  - `git push origin feat-newsletter`.
- [ ] **Step 7: Go-live checklist** for the user. It's plan 3 Task 18 Step 3, plus:
  - choose the first send date and switch automatic on after the deploy;
  - the Netlify scheduled function needs nothing else;
  - the Resend unsubscribe page text says "fortnightly".

  Open the pull request to `main` only when the user says ship.
