# Newsletter Phase 3 (Issues) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hope Trust staff write a newsletter issue in `/arel-ops`, preview it, send themselves a test and send it to every subscriber through a Resend broadcast. This plan also does phase 4's clean-up.

**Architecture:**
- A new `newsletter_issues` table, and a new admin function `admin-newsletter-issues`. Its handler is `_shared/newsletter-issues.mts` and its data layer `_shared/newsletter-issues-db.mts`, both wired through `NewsletterDeps` like plan 2's.
- One renderer, `lib/newsletter/render.ts`, builds the preview in the browser and the email on the server.
- The body editor is TipTap 3, limited to spec §6.3. It loads only when an issue is opened.
- Sending follows spec §9.1: draft → sending → sent, or back to draft, or needs_check.

**Tech Stack:** Next.js 15 (static export), React 18.2, TypeScript 5.2, Netlify Functions (`.mts`), Supabase (Postgres and Storage), the Resend REST API (broadcasts and emails), TipTap 3.31.4, zod 3, Vitest 4 with Testing Library, and Playwright.

**Spec:** `docs/superpowers/specs/2026-10-13-newsletter-design.md`: §5, §6, §8.1, §9.1–9.2, §10.2, §10.4, §11, §12, §13, §14 (phases 3 and 4), §15, §16 and §17.

## Global Constraints

- **Branch and commits:**
  - Work on `feat-newsletter`, in place, as plan 2 did.
  - Every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Sender:** `NEWSLETTER_FROM_EMAIL` (`Hope Trust <newsletter@hopetrustindia.com>`), replying to `frontoffice@hopetrustindia.com` (`REPLY_TO`).
- **Issue fields (§6.2, §10.2):**
  - The subject is required, up to 150 characters.
  - The preheader is optional, up to 200.
  - `issue_date` is `YYYY-MM-DD`, and defaults to today in India.
  - The title is required, up to 160.
  - The hero photo and its alt text (up to 250) are required before sending.
  - The body is rich text.
  - `share_url` is optional; null means `https://hopetrustindia.com/blogs/`.
- **Body content (§6.3):** paragraphs; headings at levels 2 and 3; bold; italic; links (`https:`, `http:`, `mailto:`, `tel:` or a path on the site); bulleted and numbered lists; pull-quotes (blockquote); dividers; hard breaks; full-width images with alt text. Nothing else, and no pasted images.
- **HTML size (§6.4):** the editor shows the size. It warns above `SIZE_WARN_BYTES` (80 KB), and sending is blocked above `SIZE_MAX_BYTES` (95 KB).
- **Images (§6.4, §10.4):**
  - At most 5 MB before processing.
  - Resized in the browser to at most 1,200 px wide.
  - PNG stays PNG; everything else becomes JPEG. Never WebP.
  - Uploaded through signed URLs to `newsletter-images/issues/<issue id>/<uuid>.<ext>`, with a one-year cache.
- **Links in the email:** newsletters always link to `https://hopetrustindia.com` (`NEWSLETTER_SITE_URL`), wherever they are rendered, including `netlify dev`.
- **Send (§9.1):**
  1. Lock the issue (draft → sending).
  2. Sync, so nothing waits to go to Resend.
  3. Render in send mode and check the size and the unsubscribe placeholder.
  4. Call `POST /broadcasts` with `segment_id`, `from`, `reply_to`, `subject`, `html`, `send: true`, and a `name` holding `[issue <id>]`.
  5. Success: the issue becomes sent, with the broadcast id, recipient count, time and sender, plus an audit entry.
  6. A 4xx from Resend: back to draft, with the error.
  7. A timeout or 5xx: needs_check. Check status then looks for the broadcast by name: if found, the issue is sent; if not, it goes back to draft.
- **Test send (§8.1, §9.2):**
  - Up to 5 addresses, defaulting to the signed-in admin.
  - The subject is prefixed with `[TEST] `.
  - It uses Resend's regular email API and the test version of the HTML, where Unsubscribe links to the site.
- **Records and read-only state:**
  - Every send, test send and issue delete is written to `admin_audit_log` (§12).
  - The preview iframe uses `srcdoc` with `sandbox=""` (§12).
  - Sent issues are read-only. Drafts can be deleted; sent issues can't (§8.1).
- **Code rules:**
  - TipTap is pinned to exactly `3.31.4`. It supports React 18; 3.32.0 was published on 13 Oct 2026, one day before this plan.
  - New functions are `.mts` and use `.mts` import extensions for local files.
  - `render.ts` and `sample-issue.ts` keep type-only imports, because `scripts/newsletter-preview.mts` runs them with Node alone.
  - Files that `npx tsc --noEmit -p tsconfig.json` checks (`lib/`, `components/`, `app/`) don't spread or `for…of` a `Set` or `Map` (the ES5-target trap). Use `Array.from`.
- **Time limits:** Netlify may stop a function at 10 s. The send's own sync gets 4 s, and creating the broadcast times out after 4 s.
- **Verification:**
  - In the whole vitest suite, the only failures are the 7 known ones: `Header.test.tsx` 1 and `pages/contact.test.tsx` 6.
  - `npx tsc --noEmit -p tsconfig.json` reports 0 errors.
- **Live database changes:** in this client, the Supabase MCP's write tools come back "declined". The user pastes SQL into the dashboard SQL editor, and read-only catalog queries then check it.

## Review Focus

These are the failure modes the spec implies that are most likely to bite a real person. Each one has a test in the task that owns it.

1. **A double send.** A double click, or two admins pressing Send, lets exactly one send through; the other gets 409 and no second broadcast (Task 6).
2. **Lost work.** An admin whose issue changed after they opened it gets 409 on Save, never a silent overwrite (Task 5). Leaving with unsaved changes warns, and unsaved edits survive a closed tab in this browser (Task 12).
3. **A send that dies part-way.** A Netlify timeout or a Resend 5xx never strands the issue or sends it twice: `needs_check`, and `sending` older than two minutes, can be resolved with Check status (Task 6).
4. **An unsubscribe that hasn't reached Resend yet.** Sending is blocked until it has, and the message names the address Resend refused (Task 6).
5. **A paste from Word or Google Docs** with images, tables, fonts and odd headings. It is reduced to the allowed content, and the images are removed with a note (Tasks 2, 9 and 10).

## File Structure

**Create**

| File | Responsibility |
|---|---|
| `lib/newsletter/issue.ts` | Issue types and field checks; the body clean-up that keeps §6.3 content; send checks; render options; broadcast name |
| `lib/newsletter/issue-image.ts` | Browser-side resize and upload of photos |
| `netlify/functions/_shared/newsletter-issues-db.mts` | `IssuesDb` (guarded status changes) and `ImageStorage` (signed upload URLs) |
| `netlify/functions/_shared/newsletter-issues.mts` | `handleAdminIssues`: list, get, create, save, delete, upload URL, test send, send, check status |
| `netlify/functions/admin-newsletter-issues.mts` | Function entry point |
| `netlify/functions/newsletter-cleanup.mts` | Hourly scheduled clean-up of stale pending sign-ups and old request IPs |
| `components/admin/newsletter/body-extensions.ts` | TipTap extensions limited to §6.3; the pasted-image filter |
| `components/admin/newsletter/BodyEditor.tsx` | Body editor with its toolbar |
| `components/admin/newsletter/IssuePreview.tsx` | Sandboxed preview, Desktop and Phone widths, size note; `renderPreview` |
| `components/admin/newsletter/IssueSendDialogs.tsx` | Send test and Send to subscribers dialogs |
| `components/admin/newsletter/IssueEditor.tsx` | One issue: fields, preview, save, send, check, delete, local backup |
| `components/admin/newsletter/IssuesScreen.tsx` | List of issues and the New issue button |
| Tests | `tests/vitest/lib/newsletter/{issue,issue-image,preview-text,preview-script}.test.ts`, `tests/vitest/lib/newsletter-admin-issues.test.ts`, `tests/vitest/functions/newsletter/{issues-db,issues,cleanup}.test.ts`, `tests/vitest/components/admin/{body-extensions,BodyEditor,IssuePreview,IssueEditor,IssuesScreen,NewsletterTab}.test.tsx` |

**Modify**

| File | Change |
|---|---|
| `Database/newsletter.sql` | Section 6: `newsletter_issues` |
| `lib/newsletter/render.ts` | `bodyPreviewText` never cuts an emoji in half (plan 1 minor) |
| `netlify/functions/_shared/resend.mts` | `sendBroadcast`, `listBroadcasts`, request timeout; `page` typing fix |
| `netlify/functions/_shared/newsletter-db.mts` | `AuditEntry.resourceType` |
| `netlify/functions/_shared/newsletter-deps.mts` | `issues` and `images` in `NewsletterDeps` |
| `netlify/functions/_shared/newsletter-signup.mts` | `runCleanup` |
| `tests/vitest/functions/newsletter/fakes.ts` | In-memory issues, fake images, fake broadcasts |
| `lib/newsletter-admin.ts` | Issues API client and `IssueApiError` |
| `components/admin/newsletter/NewsletterTab.tsx` | Issues and Subscribers screens |
| `netlify.toml` | `/api/admin-newsletter-issues` redirect |
| `tests/e2e/newsletter.spec.ts` | Issue editor test; the Subscribers test opens its screen; footer test waits for hydration |
| `docs/claude.md`, the spec | Phase 4 docs; "as built in plan 3" notes; §18 results |

**Delete:** `lib/newsletter-template.ts` and `scripts/test-newsletter.mjs`. Nothing imports either.

**Deferred, not in this plan:**
- From plan 2's final review:
  - **M3:** an unconfirmed request overwrites the earlier consent evidence.
  - **M9:** the pull isn't held to the time budget.
  - **M12:** the erasure hash is unsalted.
  - Grouping IPv6 addresses by /64.
- From the spec's "Not in v1": scheduled sends, open and click numbers in `/arel-ops`, and a web archive.
- **M8** (rows that keep failing block the push) is now visible: a send names them, and staff can unsubscribe or delete them.

---

### Task 1: The issues table

**Files:**
- Modify: `Database/newsletter.sql`: update the header and add section 6 at the end.

**Interfaces:**
- **Produces:** the table `public.newsletter_issues`, with the columns of spec §10.2. Tasks 4–6 read and write it, and Task 17 needs it live.

- [ ] **Step 1: Update the header**

In `Database/newsletter.sql`, replace the first three header lines:

```sql
-- =============================================================================
-- Newsletter: subscribers, erased addresses and sign-up requests
-- Spec: docs/superpowers/specs/2026-10-13-newsletter-design.md §10.1, §10.3, §10.5
```

with:

```sql
-- =============================================================================
-- Newsletter: subscribers, erased addresses, sign-up requests and issues
-- Spec: docs/superpowers/specs/2026-10-13-newsletter-design.md §10.1, §10.2, §10.3, §10.5
```

and replace the line `-- The image bucket is in newsletter-storage.sql; plan 3 adds newsletter_issues.` with `-- The image bucket is in newsletter-storage.sql.`

- [ ] **Step 2: Add section 6 at the end of the file**

```sql

-- 6. Issues (spec §10.2): one row per newsletter. Drafts are edited; a send
--    moves a draft to 'sending' with a guarded update, so a double click or a
--    second admin can't send it twice (§9.1). Sent issues stay as the record
--    of what went out. Access as in section 4.
create table if not exists public.newsletter_issues (
  id                   uuid primary key default gen_random_uuid(),
  subject              text not null default '' check (char_length(subject) <= 150),
  preheader            text not null default '' check (char_length(preheader) <= 200),
  issue_date           date not null default current_date,
  title                text not null default '' check (char_length(title) <= 160),
  hero_image_url       text check (hero_image_url is null or char_length(hero_image_url) <= 1000),
  hero_image_alt       text not null default '' check (char_length(hero_image_alt) <= 250),
  body                 jsonb not null default '{"type": "doc", "content": []}'::jsonb,
  share_url            text check (share_url is null or char_length(share_url) <= 1000),
  status               text not null default 'draft'
                         check (status in ('draft', 'sending', 'sent', 'needs_check')),
  last_error           text check (last_error is null or char_length(last_error) <= 2000),
  resend_broadcast_id  text,
  recipient_count      int,
  sent_at              timestamptz,
  sent_by              text,
  created_by           text not null,
  updated_by           text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists newsletter_issues_created_at_idx
  on public.newsletter_issues (created_at desc);

drop trigger if exists newsletter_issues_updated_at on public.newsletter_issues;
create trigger newsletter_issues_updated_at
  before update on public.newsletter_issues
  for each row execute function set_updated_at();

comment on table public.newsletter_issues is
  'Newsletter issues: drafts, and sent issues kept read-only as the record. Written only by the admin-newsletter-issues Netlify function.';

alter table public.newsletter_issues enable row level security;
revoke all on table public.newsletter_issues from anon, authenticated;
```

`set_updated_at()` is created earlier in the same file (section 2), so this section can run on its own as well as with the whole file.

- [ ] **Step 3: Ask the user to apply it (it doesn't block Tasks 2–16)**

The Supabase MCP's write tools come back "declined" in this client. Ask the user to paste the new section 6 into the SQL editor of the Hopetrust project (`mjgbotzrjmwggzwkoovi`) and run it. The code tasks use fakes, so carry on. Check it before Task 17.

- [ ] **Step 4: Check it once applied (read-only)**

Run with the MCP tool `execute_sql`:

```sql
select
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'newsletter_issues') as columns,
  (select relrowsecurity from pg_class where oid = 'public.newsletter_issues'::regclass) as rls_on,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'newsletter_issues') as policies,
  (select count(*) from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'newsletter_issues'
       and grantee in ('anon', 'authenticated')) as public_grants,
  (select count(*) from pg_trigger
     where tgrelid = 'public.newsletter_issues'::regclass and not tgisinternal) as triggers;
```

Expected: `columns` 19, `rls_on` true, `policies` 0, `public_grants` 0, `triggers` 1.

- [ ] **Step 5: Commit**

```bash
git add Database/newsletter.sql
git commit -m "feat(newsletter): issues table" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Issue rules, the emoji-safe preview line, and the preview-script safeguard

**Files:**
- Create: `lib/newsletter/issue.ts`
- Modify: `lib/newsletter/render.ts`, in `bodyPreviewText`
- Test: `tests/vitest/lib/newsletter/issue.test.ts`, `tests/vitest/lib/newsletter/preview-text.test.ts`, `tests/vitest/lib/newsletter/preview-script.test.ts`

**Interfaces:**
- **Consumes:**
  - from `lib/newsletter/content.ts`: `BodyDoc`, `BlockNode`, `InlineNode`, `Mark`, `ParagraphNode`, `ListItemNode`, `IssueForRender`;
  - from `lib/newsletter/render.ts`: `allowedImageUrl`, `resolveHref`, `SIZE_MAX_BYTES`, `UNSUBSCRIBE_PLACEHOLDER`, `RenderOptions`.
- **Produces** (all from `lib/newsletter/issue.ts`):
  - **Types:** `IssueStatus`, `IssueRow`, `IssueSummary`, `IssueDraft`.
  - **Constants:** `ISSUE_LIMITS`, `NEWSLETTER_SITE_URL`, `EMPTY_BODY`.
  - **Functions:** `todayInIndia(now?)`, `cleanText(s)`, `isAllowedLink(href)`, `normalizeBody(input)`, `issueDraftSchema`, `draftKey(draft)`, `toDraft(issue)`, `issueRenderOptions(imagesBase, mode)`, `kb(bytes)`, `sendProblems(check)`, `broadcastName(issue)` and `broadcastMarker(id)`.

- [ ] **Step 1: Write the failing tests**

`tests/vitest/lib/newsletter/issue.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { IssueForRender } from '@/lib/newsletter/content';
import {
  EMPTY_BODY,
  broadcastName,
  cleanText,
  draftKey,
  issueDraftSchema,
  issueRenderOptions,
  normalizeBody,
  sendProblems,
  toDraft,
  todayInIndia,
} from '@/lib/newsletter/issue';
import { renderIssueHtml } from '@/lib/newsletter/render';

const IMAGES = 'https://abc.supabase.co/storage/v1/object/public/newsletter-images';
const valid = {
  subject: 'Know thyself',
  preheader: '',
  issue_date: '2026-10-14',
  title: 'Know Thyself',
  hero_image_url: `${IMAGES}/issues/a/hero.jpg`,
  hero_image_alt: 'A window',
  body: EMPTY_BODY,
  share_url: null,
};

describe('todayInIndia', () => {
  it('uses the date in India, not in UTC', () => {
    expect(todayInIndia(new Date('2026-10-14T10:00:00Z'))).toBe('2026-10-14');
    // 19:00 UTC is 00:30 the next day in India.
    expect(todayInIndia(new Date('2026-10-14T19:00:00Z'))).toBe('2026-10-15');
  });
});

describe('cleanText', () => {
  it('drops NUL and half of a surrogate pair, and keeps whole emoji', () => {
    expect(cleanText('a\u0000b')).toBe('ab');
    expect(cleanText('x\uD83Dy')).toBe('xy');
    expect(cleanText('x\uDE00y')).toBe('xy');
    expect(cleanText('ok 😀')).toBe('ok 😀');
  });
});

describe('normalizeBody', () => {
  it('keeps every kind of allowed content as it is', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Title' }] },
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Sub' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Bold', marks: [{ type: 'bold' }] },
            { type: 'hardBreak' },
            { type: 'text', text: 'link', marks: [{ type: 'italic' }, { type: 'link', attrs: { href: 'https://example.com' } }] },
          ],
        },
        { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one' }] }] }] },
        {
          type: 'orderedList',
          attrs: { start: 3 },
          content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'three' }] }] }],
        },
        { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Quote' }] }] },
        { type: 'horizontalRule' },
        { type: 'image', attrs: { src: `${IMAGES}/issues/a/1.jpg`, alt: 'Alt' } },
      ],
    };
    expect(normalizeBody(doc)).toEqual(doc);
  });

  it("drops what the email can't show, keeping the text where it can", () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'codeBlock', content: [{ type: 'text', text: 'code' }] },
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Big' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'struck', marks: [{ type: 'strike' }, { type: 'bold' }] },
            { type: 'text', text: 'bad link', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)', target: '_blank' } }] },
            { type: 'text', text: 'good link', marks: [{ type: 'link', attrs: { href: '/blogs/', rel: 'noopener', class: null } }] },
            { type: 'mention', attrs: { id: 'x' } },
          ],
        },
        {
          type: 'blockquote',
          content: [
            { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Q' }] },
            { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'item' }] }] }] },
          ],
        },
        { type: 'image', attrs: { src: 'https://x.example/y.jpg', alt: 'line\nbreak', title: 'T', width: 10 } },
        { type: 'paragraph' },
        { type: 'paragraph' },
      ],
    };
    expect(normalizeBody(doc)).toEqual({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Big' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'struck', marks: [{ type: 'bold' }] },
            { type: 'text', text: 'bad link' },
            { type: 'text', text: 'good link', marks: [{ type: 'link', attrs: { href: '/blogs/' } }] },
          ],
        },
        {
          type: 'blockquote',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Q' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'item' }] },
          ],
        },
        { type: 'image', attrs: { src: 'https://x.example/y.jpg', alt: 'line break' } },
      ],
    });
  });

  it('limits nesting, and gives an empty doc for anything that is not one', () => {
    expect(normalizeBody(null)).toEqual(EMPTY_BODY);
    expect(normalizeBody({ type: 'paragraph' })).toEqual(EMPTY_BODY);
    const item = (text: string, ...rest: unknown[]) => ({
      type: 'listItem',
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }, ...rest],
    });
    let list: unknown = { type: 'bulletList', content: [item('deepest')] };
    for (let n = 0; n < 4; n++) list = { type: 'bulletList', content: [item(`level ${n}`, list)] };
    const json = JSON.stringify(normalizeBody({ type: 'doc', content: [list] }));
    expect(json).toContain('level 3');
    expect(json).toContain('level 1');
    expect(json).not.toContain('level 0');
    expect(json).not.toContain('deepest');
  });
});

describe('issueDraftSchema', () => {
  it('trims and flattens the one-line fields', () => {
    const parsed = issueDraftSchema.parse({ ...valid, subject: '  Hello\nthere \u0000 ', share_url: '  ' });
    expect(parsed.subject).toBe('Hello there');
    expect(parsed.share_url).toBeNull();
  });

  it.each([
    [{ subject: 'x'.repeat(151) }, 'The subject can be at most 150 characters.'],
    [{ title: 'x'.repeat(161) }, 'The title can be at most 160 characters.'],
    [{ issue_date: '2026-02-30' }, 'Choose a real date.'],
    [{ issue_date: '14/10/2026' }, 'Choose the issue date.'],
    [{ share_url: 'javascript:alert(1)' }, 'The Share link must be a web address, such as https://hopetrustindia.com/blogs/…'],
    [{ hero_image_url: 'http://example.com/a.jpg' }, 'The hero photo must be an uploaded image.'],
  ])('rejects %o', (change, message) => {
    const result = issueDraftSchema.safeParse({ ...valid, ...change });
    expect(result.success).toBe(false);
    expect(result.success ? '' : result.error.issues[0].message).toBe(message);
  });

  it('accepts a Share link on the site or anywhere on the web', () => {
    expect(issueDraftSchema.parse({ ...valid, share_url: '/blogs/know-thyself/' }).share_url).toBe('/blogs/know-thyself/');
    expect(issueDraftSchema.parse({ ...valid, share_url: 'https://example.com/a' }).share_url).toBe('https://example.com/a');
  });
});

describe('draftKey', () => {
  it('matches drafts that would save the same, and tells apart ones that would not', () => {
    expect(draftKey({ ...valid, subject: 'Know thyself ' })).toBe(draftKey(valid));
    expect(draftKey({ ...valid, title: 'Other' })).not.toBe(draftKey(valid));
    expect(draftKey(toDraft(valid))).toBe(draftKey(valid));
  });
});

describe('issueRenderOptions', () => {
  it('takes the logo from static/, photos from anywhere in the bucket, and links to the live site', () => {
    expect(issueRenderOptions(`${IMAGES}/`, 'preview')).toEqual({
      mode: 'preview',
      siteUrl: 'https://hopetrustindia.com',
      assetBaseUrl: `${IMAGES}/static`,
      imagePrefixes: [`${IMAGES}/`],
    });
  });
});

describe('sendProblems', () => {
  const opts = issueRenderOptions(IMAGES, 'send');
  const ready: IssueForRender = {
    ...valid,
    body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] }] },
  };

  it('has nothing to say about an issue that is ready', () => {
    const { html, bytes } = renderIssueHtml(ready, opts);
    expect(sendProblems({ issue: ready, html, bytes, subscribed: 3, imagePrefixes: opts.imagePrefixes })).toEqual([]);
  });

  it("lists every reason an issue can't go out, in the editor's order", () => {
    expect(
      sendProblems({
        issue: { subject: ' ', title: '', hero_image_url: 'https://elsewhere.example/a.jpg', hero_image_alt: '' },
        html: '<p>no link</p>',
        bytes: 96 * 1024,
        subscribed: 0,
        imagePrefixes: opts.imagePrefixes,
      }),
    ).toEqual([
      'Add a subject.',
      'Add a title.',
      'Add a hero photo.',
      "Describe the hero photo for people who can't see it.",
      'The email is 96.0 KB, over the 95.0 KB limit. Shorten it or remove an image.',
      'The email is missing its Unsubscribe link.',
      'There are no subscribers to send to.',
    ]);
  });
});

describe('broadcastName', () => {
  it('names the broadcast with the subject and the issue id, never splitting an emoji', () => {
    expect(broadcastName({ id: 'abc', subject: ' Know thyself ' })).toBe('Know thyself [issue abc]');
    expect(broadcastName({ id: 'abc', subject: '' })).toBe('Newsletter [issue abc]');
    expect(broadcastName({ id: 'abc', subject: '😀'.repeat(100) })).toBe(`${'😀'.repeat(80)} [issue abc]`);
  });
});
```

`tests/vitest/lib/newsletter/preview-text.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { BodyDoc } from '@/lib/newsletter/content';
import { bodyPreviewText } from '@/lib/newsletter/render';

describe('bodyPreviewText', () => {
  it('never cuts an emoji in half', () => {
    const doc: BodyDoc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: `${'a'.repeat(138)}😀${'b'.repeat(10)}` }] }],
    };
    expect(bodyPreviewText(doc, 140)).toBe(`${'a'.repeat(138)}😀…`);
  });
});
```

`tests/vitest/lib/newsletter/preview-script.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// scripts/newsletter-preview.mts runs lib/newsletter/render.ts and
// sample-issue.ts with Node alone (type stripping, no bundler), so they must
// keep type-only imports. Running the real script keeps it that way.
describe('scripts/newsletter-preview.mts', () => {
  it('renders the sample issue with Node alone', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'newsletter-preview-'));
    try {
      const run = spawnSync(process.execPath, [path.resolve('scripts/newsletter-preview.mts')], {
        cwd: dir,
        env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co' },
        encoding: 'utf8',
        timeout: 30_000,
      });
      expect(run.status, run.stderr).toBe(0);
      const html = readFileSync(path.join(dir, '.newsletter-preview', 'sample-send.html'), 'utf8');
      expect(html).toContain('{{{RESEND_UNSUBSCRIBE_URL}}}');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 40_000);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/vitest/lib/newsletter/issue.test.ts tests/vitest/lib/newsletter/preview-text.test.ts tests/vitest/lib/newsletter/preview-script.test.ts`

Expected:
- `issue.test.ts` fails because `@/lib/newsletter/issue` doesn't exist.
- `preview-text.test.ts` fails because the result ends in a lone `\uD83D` before `…`.
- `preview-script.test.ts` passes already. It is the safeguard, so it must stay green.

- [ ] **Step 3: Write `lib/newsletter/issue.ts`**

```ts
// Rules for a newsletter issue (spec §6.2–§6.4, §8.1, §9.1): the shapes the
// admin API sends and receives, the field checks, the body clean-up that
// keeps only what the email can show, and the checks that block a send.
// Shared by the admin-newsletter-issues function and the Newsletter tab.

import { z } from 'zod';
import type { BlockNode, BodyDoc, InlineNode, IssueForRender, ListItemNode, Mark, ParagraphNode } from './content';
import { SIZE_MAX_BYTES, UNSUBSCRIBE_PLACEHOLDER, allowedImageUrl, resolveHref, type RenderOptions } from './render';

export type IssueStatus = 'draft' | 'sending' | 'sent' | 'needs_check';

/** A row of newsletter_issues (Database/newsletter.sql §6), as the admin API returns it. */
export interface IssueRow extends IssueForRender {
  id: string;
  status: IssueStatus;
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
  'id' | 'subject' | 'issue_date' | 'status' | 'recipient_count' | 'sent_at' | 'last_error' | 'updated_at'
>;

export const ISSUE_LIMITS = {
  subject: 150,
  preheader: 200,
  title: 160,
  heroAlt: 250,
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
  };
}

/** A comparable form of a draft: equal for two drafts that would save the same. */
export function draftKey(draft: unknown): string {
  const parsed = issueDraftSchema.safeParse(draft);
  return JSON.stringify(parsed.success ? parsed.data : draft);
}

/** How the preview and the functions render an issue: logo and icons from static/, photos from anywhere in the bucket. */
export function issueRenderOptions(imagesBase: string, mode: RenderOptions['mode']): RenderOptions {
  const base = imagesBase.replace(/\/+$/, '');
  return { mode, siteUrl: NEWSLETTER_SITE_URL, assetBaseUrl: `${base}/static`, imagePrefixes: [`${base}/`] };
}

export const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;

export interface SendCheck {
  issue: Pick<IssueForRender, 'subject' | 'title' | 'hero_image_url' | 'hero_image_alt'>;
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
  if (!allowedImageUrl(issue.hero_image_url, imagePrefixes)) problems.push('Add a hero photo.');
  if (!issue.hero_image_alt.trim()) problems.push("Describe the hero photo for people who can't see it.");
  if (bytes > SIZE_MAX_BYTES) {
    problems.push(`The email is ${kb(bytes)}, over the ${kb(SIZE_MAX_BYTES)} limit. Shorten it or remove an image.`);
  }
  if (!html.includes(UNSUBSCRIBE_PLACEHOLDER)) problems.push('The email is missing its Unsubscribe link.');
  if (subscribed < 1) problems.push('There are no subscribers to send to.');
  return problems;
}

/** What Check status looks for in a broadcast's name (spec §9.1 step 8). */
export const broadcastMarker = (id: string) => `[issue ${id}]`;

/** Resend's name for the broadcast: the subject, then the marker. */
export function broadcastName(issue: Pick<IssueRow, 'id' | 'subject'>): string {
  const subject = Array.from(issue.subject.trim()).slice(0, 80).join('');
  return `${subject || 'Newsletter'} ${broadcastMarker(issue.id)}`;
}
```

- [ ] **Step 4: Fix `bodyPreviewText` in `lib/newsletter/render.ts`**

Replace:

```ts
    if (text) return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
```

with:

```ts
    if (text) {
      // Count code points, so the cut never lands inside an emoji.
      const chars = Array.from(text);
      return chars.length > max ? `${chars.slice(0, max - 1).join('').trimEnd()}…` : text;
    }
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/vitest/lib/newsletter/`

Expected: all pass, including the existing renderer snapshot tests. The sample issue's first paragraph is plain text, so its preview line doesn't change.

- [ ] **Step 6: Commit**

```bash
git add lib/newsletter/issue.ts lib/newsletter/render.ts tests/vitest/lib/newsletter/issue.test.ts tests/vitest/lib/newsletter/preview-text.test.ts tests/vitest/lib/newsletter/preview-script.test.ts
git commit -m "feat(newsletter): issue rules: field checks, body clean-up and send checks" -m "Also: the inbox preview line never cuts an emoji in half, and a test keeps the email code runnable by the preview script." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Broadcasts in the Resend client

**Files:**
- Modify: `netlify/functions/_shared/resend.mts`
- Test: `tests/vitest/functions/newsletter/resend.test.ts`, where a describe block is appended

**Interfaces:**
- **Produces:**
  - `BroadcastInput` = `{ segmentId, from, replyTo?, subject, html, name }`;
  - `BroadcastSummary` = `{ id, name, status, sentAt: string | null }`;
  - `BroadcastPage` = `{ broadcasts: BroadcastSummary[]; hasMore: boolean }`;
  - `ResendClient.sendBroadcast(input): Promise<string>`, which returns the broadcast id;
  - `ResendClient.listBroadcasts(after?): Promise<BroadcastPage>`;
  - `ResendClientOptions.broadcastTimeoutMs`, default 4000.
- Any other error is unclear: a timeout raises a non-`ResendError` error, and a 5xx raises a `ResendError` with `status` ≥ 500. A 4xx raises a `ResendError` with `status` 400–499.

- [ ] **Step 1: Write the failing tests**

Append to `tests/vitest/functions/newsletter/resend.test.ts`:

```ts
describe('broadcasts', () => {
  const input = {
    segmentId: 'seg',
    from: 'Hope Trust <newsletter@hopetrustindia.com>',
    replyTo: 'frontoffice@hopetrustindia.com',
    subject: 'Hello',
    html: '<p>Hi</p>',
    name: 'Hello [issue x]',
  };

  it('creates the broadcast and sends it in one call', async () => {
    const { resend, calls } = client([{ status: 200, body: { object: 'broadcast', id: 'b-1' } }]);
    expect(await resend.sendBroadcast(input)).toBe('b-1');
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toBe('https://api.resend.com/broadcasts');
    expect(calls[0].body).toEqual({
      segment_id: 'seg',
      from: 'Hope Trust <newsletter@hopetrustindia.com>',
      subject: 'Hello',
      html: '<p>Hi</p>',
      name: 'Hello [issue x]',
      send: true,
      reply_to: 'frontoffice@hopetrustindia.com',
    });
  });

  it('treats an answer without an id as a server error', async () => {
    const { resend } = client([{ status: 200, body: {} }]);
    await expect(resend.sendBroadcast(input)).rejects.toMatchObject({ status: 502 });
  });

  it('passes on a refusal with its status', async () => {
    const { resend } = client([{ status: 422, body: { name: 'validation_error', message: 'Bad from' } }]);
    await expect(resend.sendBroadcast(input)).rejects.toMatchObject({ status: 422, message: 'Bad from' });
  });

  it('gives up on a broadcast that takes too long, so the send can be checked later', async () => {
    let signal: AbortSignal | null | undefined;
    const slowFetch = (_url: string, init: RequestInit) => {
      signal = init.signal;
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      });
    };
    const resend = createResendClient({
      apiKey: 're_test',
      minIntervalMs: 0,
      broadcastTimeoutMs: 20,
      fetch: slowFetch as unknown as typeof fetch,
    });
    await expect(resend.sendBroadcast(input)).rejects.toThrow();
    expect(signal?.aborted).toBe(true);
  });

  it('lists broadcasts a page at a time', async () => {
    const { resend, calls } = client([
      {
        status: 200,
        body: {
          object: 'list',
          has_more: true,
          data: [
            { id: 'b-2', name: 'Two [issue y]', status: 'sent', sent_at: '2026-10-14T10:00:00.000Z', segment_id: 'seg' },
            { id: 'b-1', name: null, status: 'draft', sent_at: null },
          ],
        },
      },
    ]);
    expect(await resend.listBroadcasts('b-3')).toEqual({
      broadcasts: [
        { id: 'b-2', name: 'Two [issue y]', status: 'sent', sentAt: '2026-10-14T10:00:00.000Z' },
        { id: 'b-1', name: '', status: 'draft', sentAt: null },
      ],
      hasMore: true,
    });
    expect(calls[0].url).toBe('https://api.resend.com/broadcasts?limit=100&after=b-3');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/vitest/functions/newsletter/resend.test.ts`

Expected: the new tests fail with "resend.sendBroadcast is not a function" and "resend.listBroadcasts is not a function".

- [ ] **Step 3: Add the types, after `EmailInput`**

```ts
export interface BroadcastInput {
  segmentId: string;
  from: string;
  replyTo?: string;
  subject: string;
  html: string;
  /** Resend's own label; the newsletter puts the issue id in it, so Check status can find it (spec §9.1). */
  name: string;
}

export interface BroadcastSummary {
  id: string;
  name: string;
  status: string;
  sentAt: string | null;
}

export interface BroadcastPage {
  broadcasts: BroadcastSummary[];
  hasMore: boolean;
}
```

- [ ] **Step 4: Add them to `ResendClient` and the options**

In `interface ResendClient`, after `sendEmail(input: EmailInput): Promise<string>;`, add:

```ts
  /** Creates a broadcast to the segment and sends it at once. Returns its id. */
  sendBroadcast(input: BroadcastInput): Promise<string>;
  /** One page of broadcasts, as Resend lists them. */
  listBroadcasts(after?: string): Promise<BroadcastPage>;
```

In `interface ResendClientOptions`, after `baseUrl?: string;`, add:

```ts
  /**
   * Gives up on creating a broadcast after this long (default 4 s), so the
   * function can still record that the outcome is unclear before Netlify
   * stops it.
   */
  broadcastTimeoutMs?: number;
```

- [ ] **Step 5: Give `request` an optional timeout**

Change the signature and the `fetch` call in `request`, and keep the retry passing the timeout on:

```ts
  async function request(
    method: string,
    path: string,
    body?: unknown,
    retried = false,
    timeoutMs?: number,
  ): Promise<Json | null> {
    await pace();
    const res = await doFetch(`${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
    });
    if (res.status === 429 && !retried) {
      const seconds = Number(res.headers.get('retry-after'));
      await sleep(Math.min(Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 1000, MAX_RETRY_WAIT_MS));
      return request(method, path, body, true, timeoutMs);
    }
```

The rest of `request` is unchanged.

- [ ] **Step 6: Fix the two `page` typings, and add the two methods**

Replace `contactSegmentIds` and `listSegmentContacts` with these. They behave the same, but TypeScript can now see that `data` isn't null:

```ts
    async contactSegmentIds(contactId) {
      const data = (await request('GET', `/contacts/${contactKey(contactId)}/segments?limit=100`))?.data;
      return Array.isArray(data) ? data.map((s: Json) => String(s.id)) : [];
    },

    async listSegmentContacts(segmentId, after) {
      const query = new URLSearchParams({ segment_id: segmentId, limit: '100' });
      if (after) query.set('after', after);
      const page = await request('GET', `/contacts?${query}`);
      const data = page?.data;
      return {
        contacts: Array.isArray(data) ? data.map(toContact) : [],
        hasMore: Boolean(page?.has_more),
      };
    },
```

After `sendEmail`, add:

```ts
    async sendBroadcast(input) {
      const created = await request(
        'POST',
        '/broadcasts',
        {
          segment_id: input.segmentId,
          from: input.from,
          subject: input.subject,
          html: input.html,
          name: input.name,
          send: true,
          ...(input.replyTo ? { reply_to: input.replyTo } : {}),
        },
        false,
        options.broadcastTimeoutMs ?? 4000,
      );
      if (typeof created?.id !== 'string') throw new ResendError(502, 'bad_response', 'Resend did not return a broadcast id');
      return created.id;
    },

    async listBroadcasts(after) {
      const query = new URLSearchParams({ limit: '100' });
      if (after) query.set('after', after);
      const page = await request('GET', `/broadcasts?${query}`);
      const data = page?.data;
      return {
        broadcasts: (Array.isArray(data) ? data : []).map((b: Json) => ({
          id: String(b.id),
          name: String(b.name ?? ''),
          status: String(b.status ?? ''),
          sentAt: typeof b.sent_at === 'string' ? b.sent_at : null,
        })),
        hasMore: Boolean(page?.has_more),
      };
    },
```

- [ ] **Step 7: Run the tests**

Run: `npx vitest run tests/vitest/functions/newsletter/resend.test.ts`

Expected: all pass. The fake in `fakes.ts` doesn't implement the two new methods yet, so the TypeScript check of `fakes.ts` fails until Task 4. Vitest doesn't type-check, so the suites still run.

- [ ] **Step 8: Commit**

```bash
git add netlify/functions/_shared/resend.mts tests/vitest/functions/newsletter/resend.test.ts
git commit -m "feat(newsletter): Resend broadcasts: send one, list them, time out cleanly" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Issues data layer, image upload URLs, and the fakes

**Files:**
- Create: `netlify/functions/_shared/newsletter-issues-db.mts`
- Modify:
  - `netlify/functions/_shared/newsletter-deps.mts`: `issues` and `images`;
  - `netlify/functions/_shared/newsletter-db.mts`: `AuditEntry.resourceType`;
  - `tests/vitest/functions/newsletter/fakes.ts`: in-memory issues, fake images, fake broadcasts.
- Test: `tests/vitest/functions/newsletter/issues-db.test.ts`

**Interfaces:**
- **Consumes:** `IssueDraft`, `IssueRow`, `IssueSummary` and `IssueStatus` from Task 2; `BroadcastInput` from Task 3.
- **Produces** (from `newsletter-issues-db.mts`):
  - `SentFields` = `{ resend_broadcast_id: string; recipient_count: number | null; sent_at: string }`;
  - `IssuesDb`, with:
    - `list(): Promise<IssueSummary[]>`;
    - `get(id): Promise<IssueRow | null>`;
    - `create(fields: IssueDraft, actor): Promise<IssueRow>`;
    - `saveDraft(id, fields, actor, ifUpdatedAt): Promise<IssueRow | null>`;
    - `deleteDraft(id): Promise<boolean>`;
    - `lockForSend(id, actor): Promise<IssueRow | null>`;
    - `markSent(id, fields: SentFields): Promise<IssueRow | null>`;
    - `backToDraft(id, error: string | null): Promise<IssueRow | null>`;
    - `markNeedsCheck(id, error): Promise<IssueRow | null>`;
  - `UploadTicket` = `{ path, token, signedUrl, publicUrl }`;
  - `ImageStorage.createUploadUrl(path): Promise<UploadTicket>`;
  - `createIssuesDb(supabase)`, `createImageStorage(supabase, imagesBase)` and `IMAGES_BUCKET`.
- **Also produces:**
  - `NewsletterDeps` gains `issues: IssuesDb` and `images: ImageStorage`;
  - `AuditEntry` gains `resourceType?: 'newsletter_subscriber' | 'newsletter_issue'`;
  - **from `fakes.ts`:** `createMemoryIssues(now)`, which returns `{ issues, rows, seed(fields?), get(id) }`; `createFakeImages(imagesBase)`, which returns `{ storage, paths }`; `IMAGES_BASE`; and `makeDeps()` now returns `{ deps, clock, memory, issueStore, images, resend, sleeps }`;
  - **the fake Resend gains:** `broadcasts` (newest first), `addBroadcast({ name, status, sentAt? })`, and `loseNextReply(error?)`. With that, the next broadcast is recorded as sent but the call throws, the way an answer lost to a timeout looks.

- [ ] **Step 1: Write the failing tests**

`tests/vitest/functions/newsletter/issues-db.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createNewsletterDb } from '@/netlify/functions/_shared/newsletter-db.mts';
import { createImageStorage, createIssuesDb } from '@/netlify/functions/_shared/newsletter-issues-db.mts';
import { createClock, createMemoryIssues } from './fakes';

/** A Supabase client that records every call and answers each query with `result`. */
function recording(result: { data: unknown; error: null } = { data: null, error: null }) {
  const calls: unknown[][] = [];
  const builder: object = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') return (resolve: (value: unknown) => void) => resolve(result);
        return (...args: unknown[]) => {
          calls.push([prop, ...args]);
          return builder;
        };
      },
    },
  );
  const client = {
    from(table: string) {
      calls.push(['from', table]);
      return builder;
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

const DRAFT = {
  subject: 'S',
  preheader: '',
  issue_date: '2026-10-14',
  title: 'T',
  hero_image_url: null,
  hero_image_alt: '',
  body: { type: 'doc' as const, content: [] },
  share_url: null,
};

describe('createIssuesDb queries', () => {
  it('lists the newest issues first, with the list columns only', async () => {
    const { client, calls } = recording({ data: [], error: null });
    await createIssuesDb(client).list();
    expect(calls).toEqual([
      ['from', 'newsletter_issues'],
      ['select', 'id, subject, issue_date, status, recipient_count, sent_at, last_error, updated_at'],
      ['order', 'created_at', { ascending: false }],
      ['order', 'id', { ascending: false }],
      ['limit', 200],
    ]);
  });

  it('saves a draft only while it is a draft, and unchanged since it was read', async () => {
    const { client, calls } = recording();
    await createIssuesDb(client).saveDraft('id-1', DRAFT, 'admin@x', '2026-10-14T10:00:00.000Z');
    expect(calls).toEqual([
      ['from', 'newsletter_issues'],
      ['update', { ...DRAFT, updated_by: 'admin@x' }],
      ['eq', 'id', 'id-1'],
      ['eq', 'status', 'draft'],
      ['eq', 'updated_at', '2026-10-14T10:00:00.000Z'],
      ['select', '*'],
      ['maybeSingle'],
    ]);
  });

  it('starts a send only from a draft, and finishes it only from sending or needs_check', async () => {
    const { client, calls } = recording();
    const db = createIssuesDb(client);
    await db.lockForSend('id-1', 'admin@x');
    await db.markSent('id-1', { resend_broadcast_id: 'b-1', recipient_count: 3, sent_at: '2026-10-14T10:00:00.000Z' });
    await db.backToDraft('id-1', 'x'.repeat(2500));
    await db.markNeedsCheck('id-1', 'unclear');
    expect(calls).toEqual([
      ['from', 'newsletter_issues'],
      ['update', { status: 'sending', sent_by: 'admin@x', last_error: null }],
      ['eq', 'id', 'id-1'],
      ['eq', 'status', 'draft'],
      ['select', '*'],
      ['maybeSingle'],
      ['from', 'newsletter_issues'],
      ['update', { resend_broadcast_id: 'b-1', recipient_count: 3, sent_at: '2026-10-14T10:00:00.000Z', status: 'sent', last_error: null }],
      ['eq', 'id', 'id-1'],
      ['in', 'status', ['sending', 'needs_check']],
      ['select', '*'],
      ['maybeSingle'],
      ['from', 'newsletter_issues'],
      ['update', { status: 'draft', sent_by: null, last_error: 'x'.repeat(2000) }],
      ['eq', 'id', 'id-1'],
      ['in', 'status', ['sending', 'needs_check']],
      ['select', '*'],
      ['maybeSingle'],
      ['from', 'newsletter_issues'],
      ['update', { status: 'needs_check', last_error: 'unclear' }],
      ['eq', 'id', 'id-1'],
      ['eq', 'status', 'sending'],
      ['select', '*'],
      ['maybeSingle'],
    ]);
  });

  it('deletes only drafts', async () => {
    const { client, calls } = recording({ data: [{ id: 'id-1' }], error: null });
    expect(await createIssuesDb(client).deleteDraft('id-1')).toBe(true);
    expect(calls).toEqual([
      ['from', 'newsletter_issues'],
      ['delete'],
      ['eq', 'id', 'id-1'],
      ['eq', 'status', 'draft'],
      ['select', 'id'],
    ]);
  });
});

describe('createImageStorage', () => {
  it('asks the image bucket for a signed upload URL and gives the public address', async () => {
    const asked: string[] = [];
    const client = {
      storage: {
        from(bucket: string) {
          asked.push(bucket);
          return {
            async createSignedUploadUrl(path: string) {
              asked.push(path);
              return { data: { path, token: 'tok', signedUrl: `https://abc.supabase.co/sign/${path}?token=tok` }, error: null };
            },
          };
        },
      },
    };
    const storage = createImageStorage(
      client as unknown as SupabaseClient,
      'https://abc.supabase.co/storage/v1/object/public/newsletter-images/',
    );
    expect(await storage.createUploadUrl('issues/i/a.jpg')).toEqual({
      path: 'issues/i/a.jpg',
      token: 'tok',
      signedUrl: 'https://abc.supabase.co/sign/issues/i/a.jpg?token=tok',
      publicUrl: 'https://abc.supabase.co/storage/v1/object/public/newsletter-images/issues/i/a.jpg',
    });
    expect(asked).toEqual(['newsletter-images', 'issues/i/a.jpg']);
  });
});

describe('the audit log', () => {
  it('records what kind of thing an entry is about', async () => {
    const { client, calls } = recording();
    await createNewsletterDb(client).audit({
      action: 'NEWSLETTER_SEND',
      actorEmail: 'a@x',
      resourceType: 'newsletter_issue',
      resourceId: 'id-1',
    });
    await createNewsletterDb(client).audit({ action: 'NEWSLETTER_EXPORT', actorEmail: 'a@x' });
    const inserts = calls.filter(([method]) => method === 'insert').map(([, row]) => (row as { resource_type: string }).resource_type);
    expect(inserts).toEqual(['newsletter_issue', 'newsletter_subscriber']);
  });
});

describe('the in-memory issues', () => {
  it('follow the same guards as the real table', async () => {
    const { issues } = createMemoryIssues(createClock().now);
    const draft = await issues.create(DRAFT, 'admin@x');
    const sent = { resend_broadcast_id: 'b', recipient_count: 1, sent_at: '2026-10-14T10:00:00.000Z' };
    expect(await issues.markSent(draft.id, sent)).toBeNull();
    expect(await issues.saveDraft(draft.id, DRAFT, 'admin@x', 'stale')).toBeNull();
    const locked = await issues.lockForSend(draft.id, 'admin@x');
    expect(locked?.status).toBe('sending');
    expect(await issues.lockForSend(draft.id, 'admin@x')).toBeNull();
    expect(await issues.saveDraft(draft.id, DRAFT, 'admin@x', locked!.updated_at)).toBeNull();
    expect(await issues.deleteDraft(draft.id)).toBe(false);
    expect((await issues.markSent(draft.id, sent))?.status).toBe('sent');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/vitest/functions/newsletter/issues-db.test.ts`

Expected: it fails because `newsletter-issues-db.mts` doesn't exist.

- [ ] **Step 3: Write `netlify/functions/_shared/newsletter-issues-db.mts`**

```ts
// Data access for newsletter issues (Database/newsletter.sql §6) and their
// images (Database/newsletter-storage.sql), through the service-role Supabase
// client. Status changes are guarded updates: a send can only start from a
// draft, and only finish from 'sending' or 'needs_check' (spec §9.1). Tests
// use the in-memory versions in tests/vitest/functions/newsletter/fakes.ts.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { IssueDraft, IssueRow, IssueSummary } from '../../../lib/newsletter/issue';

export interface SentFields {
  resend_broadcast_id: string;
  recipient_count: number | null;
  sent_at: string;
}

export interface IssuesDb {
  /** Newest first. */
  list(): Promise<IssueSummary[]>;
  get(id: string): Promise<IssueRow | null>;
  create(fields: IssueDraft, actor: string): Promise<IssueRow>;
  /** Saves a draft's fields if it is still a draft and unchanged since `ifUpdatedAt`; otherwise null. */
  saveDraft(id: string, fields: IssueDraft, actor: string, ifUpdatedAt: string): Promise<IssueRow | null>;
  /** Deletes a draft; false when there is no draft with that id. */
  deleteDraft(id: string): Promise<boolean>;
  /** draft → sending, recording who started it; null when it wasn't a draft. */
  lockForSend(id: string, actor: string): Promise<IssueRow | null>;
  /** sending or needs_check → sent. */
  markSent(id: string, fields: SentFields): Promise<IssueRow | null>;
  /** sending or needs_check → draft, with the reason the editor shows. */
  backToDraft(id: string, error: string | null): Promise<IssueRow | null>;
  /** sending → needs_check: Resend's answer was unclear. */
  markNeedsCheck(id: string, error: string): Promise<IssueRow | null>;
}

export interface UploadTicket {
  path: string;
  token: string;
  signedUrl: string;
  publicUrl: string;
}

export interface ImageStorage {
  /** A signed URL the browser uploads one image to (spec §10.4). */
  createUploadUrl(path: string): Promise<UploadTicket>;
}

const ISSUES = 'newsletter_issues';
export const IMAGES_BUCKET = 'newsletter-images';
const SUMMARY_COLUMNS = 'id, subject, issue_date, status, recipient_count, sent_at, last_error, updated_at';
const LIST_LIMIT = 200;
/** The column's check constraint. */
const MAX_ERROR = 2000;

const clip = (error: string | null) => (error === null ? null : error.slice(0, MAX_ERROR));

export function createIssuesDb(supabase: SupabaseClient): IssuesDb {
  const table = () => supabase.from(ISSUES);

  function check(error: { message: string } | null): void {
    if (error) throw new Error(`${ISSUES}: ${error.message}`);
  }

  /** Runs a guarded update: the changed row, or null when the guard didn't match. */
  async function changed(query: any): Promise<IssueRow | null> {
    const { data, error } = await query.select('*').maybeSingle();
    check(error);
    return (data as IssueRow | null) ?? null;
  }

  return {
    async list() {
      const { data, error } = await table()
        .select(SUMMARY_COLUMNS)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(LIST_LIMIT);
      check(error);
      return (data ?? []) as IssueSummary[];
    },

    async get(id) {
      const { data, error } = await table().select('*').eq('id', id).maybeSingle();
      check(error);
      return (data as IssueRow | null) ?? null;
    },

    async create(fields, actor) {
      const { data, error } = await table()
        .insert({ ...fields, created_by: actor, updated_by: actor })
        .select('*')
        .single();
      check(error);
      return data as IssueRow;
    },

    saveDraft: (id, fields, actor, ifUpdatedAt) =>
      changed(
        table()
          .update({ ...fields, updated_by: actor })
          .eq('id', id)
          .eq('status', 'draft')
          .eq('updated_at', ifUpdatedAt),
      ),

    async deleteDraft(id) {
      const { data, error } = await table().delete().eq('id', id).eq('status', 'draft').select('id');
      check(error);
      return (data?.length ?? 0) > 0;
    },

    lockForSend: (id, actor) =>
      changed(table().update({ status: 'sending', sent_by: actor, last_error: null }).eq('id', id).eq('status', 'draft')),

    markSent: (id, fields) =>
      changed(
        table()
          .update({ ...fields, status: 'sent', last_error: null })
          .eq('id', id)
          .in('status', ['sending', 'needs_check']),
      ),

    backToDraft: (id, error) =>
      changed(
        table()
          .update({ status: 'draft', sent_by: null, last_error: clip(error) })
          .eq('id', id)
          .in('status', ['sending', 'needs_check']),
      ),

    markNeedsCheck: (id, error) =>
      changed(table().update({ status: 'needs_check', last_error: clip(error) }).eq('id', id).eq('status', 'sending')),
  };
}

export function createImageStorage(supabase: SupabaseClient, imagesBase: string): ImageStorage {
  const base = imagesBase.replace(/\/+$/, '');
  return {
    async createUploadUrl(path) {
      const { data, error } = await supabase.storage.from(IMAGES_BUCKET).createSignedUploadUrl(path);
      if (error || !data) throw new Error(`${IMAGES_BUCKET}: ${error?.message ?? 'no upload URL'}`);
      return { path: data.path, token: data.token, signedUrl: data.signedUrl, publicUrl: `${base}/${data.path}` };
    },
  };
}
```

- [ ] **Step 4: Record the resource type in the audit log (`newsletter-db.mts`)**

In `interface AuditEntry`, after `actorEmail: string;`, add:

```ts
  /** admin_audit_log.resource_type: a subscriber unless it says otherwise. */
  resourceType?: 'newsletter_subscriber' | 'newsletter_issue';
```

In `audit(entry)`, replace `resource_type: 'newsletter_subscriber',` with:

```ts
          resource_type: entry.resourceType ?? 'newsletter_subscriber',
```

- [ ] **Step 5: Add `issues` and `images` to the deps (`newsletter-deps.mts`)**

Add this import after the `createNewsletterDb` import:

```ts
import { createImageStorage, createIssuesDb, type ImageStorage, type IssuesDb } from './newsletter-issues-db.mts';
```

In `interface NewsletterDeps`, after `db: NewsletterDb;`, add:

```ts
  /** Newsletter issues (plan 3). */
  issues: IssuesDb;
  /** Signed upload URLs for the photos in an issue. */
  images: ImageStorage;
```

Replace the body of `liveDeps` from `const supabaseUrl = …` to the end of the function with:

```ts
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL as string;
  const supabase = createClient(supabaseUrl, env.SUPABASE_SERVICE_ROLE_KEY as string, { auth: { persistSession: false } });
  const imagesBase = newsletterImagesBase(supabaseUrl);
  return {
    db: createNewsletterDb(supabase),
    issues: createIssuesDb(supabase),
    images: createImageStorage(supabase, imagesBase),
    resend: createResendClient({ apiKey: env.RESEND_API_KEY as string }),
    config: {
      segmentId: env.RESEND_NEWSLETTER_SEGMENT_ID as string,
      fromEmail: env.NEWSLETTER_FROM_EMAIL as string,
      replyTo: REPLY_TO,
      siteUrl: SITE_ORIGIN,
      imagesBase,
    },
    now: () => new Date(),
    sleep: (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
    verifyAdmin: (req) => verifyAdminToken(req, env.ADMIN_JWT_SECRET),
  };
}
```

- [ ] **Step 6: Extend the fakes (`tests/vitest/functions/newsletter/fakes.ts`)**

1. Change the imports at the top. Replace the `resend.mts` import line with the first line below, and add the other two:

```ts
import { ResendError, type BroadcastInput, type EmailInput, type ResendClient } from '@/netlify/functions/_shared/resend.mts';
import type { IssueRow, IssueStatus, IssueSummary } from '@/lib/newsletter/issue';
import type { ImageStorage, IssuesDb } from '@/netlify/functions/_shared/newsletter-issues-db.mts';
```

2. After `export const ADMIN_EMAIL = 'admin@hopetrustindia.com';`, add:

```ts
export const IMAGES_BASE = 'https://abc.supabase.co/storage/v1/object/public/newsletter-images';
```

3. Just above `export function createFakeResend() {`, add:

```ts
export interface FakeBroadcast {
  id: string;
  name: string;
  status: string;
  sentAt: string | null;
  /** What the handler sent, for broadcasts it created. */
  input?: BroadcastInput;
}
```

4. In `createFakeResend`, after the line `const failures: Array<{ method: string; error: Error }> = [];`, add:

```ts
  /** Newest first, as Resend lists them. */
  const broadcasts: FakeBroadcast[] = [];
  const lostReplies: Error[] = [];
```

5. In the `client` object, after the `sendEmail` method, add:

```ts
    async sendBroadcast(input) {
      step('sendBroadcast');
      const id = `broadcast-${broadcasts.length + 1}`;
      broadcasts.unshift({ id, name: input.name, status: 'sent', sentAt: '2026-10-14T10:00:00.000Z', input });
      // The broadcast went out, but the answer didn't arrive.
      const lost = lostReplies.shift();
      if (lost) throw lost;
      return id;
    },
    async listBroadcasts(after) {
      step('listBroadcasts');
      const start = after ? broadcasts.findIndex((b) => b.id === after) + 1 : 0;
      return {
        broadcasts: broadcasts.slice(start, start + 100).map(({ id, name, status, sentAt }) => ({ id, name, status, sentAt })),
        hasMore: start + 100 < broadcasts.length,
      };
    },
```

6. In the object `createFakeResend` returns, after `find,`, add:

```ts
    broadcasts,
    /** Adds a broadcast someone else made, newest first. */
    addBroadcast(b: { name: string; status: string; sentAt?: string | null }): FakeBroadcast {
      const added = { id: `broadcast-${broadcasts.length + 1}`, name: b.name, status: b.status, sentAt: b.sentAt ?? null };
      broadcasts.unshift(added);
      return added;
    },
    /** The next broadcast is sent, but the call throws `error`, as when Resend's answer is lost. */
    loseNextReply(error: Error = new ResendError(500, 'application_error', 'Resend is down')) {
      lostReplies.push(error);
    },
```

7. Just above `export function makeDeps`, add:

```ts
function clone<T>(value: T): T {
  return structuredClone(value);
}

/** newsletter_issues in memory, with the real table's guards (Database/newsletter.sql §6). */
export function createMemoryIssues(now: () => Date) {
  const rows = new Map<string, IssueRow>();
  let ids = 0;
  let lastStamp = 0;
  const stamp = () => {
    lastStamp = Math.max(now().getTime(), lastStamp + 1);
    return new Date(lastStamp).toISOString();
  };
  const nextId = () => `11111111-1111-4111-8111-${String(++ids).padStart(12, '0')}`;
  const blank = {
    last_error: null,
    resend_broadcast_id: null,
    recipient_count: null,
    sent_at: null,
    sent_by: null,
  };

  /** Changes a row only while it is in one of `from` (and unchanged since `ifUpdatedAt`), like the real update. */
  function guarded(id: string, from: IssueStatus[], patch: Partial<IssueRow>, ifUpdatedAt?: string): IssueRow | null {
    const row = rows.get(id);
    if (!row || !from.includes(row.status) || (ifUpdatedAt !== undefined && row.updated_at !== ifUpdatedAt)) return null;
    const next: IssueRow = { ...row, ...clone(patch), updated_at: stamp() };
    rows.set(id, next);
    return clone(next);
  }

  const summary = (r: IssueRow): IssueSummary => ({
    id: r.id,
    subject: r.subject,
    issue_date: r.issue_date,
    status: r.status,
    recipient_count: r.recipient_count,
    sent_at: r.sent_at,
    last_error: r.last_error,
    updated_at: r.updated_at,
  });

  const issues: IssuesDb = {
    async list() {
      return Array.from(rows.values())
        .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))
        .map(summary);
    },
    async get(id) {
      const row = rows.get(id);
      return row ? clone(row) : null;
    },
    async create(fields, actor) {
      const at = stamp();
      const row: IssueRow = {
        ...clone(fields),
        ...blank,
        id: nextId(),
        status: 'draft',
        created_by: actor,
        updated_by: actor,
        created_at: at,
        updated_at: at,
      };
      rows.set(row.id, row);
      return clone(row);
    },
    async saveDraft(id, fields, actor, ifUpdatedAt) {
      return guarded(id, ['draft'], { ...fields, updated_by: actor }, ifUpdatedAt);
    },
    async deleteDraft(id) {
      if (rows.get(id)?.status !== 'draft') return false;
      return rows.delete(id);
    },
    async lockForSend(id, actor) {
      return guarded(id, ['draft'], { status: 'sending', sent_by: actor, last_error: null });
    },
    async markSent(id, fields) {
      return guarded(id, ['sending', 'needs_check'], { ...fields, status: 'sent', last_error: null });
    },
    async backToDraft(id, error) {
      return guarded(id, ['sending', 'needs_check'], { status: 'draft', sent_by: null, last_error: error });
    },
    async markNeedsCheck(id, error) {
      return guarded(id, ['sending'], { status: 'needs_check', last_error: error });
    },
  };

  return {
    issues,
    rows,
    /** Puts an issue straight into the table, defaults filled in, for arranging a test. */
    seed(fields: Partial<IssueRow> = {}): IssueRow {
      const at = stamp();
      const row: IssueRow = {
        subject: '',
        preheader: '',
        issue_date: '2026-10-14',
        title: '',
        hero_image_url: null,
        hero_image_alt: '',
        body: { type: 'doc', content: [] },
        share_url: null,
        ...blank,
        id: nextId(),
        status: 'draft',
        created_by: ADMIN_EMAIL,
        updated_by: null,
        created_at: at,
        updated_at: at,
        ...clone(fields),
      };
      rows.set(row.id, row);
      return clone(row);
    },
    get(id: string): IssueRow | undefined {
      const row = rows.get(id);
      return row ? clone(row) : undefined;
    },
  };
}

/** Signed upload URLs that record the paths asked for. */
export function createFakeImages(imagesBase: string) {
  const paths: string[] = [];
  const storage: ImageStorage = {
    async createUploadUrl(path) {
      paths.push(path);
      const token = `token-${paths.length}`;
      return {
        path,
        token,
        signedUrl: `https://abc.supabase.co/storage/v1/object/upload/sign/newsletter-images/${path}?token=${token}`,
        publicUrl: `${imagesBase}/${path}`,
      };
    },
  };
  return { storage, paths };
}
```

8. Replace `makeDeps` with:

```ts
export function makeDeps(overrides: Partial<NewsletterDeps> = {}) {
  const clock = createClock();
  const memory = createMemoryDb(clock.now);
  const issueStore = createMemoryIssues(clock.now);
  const images = createFakeImages(IMAGES_BASE);
  const resend = createFakeResend();
  /** Every wait a handler asked for, in ms. The fake returns at once and leaves the clock alone. */
  const sleeps: number[] = [];
  const deps: NewsletterDeps = {
    db: memory.db,
    issues: issueStore.issues,
    images: images.storage,
    resend: resend.client,
    config: {
      segmentId: SEGMENT,
      fromEmail: 'Hope Trust <newsletter@hopetrustindia.com>',
      replyTo: 'frontoffice@hopetrustindia.com',
      siteUrl: SITE,
      imagesBase: IMAGES_BASE,
    },
    now: clock.now,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    verifyAdmin: (req) => (req.headers.get('authorization') === `Bearer ${ADMIN_TOKEN}` ? { email: ADMIN_EMAIL } : null),
    ...overrides,
  };
  return { deps, clock, memory, issueStore, images, resend, sleeps };
}
```

- [ ] **Step 7: Run the newsletter function suites**

Run: `npx vitest run tests/vitest/functions/newsletter/`

Expected: all pass, the new file included.

- [ ] **Step 8: Commit**

```bash
git add netlify/functions/_shared/newsletter-issues-db.mts netlify/functions/_shared/newsletter-deps.mts netlify/functions/_shared/newsletter-db.mts tests/vitest/functions/newsletter/fakes.ts tests/vitest/functions/newsletter/issues-db.test.ts
git commit -m "feat(newsletter): issues data layer with guarded status changes, and image upload URLs" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The issues API: list, open, create, save, delete, and photo upload URLs

**Files:**
- Create: `netlify/functions/_shared/newsletter-issues.mts`
- Test: `tests/vitest/functions/newsletter/issues.test.ts`

**Interfaces:**
- **Consumes:** `NewsletterDeps` (with `issues` and `images` from Task 4); `issueDraftSchema`, `todayInIndia`, `EMPTY_BODY` and `ISSUE_LIMITS` from Task 2; `jsonResponse`, `preflight`, `readJsonBody` and `clientIp` from `http.mts`.
- **Produces:** `handleAdminIssues(req, deps): Promise<Response>`. It answers:
  - `GET` → `{ issues: IssueSummary[], me, from, subscribed }`;
  - `GET ?id=` → `{ issue: IssueRow, me, from, subscribed }`; 404 if there's no such issue, 400 for a malformed id;
  - `POST` → 201 `{ issue }`, a new draft dated today in India;
  - `PATCH ?id=` with body `IssueDraft & { updated_at }` → `{ issue }`, or 409 `{ error, issue }` when the issue changed or is no longer a draft, or 400 `{ error }`;
  - `DELETE ?id=` → `{ ok: true }`, or 409 for an issue that isn't a draft;
  - `POST ?id=&action=upload-url` with body `{ content_type: 'image/jpeg' | 'image/png' }` → `{ path, token, signed_url, public_url }`.
  - `SENT_IS_READ_ONLY`, the 409 message for a sent issue.

- [ ] **Step 1: Write the failing tests**

`tests/vitest/functions/newsletter/issues.test.ts`:

```ts
// @vitest-environment node
import { afterEach, describe, it, expect, vi } from 'vitest';
import type { NewsletterDeps } from '@/netlify/functions/_shared/newsletter-deps.mts';
import { handleAdminIssues } from '@/netlify/functions/_shared/newsletter-issues.mts';
import { ADMIN_EMAIL, ADMIN_TOKEN, IMAGES_BASE, jsonRequest, makeDeps } from './fakes';

const BASE = 'https://hopetrustindia.com/api/admin-newsletter-issues';
const AUTH = { authorization: `Bearer ${ADMIN_TOKEN}` };
const MISSING = '22222222-2222-4222-8222-222222222222';
const BODY = {
  type: 'doc' as const,
  content: [{ type: 'paragraph' as const, content: [{ type: 'text' as const, text: 'Before you can love, you must know yourself.' }] }],
};
/** Everything a send needs. */
const READY = {
  subject: 'Know thyself',
  preheader: '',
  issue_date: '2026-10-14',
  title: 'Know Thyself: The Start of Every Relationship',
  hero_image_url: `${IMAGES_BASE}/issues/hero.jpg`,
  hero_image_alt: 'A person by a window',
  body: BODY,
  share_url: null,
};

afterEach(() => {
  vi.restoreAllMocks();
});

async function call(deps: NewsletterDeps, method: string, query = '', body?: unknown) {
  const res = await handleAdminIssues(jsonRequest(`${BASE}${query}`, method, body, AUTH), deps);
  return { status: res.status, body: await res.json() };
}

describe('admin-newsletter-issues', () => {
  it('needs an admin token', async () => {
    const { deps } = makeDeps();
    expect((await handleAdminIssues(new Request(BASE), deps)).status).toBe(401);
    expect((await handleAdminIssues(new Request(BASE, { method: 'OPTIONS' }), deps)).status).toBe(204);
    expect((await handleAdminIssues(jsonRequest(BASE, 'GET', undefined, AUTH), null)).status).toBe(500);
  });

  it('lists issues newest first, with who is signed in, the sender and the subscriber count', async () => {
    const t = makeDeps();
    t.memory.seed({ email: 'a@example.com', status: 'subscribed' });
    t.memory.seed({ email: 'b@example.com', status: 'pending' });
    const older = t.issueStore.seed({ subject: 'September' });
    t.clock.advance(60_000);
    const newer = t.issueStore.seed({ subject: 'October' });
    const { status, body } = await call(t.deps, 'GET');
    expect(status).toBe(200);
    expect(body.issues.map((i: { id: string }) => i.id)).toEqual([newer.id, older.id]);
    expect(body.issues[0]).not.toHaveProperty('body');
    expect(body).toMatchObject({ me: ADMIN_EMAIL, from: 'Hope Trust <newsletter@hopetrustindia.com>', subscribed: 1 });
  });

  it('creates a draft dated today in India', async () => {
    const t = makeDeps();
    t.clock.advance(9 * 60 * 60_000); // 19:00 UTC on 14 Oct is 00:30 on 15 Oct in India
    const { status, body } = await call(t.deps, 'POST');
    expect(status).toBe(201);
    expect(body.issue).toMatchObject({
      status: 'draft',
      issue_date: '2026-10-15',
      subject: '',
      body: { type: 'doc', content: [] },
      created_by: ADMIN_EMAIL,
    });
  });

  it('opens one issue, or says it is missing', async () => {
    const t = makeDeps();
    const issue = t.issueStore.seed(READY);
    const found = await call(t.deps, 'GET', `?id=${issue.id}`);
    expect(found.body.issue).toMatchObject(READY);
    expect(found.body.me).toBe(ADMIN_EMAIL);
    expect((await call(t.deps, 'GET', `?id=${MISSING}`)).status).toBe(404);
    expect((await call(t.deps, 'GET', '?id=nope')).status).toBe(400);
  });

  it('saves a draft, cleaning the body and the one-line fields', async () => {
    const t = makeDeps();
    const issue = t.issueStore.seed();
    const body = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Hi', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] },
        { type: 'codeBlock', content: [{ type: 'text', text: 'x' }] },
      ],
    };
    const res = await call(t.deps, 'PATCH', `?id=${issue.id}`, {
      ...READY,
      subject: '  Know thyself\n',
      body,
      updated_at: issue.updated_at,
    });
    expect(res.status).toBe(200);
    expect(res.body.issue.subject).toBe('Know thyself');
    expect(res.body.issue.body).toEqual({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] }] });
    expect(res.body.issue.updated_by).toBe(ADMIN_EMAIL);
    expect(res.body.issue.updated_at).not.toBe(issue.updated_at);
  });

  it('refuses to overwrite a save made after the editor loaded the issue', async () => {
    const t = makeDeps();
    const issue = t.issueStore.seed();
    const mine = await call(t.deps, 'PATCH', `?id=${issue.id}`, { ...READY, title: 'Mine', updated_at: issue.updated_at });
    expect(mine.status).toBe(200);
    const theirs = await call(t.deps, 'PATCH', `?id=${issue.id}`, { ...READY, title: 'Theirs', updated_at: issue.updated_at });
    expect(theirs.status).toBe(409);
    expect(theirs.body.error).toMatch(/Reload/);
    expect(theirs.body.issue.title).toBe('Mine');
    expect(t.issueStore.get(issue.id)?.title).toBe('Mine');
  });

  it('keeps sent issues read-only', async () => {
    const t = makeDeps();
    const issue = t.issueStore.seed({ ...READY, status: 'sent' });
    const res = await call(t.deps, 'PATCH', `?id=${issue.id}`, { ...READY, title: 'Changed', updated_at: issue.updated_at });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('This issue has been sent, so it can no longer be changed.');
    expect((await call(t.deps, 'POST', `?id=${issue.id}&action=upload-url`, { content_type: 'image/jpeg' })).status).toBe(409);
  });

  it.each([
    [{ subject: 'x'.repeat(151) }, 'The subject can be at most 150 characters.'],
    [{ issue_date: '2026-02-30' }, 'Choose a real date.'],
    [{ share_url: 'javascript:alert(1)' }, 'The Share link must be a web address, such as https://hopetrustindia.com/blogs/…'],
  ])('rejects %o', async (change, error) => {
    const t = makeDeps();
    const issue = t.issueStore.seed();
    const res = await call(t.deps, 'PATCH', `?id=${issue.id}`, { ...READY, ...change, updated_at: issue.updated_at });
    expect(res).toEqual({ status: 400, body: { error } });
  });

  it('deletes drafts only, and records it', async () => {
    const t = makeDeps();
    const draft = t.issueStore.seed({ subject: 'Old idea' });
    const sent = t.issueStore.seed({ ...READY, status: 'sent' });
    expect((await call(t.deps, 'DELETE', `?id=${draft.id}`)).status).toBe(200);
    expect(t.issueStore.get(draft.id)).toBeUndefined();
    expect(t.memory.audits).toContainEqual(
      expect.objectContaining({
        action: 'NEWSLETTER_ISSUE_DELETE',
        actorEmail: ADMIN_EMAIL,
        resourceType: 'newsletter_issue',
        resourceId: draft.id,
      }),
    );
    expect((await call(t.deps, 'DELETE', `?id=${sent.id}`)).status).toBe(409);
    expect(t.issueStore.get(sent.id)).toBeDefined();
    expect((await call(t.deps, 'DELETE', `?id=${MISSING}`)).status).toBe(404);
  });

  it("hands out an upload URL inside the issue's folder, for JPEG and PNG only", async () => {
    const t = makeDeps();
    const issue = t.issueStore.seed();
    const jpeg = await call(t.deps, 'POST', `?id=${issue.id}&action=upload-url`, { content_type: 'image/jpeg' });
    expect(jpeg.status).toBe(200);
    expect(jpeg.body.path).toMatch(new RegExp(`^issues/${issue.id}/[0-9a-f-]{36}\\.jpg$`));
    expect(jpeg.body.public_url).toBe(`${IMAGES_BASE}/${jpeg.body.path}`);
    expect(jpeg.body.token).toBe('token-1');
    const png = await call(t.deps, 'POST', `?id=${issue.id}&action=upload-url`, { content_type: 'image/png' });
    expect(png.body.path).toMatch(/\.png$/);
    expect((await call(t.deps, 'POST', `?id=${issue.id}&action=upload-url`, { content_type: 'image/webp' })).status).toBe(400);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/vitest/functions/newsletter/issues.test.ts`

Expected: it fails because `newsletter-issues.mts` doesn't exist.

- [ ] **Step 3: Write `netlify/functions/_shared/newsletter-issues.mts`**

```ts
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
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/vitest/functions/newsletter/issues.test.ts`

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_shared/newsletter-issues.mts tests/vitest/functions/newsletter/issues.test.ts
git commit -m "feat(newsletter): issues API: list, open, create, save with conflict check, delete drafts, photo upload URLs" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Test send, send, and Check status

**Files:**
- Modify: `netlify/functions/_shared/newsletter-issues.mts`
- Test: `tests/vitest/functions/newsletter/issues.test.ts`, where describe blocks are appended

**Interfaces:**
- **Consumes:**
  - `runSync` (`newsletter-sync.mts`);
  - `sendBroadcast`, `listBroadcasts`, `ResendError` and `BroadcastSummary` (Task 3);
  - `issueRenderOptions`, `sendProblems`, `broadcastName` and `broadcastMarker` (Task 2);
  - `renderIssueHtml` (`render.ts`) and `emailSchema` (`subscriber.ts`).
- **Produces:**
  - `POST ?id=&action=test` with body `{ to: string[] }` → `{ ok: true, to }`. It answers 400 for bad addresses and 502 when Resend fails.
  - `POST ?id=&action=send` → `{ issue }` (sent), or `{ issue, warning }` when the broadcast went out but recording it failed, or `{ error, issue, problems? }`:
    - 409: already sent or being sent, or subscriber changes not in Resend;
    - 400: problems;
    - 502: Resend refused (back to draft), or the answer was unclear (needs_check).
  - `POST ?id=&action=check` → `{ issue, found }`, or 409 with nothing to check (or still sending), or 502 when Resend can't be reached.
  - `STALE_SENDING_MS` (2 minutes).

- [ ] **Step 1: Write the failing tests**

Change the import lines at the top of `issues.test.ts` to:

```ts
import type { NewsletterDeps } from '@/netlify/functions/_shared/newsletter-deps.mts';
import { handleAdminIssues } from '@/netlify/functions/_shared/newsletter-issues.mts';
import { ResendError } from '@/netlify/functions/_shared/resend.mts';
import type { BodyDoc } from '@/lib/newsletter/content';
import { ADMIN_EMAIL, ADMIN_TOKEN, IMAGES_BASE, SEGMENT, jsonRequest, makeDeps } from './fakes';
```

Append:

```ts
/** An issue ready to go, and one subscriber whose consent hasn't reached Resend yet. */
function ready() {
  const t = makeDeps();
  t.memory.seed({ email: 'asha@example.com', status: 'subscribed', consent_at: '2026-10-01T00:00:00.000Z' });
  const issue = t.issueStore.seed(READY);
  return { ...t, issue };
}

describe('test send', () => {
  it('emails the test version to up to five addresses, with [TEST] in the subject', async () => {
    const t = makeDeps();
    const issue = t.issueStore.seed(READY);
    const res = await call(t.deps, 'POST', `?id=${issue.id}&action=test`, {
      to: [' Asha@Example.com ', 'asha@example.com', 'ravi@example.com'],
    });
    expect(res).toEqual({ status: 200, body: { ok: true, to: ['asha@example.com', 'ravi@example.com'] } });
    expect(t.resend.sent).toHaveLength(1);
    const email = t.resend.sent[0];
    expect(email).toMatchObject({
      from: 'Hope Trust <newsletter@hopetrustindia.com>',
      to: ['asha@example.com', 'ravi@example.com'],
      replyTo: 'frontoffice@hopetrustindia.com',
      subject: '[TEST] Know thyself',
    });
    expect(email.html).toContain('Know Thyself: The Start of Every Relationship');
    expect(email.html).not.toContain('{{{RESEND_UNSUBSCRIBE_URL}}}');
    expect(t.memory.audits).toContainEqual(
      expect.objectContaining({ action: 'NEWSLETTER_TEST_SEND', resourceId: issue.id, metadata: { recipients: 2 } }),
    );
  });

  it.each([
    [{ to: [] }, 'Add at least one address.'],
    [{ to: ['a@x.com', 'b@x.com', 'c@x.com', 'd@x.com', 'e@x.com', 'f@x.com'] }, 'Send a test to at most 5 addresses.'],
    [{ to: ['not-an-address'] }, '"not-an-address" isn\'t a valid email address.'],
  ])('refuses %o', async (body, error) => {
    const t = makeDeps();
    const issue = t.issueStore.seed(READY);
    expect(await call(t.deps, 'POST', `?id=${issue.id}&action=test`, body)).toEqual({ status: 400, body: { error } });
    expect(t.resend.sent).toHaveLength(0);
  });

  it('says so when Resend fails', async () => {
    const t = makeDeps();
    const issue = t.issueStore.seed(READY);
    t.resend.failNext('sendEmail');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await call(t.deps, 'POST', `?id=${issue.id}&action=test`, { to: ['asha@example.com'] });
    expect(res).toEqual({ status: 502, body: { error: "Resend didn't send the test: Resend is down" } });
  });
});

describe('send', () => {
  it('syncs, then sends the send version to the Newsletter segment as one broadcast', async () => {
    const t = ready();
    const res = await call(t.deps, 'POST', `?id=${t.issue.id}&action=send`);
    expect(res.status).toBe(200);
    expect(res.body.issue).toMatchObject({
      status: 'sent',
      resend_broadcast_id: 'broadcast-1',
      recipient_count: 1,
      sent_by: ADMIN_EMAIL,
      sent_at: '2026-10-14T10:00:00.000Z',
      last_error: null,
    });
    // The subscriber reached Resend before the broadcast went out.
    expect(t.resend.calls.indexOf('createContact')).toBeLessThan(t.resend.calls.indexOf('sendBroadcast'));
    const [broadcast] = t.resend.broadcasts;
    expect(broadcast.input).toMatchObject({
      segmentId: SEGMENT,
      from: 'Hope Trust <newsletter@hopetrustindia.com>',
      replyTo: 'frontoffice@hopetrustindia.com',
      subject: 'Know thyself',
      name: `Know thyself [issue ${t.issue.id}]`,
    });
    expect(broadcast.input?.html).toContain('{{{RESEND_UNSUBSCRIBE_URL}}}');
    expect(t.memory.audits).toContainEqual(
      expect.objectContaining({
        action: 'NEWSLETTER_SEND',
        resourceId: t.issue.id,
        metadata: { broadcast_id: 'broadcast-1', recipients: 1 },
      }),
    );
  });

  it('lets only one of two simultaneous sends through', async () => {
    const t = ready();
    const [a, b] = await Promise.all([
      call(t.deps, 'POST', `?id=${t.issue.id}&action=send`),
      call(t.deps, 'POST', `?id=${t.issue.id}&action=send`),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(t.resend.broadcasts).toHaveLength(1);
  });

  it.each([
    ['there is no hero photo', { hero_image_url: null }, 'Add a hero photo.'],
    ['the photo has no description', { hero_image_alt: '' }, "Describe the hero photo for people who can't see it."],
    ['the subject is empty', { subject: '' }, 'Add a subject.'],
    ['the title is blank', { title: ' ' }, 'Add a title.'],
  ])('puts the issue back when %s', async (_why, change, problem) => {
    const t = makeDeps();
    t.memory.seed({ email: 'asha@example.com', status: 'subscribed' });
    const issue = t.issueStore.seed({ ...READY, ...change });
    const res = await call(t.deps, 'POST', `?id=${issue.id}&action=send`);
    expect(res.status).toBe(400);
    expect(res.body.problems).toEqual([problem]);
    expect(res.body.issue).toMatchObject({ status: 'draft', last_error: problem, sent_by: null });
    expect(t.resend.broadcasts).toHaveLength(0);
  });

  it('refuses when there is nobody to send to', async () => {
    const t = makeDeps();
    const issue = t.issueStore.seed(READY);
    const res = await call(t.deps, 'POST', `?id=${issue.id}&action=send`);
    expect(res.body.problems).toEqual(['There are no subscribers to send to.']);
    expect(t.issueStore.get(issue.id)?.status).toBe('draft');
  });

  it('refuses an email over the size limit', async () => {
    const t = ready();
    const long: BodyDoc = {
      type: 'doc',
      content: Array.from({ length: 400 }, (_, n) => ({
        type: 'paragraph' as const,
        content: [{ type: 'text' as const, text: `${n} ${'word '.repeat(60)}` }],
      })),
    };
    const issue = t.issueStore.seed({ ...READY, body: long });
    const res = await call(t.deps, 'POST', `?id=${issue.id}&action=send`);
    expect(res.status).toBe(400);
    expect(res.body.problems[0]).toMatch(/^The email is \d+\.\d KB, over the 95\.0 KB limit/);
    expect(t.resend.broadcasts).toHaveLength(0);
  });

  it("sends nothing while a subscriber change can't reach Resend, and names it", async () => {
    const t = ready();
    t.resend.failNext('createContact', new ResendError(422, 'validation_error', 'Invalid email'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await call(t.deps, 'POST', `?id=${t.issue.id}&action=send`);
    expect(res.status).toBe(409);
    expect(res.body.error).toContain("1 subscriber change hasn't reached Resend yet, so nothing was sent.");
    expect(res.body.error).toContain('asha@example.com: Invalid email');
    expect(res.body.issue.status).toBe('draft');
    expect(t.resend.broadcasts).toHaveLength(0);
  });

  it('puts the issue back when Resend refuses the broadcast', async () => {
    const t = ready();
    t.resend.failNext('sendBroadcast', new ResendError(422, 'validation_error', 'The from address is not verified'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await call(t.deps, 'POST', `?id=${t.issue.id}&action=send`);
    expect(res.status).toBe(502);
    expect(res.body.issue).toMatchObject({
      status: 'draft',
      last_error: 'Resend refused the newsletter, so nothing was sent: The from address is not verified',
    });
  });

  it("waits for Check status when Resend's answer is unclear, and won't send again meanwhile", async () => {
    const t = ready();
    t.resend.failNext('sendBroadcast');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await call(t.deps, 'POST', `?id=${t.issue.id}&action=send`);
    expect(res.status).toBe(502);
    expect(res.body.issue.status).toBe('needs_check');
    expect(res.body.error).toMatch(/Check status/);
    const again = await call(t.deps, 'POST', `?id=${t.issue.id}&action=send`);
    expect(again.status).toBe(409);
    expect(t.resend.calls.filter((c) => c === 'sendBroadcast')).toHaveLength(1);
  });

  it('never puts back an issue that went out, even if recording it fails', async () => {
    const t = ready();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const deps: NewsletterDeps = {
      ...t.deps,
      issues: {
        ...t.deps.issues,
        markSent: async () => {
          throw new Error('Supabase is down');
        },
      },
    };
    const res = await call(deps, 'POST', `?id=${t.issue.id}&action=send`);
    expect(res.status).toBe(200);
    expect(res.body.warning).toMatch(/Check status/);
    expect(t.issueStore.get(t.issue.id)?.status).toBe('sending');
  });
});

describe('check status', () => {
  it('marks the issue sent when Resend has the broadcast', async () => {
    const t = ready();
    t.resend.loseNextReply();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await call(t.deps, 'POST', `?id=${t.issue.id}&action=send`)).body.issue.status).toBe('needs_check');
    const res = await call(t.deps, 'POST', `?id=${t.issue.id}&action=check`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      found: true,
      issue: { status: 'sent', resend_broadcast_id: 'broadcast-1', recipient_count: 1 },
    });
    expect(t.memory.audits).toContainEqual(
      expect.objectContaining({ action: 'NEWSLETTER_SEND_CONFIRMED', resourceId: t.issue.id }),
    );
  });

  it('puts the issue back when Resend has no such broadcast', async () => {
    const t = makeDeps();
    const issue = t.issueStore.seed({ ...READY, status: 'needs_check' });
    t.resend.addBroadcast({ name: `Other [issue ${MISSING}]`, status: 'sent' });
    t.resend.addBroadcast({ name: `Know thyself [issue ${issue.id}]`, status: 'draft' });
    const res = await call(t.deps, 'POST', `?id=${issue.id}&action=check`);
    expect(res.body).toMatchObject({ found: false, issue: { status: 'draft' } });
    expect(res.body.issue.last_error).toMatch(/no record of this send/);
  });

  it('looks through every page of broadcasts', async () => {
    const t = makeDeps();
    const issue = t.issueStore.seed({ ...READY, status: 'needs_check' });
    t.resend.addBroadcast({ name: `Know thyself [issue ${issue.id}]`, status: 'sent' });
    for (let n = 0; n < 150; n++) t.resend.addBroadcast({ name: `Old ${n}`, status: 'sent' });
    expect((await call(t.deps, 'POST', `?id=${issue.id}&action=check`)).body.found).toBe(true);
    expect(t.resend.calls.filter((c) => c === 'listBroadcasts')).toHaveLength(2);
  });

  it('lets a send that went quiet be checked after two minutes, not before', async () => {
    const t = makeDeps();
    const issue = t.issueStore.seed({ ...READY, status: 'sending' });
    const early = await call(t.deps, 'POST', `?id=${issue.id}&action=check`);
    expect(early.status).toBe(409);
    expect(early.body.error).toBe('This issue is still being sent. Check again in two minutes.');
    t.clock.advance(2 * 60_000);
    const later = await call(t.deps, 'POST', `?id=${issue.id}&action=check`);
    expect(later.body).toMatchObject({ found: false, issue: { status: 'draft' } });
  });

  it('has nothing to check on a draft', async () => {
    const t = makeDeps();
    const issue = t.issueStore.seed(READY);
    expect((await call(t.deps, 'POST', `?id=${issue.id}&action=check`)).status).toBe(409);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/vitest/functions/newsletter/issues.test.ts`

Expected: the new tests fail with 405 ("Method not allowed") where they expect 200, 400 or 502.

- [ ] **Step 3: Extend the imports and the router**

Replace the imports from `../../../lib/newsletter/issue`, and add the new ones:

```ts
import { renderIssueHtml } from '../../../lib/newsletter/render';
import {
  EMPTY_BODY,
  ISSUE_LIMITS,
  broadcastMarker,
  broadcastName,
  issueDraftSchema,
  issueRenderOptions,
  sendProblems,
  todayInIndia,
  type IssueRow,
} from '../../../lib/newsletter/issue';
import { emailSchema } from '../../../lib/newsletter/subscriber';
```

and, after the `newsletter-deps.mts` import:

```ts
import { runSync } from './newsletter-sync.mts';
import { ResendError, type BroadcastSummary } from './resend.mts';
```

After the `SENT_IS_READ_ONLY` line, add:

```ts
/** A send still unfinished after this long may have been stopped by Netlify; Check status can then resolve it. */
export const STALE_SENDING_MS = 2 * 60_000;
/** The send's own push to Resend. The Send dialog syncs first, so this only catches late changes. */
const SEND_SYNC_BUDGET_MS = 4000;
const MAX_BROADCAST_PAGES = 20;
const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));
```

After `uploadSchema`, add:

```ts
const testSchema = z.object({
  to: z
    .array(z.string())
    .min(1, 'Add at least one address.')
    .max(ISSUE_LIMITS.testRecipients, `Send a test to at most ${ISSUE_LIMITS.testRecipients} addresses.`),
});
```

In the router, after the `upload-url` line, add:

```ts
    if (req.method === 'POST' && id && action === 'test') return await testSend(ctx);
    if (req.method === 'POST' && id && action === 'send') return await send(ctx);
    if (req.method === 'POST' && id && action === 'check') return await checkStatus(ctx);
```

- [ ] **Step 4: Append the three handlers to the end of the file**

```ts
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

  const { html } = renderIssueHtml(issue, issueRenderOptions(deps.config.imagesBase, 'test'));
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
 * Sends the issue to every subscriber (spec §9.1). The guarded lock lets one
 * send through. After it, every way out either finishes the issue or puts it
 * back to draft. The exception is an unclear answer from Resend: that waits
 * for Check status, so an issue can never go out twice.
 */
async function send({ req, deps, admin, id, reply }: Ctx): Promise<Response> {
  const locked = await deps.issues.lockForSend(id, admin.email);
  if (!locked) {
    const current = await deps.issues.get(id);
    if (!current) return reply({ error: 'Issue not found' }, 404);
    const error = current.status === 'sent' ? 'This issue has already been sent.' : 'This issue is already being sent.';
    return reply({ error, issue: current }, 409);
  }
  const giveBack = async (status: number, error: string, extra: Record<string, unknown> = {}) => {
    const issue = await deps.issues.backToDraft(id, error);
    return reply({ error, ...extra, issue }, status);
  };

  const options = issueRenderOptions(deps.config.imagesBase, 'send');
  let html = '';
  let subscribed = 0;
  try {
    // Step 3: our unsubscribes and deletes must reach Resend before it sends.
    const sync = await runSync(deps, { pull: false, deadline: deps.now().getTime() + SEND_SYNC_BUDGET_MS });
    if (sync.remaining > 0) {
      const said = sync.errors.length > 0 ? ` Resend said: ${sync.errors.join('; ')}.` : '';
      const changes = sync.remaining === 1 ? "1 subscriber change hasn't" : `${sync.remaining} subscriber changes haven't`;
      return await giveBack(
        409,
        `${changes} reached Resend yet, so nothing was sent.${said} Try again in a minute. If it keeps happening, unsubscribe or delete those people on the Subscribers screen.`,
      );
    }
    // Step 4, with the blocks of §8.1.
    subscribed = (await deps.db.counts()).subscribed;
    const rendered = renderIssueHtml(locked, options);
    html = rendered.html;
    const problems = sendProblems({ issue: locked, html, bytes: rendered.bytes, subscribed, imagePrefixes: options.imagePrefixes });
    if (problems.length > 0) return await giveBack(400, problems.join(' '), { problems });
  } catch (err) {
    console.error('[admin-newsletter-issues] before sending', err);
    return giveBack(502, `Nothing was sent: ${errorText(err)}. Try again in a minute.`);
  }

  // Step 5.
  let broadcastId: string;
  try {
    broadcastId = await deps.resend.sendBroadcast({
      segmentId: deps.config.segmentId,
      from: deps.config.fromEmail,
      replyTo: deps.config.replyTo,
      subject: locked.subject.trim(),
      html,
      name: broadcastName(locked),
    });
  } catch (err) {
    console.error('[admin-newsletter-issues] send', err);
    if (err instanceof ResendError && err.status >= 400 && err.status < 500) {
      // Step 7: Resend said no, so nothing went out.
      return giveBack(502, `Resend refused the newsletter, so nothing was sent: ${err.message}`);
    }
    // Step 8: it may or may not have gone out.
    const error =
      "We couldn't confirm whether Resend sent this issue. Wait a minute, then press Check status. Don't send it again before that.";
    const issue = await deps.issues.markNeedsCheck(id, error);
    return reply({ error, issue }, 502);
  }

  // Step 6. It went out, so from here nothing may put it back to draft.
  let issue: IssueRow | null = null;
  try {
    issue = await deps.issues.markSent(id, {
      resend_broadcast_id: broadcastId,
      recipient_count: subscribed,
      sent_at: deps.now().toISOString(),
    });
  } catch (err) {
    console.error('[admin-newsletter-issues] recording a sent issue', err);
  }
  await deps.db.audit({
    action: 'NEWSLETTER_SEND',
    actorEmail: admin.email,
    resourceType: 'newsletter_issue',
    resourceId: id,
    metadata: { broadcast_id: broadcastId, recipients: subscribed },
    ip: clientIp(req),
  });
  if (!issue) {
    return reply({
      issue: locked,
      warning: "It was sent, but we couldn't record that here. Press Check status in a few minutes to update this page.",
    });
  }
  return reply({ issue });
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

/** The newest broadcast whose name holds `marker`, among those Resend went on to send. */
async function findBroadcast(deps: NewsletterDeps, marker: string): Promise<BroadcastSummary | null> {
  let after: string | undefined;
  for (let page = 0; page < MAX_BROADCAST_PAGES; page++) {
    const { broadcasts, hasMore } = await deps.resend.listBroadcasts(after);
    const match = broadcasts.find((b) => b.name.includes(marker) && b.status !== 'draft');
    if (match) return match;
    if (!hasMore || broadcasts.length === 0) return null;
    after = broadcasts[broadcasts.length - 1].id;
  }
  return null;
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/vitest/functions/newsletter/`

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add netlify/functions/_shared/newsletter-issues.mts tests/vitest/functions/newsletter/issues.test.ts
git commit -m "feat(newsletter): test send, send to subscribers and Check status (spec 9.1)" -m "One send gets through the lock. A refused send goes back to draft, an unclear one waits for Check status, and one that went out is never put back." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The function and its `/api` route

**Files:**
- Create: `netlify/functions/admin-newsletter-issues.mts`
- Modify: `netlify.toml`, adding a redirect after the `admin-newsletter-subscribers` one
- Test: `tests/vitest/config/api-redirects.test.ts` (existing, unchanged), and a bundling check

**Interfaces:**
- **Consumes:** `handleAdminIssues` (Tasks 5–6) and `liveDeps`.
- **Produces:** `/api/admin-newsletter-issues` → `/.netlify/functions/admin-newsletter-issues`.

- [ ] **Step 1: Write the function entry**

`netlify/functions/admin-newsletter-issues.mts`:

```ts
// /api/admin-newsletter-issues: write, preview, test and send newsletter
// issues (spec §8.1, §9, §11). Admin JWT required.
import { liveDeps } from './_shared/newsletter-deps.mts';
import { handleAdminIssues } from './_shared/newsletter-issues.mts';

export default (req: Request) => handleAdminIssues(req, liveDeps());
```

- [ ] **Step 2: Add the redirect**

In `netlify.toml`, after the block for `/api/admin-newsletter-subscribers`, add:

```toml

[[redirects]]
  from = "/api/admin-newsletter-issues"
  to = "/.netlify/functions/admin-newsletter-issues"
  status = 200
```

- [ ] **Step 3: Check that Netlify bundles it**

Run:

```bash
npx netlify functions:build --src netlify/functions --functions .superpowers/sdd/2026-10-14-newsletter-phase-3-issues/fn-build
ls .superpowers/sdd/2026-10-14-newsletter-phase-3-issues/fn-build
```

Expected: `admin-newsletter-issues.zip` sits next to the three newsletter zips from plan 2, and no `_shared` artifact appears. The CLI's "Path should come before header" lines are about the existing `public/_headers` file, and can be ignored.

- [ ] **Step 4: Run the redirect test**

Run: `npx vitest run tests/vitest/config/api-redirects.test.ts`

Expected: it passes. The client that fetches this path arrives in Task 8, and the test checks it then.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/admin-newsletter-issues.mts netlify.toml
git commit -m "feat(newsletter): admin-newsletter-issues function and its /api route" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The browser side: issues API client and photo upload

**Files:**
- Modify: `lib/newsletter-admin.ts`, appending the issues client
- Create: `lib/newsletter/issue-image.ts`
- Test: `tests/vitest/lib/newsletter-admin-issues.test.ts`, `tests/vitest/lib/newsletter/issue-image.test.ts`

**Interfaces:**
- **Consumes:** the API of Tasks 5–6; `IssueRow` and `IssueSummary` (Task 2).
- **Produces:**
  - **From `lib/newsletter-admin.ts`:**
    - **Types and error:** `IssueApiError` (with `status`, `issue: IssueRow | null` and `problems: string[]`), `IssueContext` (`{ me, from, subscribed }`), `IssueList`, `IssueDetail`, `IssueDraftInput`, `UploadTicket`.
    - **Functions:**
      - `listIssues(token)` and `getIssue(token, id)`;
      - `createIssue(token): IssueRow`;
      - `saveIssue(token, id, draft, updatedAt): IssueRow`;
      - `deleteIssue(token, id)`;
      - `issueUploadUrl(token, id, contentType)`;
      - `sendTestIssue(token, id, to): string[]`;
      - `sendIssue(token, id): { issue, warning? }`;
      - `checkIssue(token, id): { issue, found }`.
  - **From `lib/newsletter/issue-image.ts`:**
    - `MAX_UPLOAD_BYTES`, `MAX_IMAGE_WIDTH` and `ImageError`;
    - `targetSize(w, h)`, `outputType(type)`, `checkImageFile(file)`, `prepareImage(file): PreparedImage`;
    - `uploadIssueImage(token, issueId, file, deps?): Promise<string>`, which returns the public URL.

- [ ] **Step 1: Write the failing tests**

`tests/vitest/lib/newsletter-admin-issues.test.ts`:

```ts
import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  IssueApiError,
  UnauthorizedError,
  checkIssue,
  createIssue,
  saveIssue,
  sendIssue,
  sendTestIssue,
} from '@/lib/newsletter-admin';

afterEach(() => {
  vi.unstubAllGlobals();
});

function respond(status: number, body: unknown) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const DRAFT = {
  subject: 'S',
  preheader: '',
  issue_date: '2026-10-14',
  title: 'T',
  hero_image_url: null,
  hero_image_alt: '',
  body: { type: 'doc' as const, content: [] },
  share_url: null,
};

describe('the issues API client', () => {
  it('saves the whole draft with the version it was loaded at', async () => {
    const fetchMock = respond(200, { issue: { id: 'i', ...DRAFT } });
    await saveIssue('tkn', 'i', DRAFT, '2026-10-14T10:00:00.000Z');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin-newsletter-issues?id=i',
      expect.objectContaining({
        method: 'PATCH',
        headers: { Authorization: 'Bearer tkn', 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...DRAFT, updated_at: '2026-10-14T10:00:00.000Z' }),
      }),
    );
  });

  it('creates, tests, sends and checks with POSTs to the right actions', async () => {
    const fetchMock = respond(200, { issue: { id: 'i' }, to: ['a@x.com'], found: true });
    await createIssue('tkn');
    await sendTestIssue('tkn', 'i', ['a@x.com']);
    await sendIssue('tkn', 'i');
    await checkIssue('tkn', 'i');
    expect(fetchMock.mock.calls.map(([url, init]) => `${init?.method} ${url}`)).toEqual([
      'POST /api/admin-newsletter-issues?',
      'POST /api/admin-newsletter-issues?id=i&action=test',
      'POST /api/admin-newsletter-issues?id=i&action=send',
      'POST /api/admin-newsletter-issues?id=i&action=check',
    ]);
  });

  it('passes on the issue and the problems when the server refuses', async () => {
    respond(400, { error: 'Add a title.', problems: ['Add a title.'], issue: { id: 'i', status: 'draft' } });
    const err = await sendIssue('tkn', 'i').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(IssueApiError);
    expect(err).toMatchObject({
      message: 'Add a title.',
      status: 400,
      problems: ['Add a title.'],
      issue: { id: 'i', status: 'draft' },
    });
  });

  it('reports an expired session', async () => {
    respond(401, { error: 'Unauthorized' });
    await expect(createIssue('tkn')).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
```

`tests/vitest/lib/newsletter/issue-image.test.ts`:

```ts
import { afterEach, describe, it, expect, vi } from 'vitest';
import { ImageError, checkImageFile, outputType, targetSize, uploadIssueImage } from '@/lib/newsletter/issue-image';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('targetSize', () => {
  it('shrinks a wide photo to 1,200 px, keeping its shape, and leaves a smaller one alone', () => {
    expect(targetSize(4000, 3000)).toEqual({ width: 1200, height: 900 });
    expect(targetSize(1200, 50)).toEqual({ width: 1200, height: 50 });
    expect(targetSize(800, 1200)).toEqual({ width: 800, height: 1200 });
    expect(targetSize(100_000, 10)).toEqual({ width: 1200, height: 1 });
  });
});

describe('outputType', () => {
  it('keeps PNG, and turns everything else into JPEG, never WebP', () => {
    expect(outputType('image/png')).toBe('image/png');
    expect(outputType('image/webp')).toBe('image/jpeg');
    expect(outputType('image/heic')).toBe('image/jpeg');
    expect(outputType('image/jpeg')).toBe('image/jpeg');
  });
});

describe('checkImageFile', () => {
  it('turns away a file that is not a photo, or is over 5 MB', () => {
    expect(() => checkImageFile(new File(['x'], 'notes.pdf', { type: 'application/pdf' }))).toThrow(ImageError);
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'big.jpg', { type: 'image/jpeg' });
    expect(() => checkImageFile(big)).toThrow('That photo is over 5 MB');
    expect(() => checkImageFile(new File(['x'], 'ok.jpg', { type: 'image/jpeg' }))).not.toThrow();
  });
});

describe('uploadIssueImage', () => {
  it('asks for an upload URL for the prepared type, uploads to it, and returns the public address', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(
          JSON.stringify({ path: 'issues/i/a.png', token: 'tok', signed_url: 'https://x/sign', public_url: 'https://x/public/issues/i/a.png' }),
          { status: 200 },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const image = { blob: new Blob(['png']), type: 'image/png' as const, width: 10, height: 10 };
    const upload = vi.fn(async () => {});
    const url = await uploadIssueImage('tkn', 'i', new File(['x'], 'a.png', { type: 'image/png' }), {
      prepare: async () => image,
      upload,
    });
    expect(url).toBe('https://x/public/issues/i/a.png');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin-newsletter-issues?id=i&action=upload-url',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ content_type: 'image/png' }) }),
    );
    expect(upload).toHaveBeenCalledWith('issues/i/a.png', 'tok', image);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/vitest/lib/newsletter-admin-issues.test.ts tests/vitest/lib/newsletter/issue-image.test.ts`

Expected: they fail on the missing exports and the missing module.

- [ ] **Step 3: Append the issues client to `lib/newsletter-admin.ts`**

Add to the imports at the top:

```ts
import type { IssueRow, IssueSummary } from '@/lib/newsletter/issue';
```

Append at the end of the file:

```ts
// =============================================================================
// Issues: /api/admin-newsletter-issues (spec §8.1, §11)
// =============================================================================

/** An error from the issues API, with the issue as it now stands when the server sent it. */
export class IssueApiError extends Error {
  readonly status: number;
  readonly issue: IssueRow | null;
  readonly problems: string[];

  constructor(message: string, status: number, issue: IssueRow | null, problems: string[]) {
    super(message);
    this.name = 'IssueApiError';
    this.status = status;
    this.issue = issue;
    this.problems = problems;
  }
}

/** Who is signed in, the sender, and how many people a send reaches. */
export interface IssueContext {
  me: string;
  from: string;
  subscribed: number;
}

export interface IssueList extends IssueContext {
  issues: IssueSummary[];
}

export interface IssueDetail extends IssueContext {
  issue: IssueRow;
}

export type IssueDraftInput = Pick<
  IssueRow,
  'subject' | 'preheader' | 'issue_date' | 'title' | 'hero_image_url' | 'hero_image_alt' | 'body' | 'share_url'
>;

export interface UploadTicket {
  path: string;
  token: string;
  signed_url: string;
  public_url: string;
}

async function issuesCall<T>(token: string, query: string, init: RequestInit = {}): Promise<T> {
  // The literal path ends at "?", so tests/vitest/config/api-redirects.test.ts
  // can check that netlify.toml routes it.
  const res = await fetch(`/api/admin-newsletter-issues?${query}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    cache: 'no-store',
  });
  if (res.status === 401) throw new UnauthorizedError();
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new IssueApiError(
      body.error || `Request failed (${res.status})`,
      res.status,
      body.issue ?? null,
      Array.isArray(body.problems) ? body.problems : [],
    );
  }
  return body as T;
}

const post = (body?: unknown): RequestInit => (body === undefined ? { method: 'POST' } : { method: 'POST', body: JSON.stringify(body) });

export function listIssues(token: string): Promise<IssueList> {
  return issuesCall(token, '');
}

export function getIssue(token: string, id: string): Promise<IssueDetail> {
  return issuesCall(token, queryString({ id }));
}

export async function createIssue(token: string): Promise<IssueRow> {
  return (await issuesCall<{ issue: IssueRow }>(token, '', post())).issue;
}

/** Saves every field, guarded by the version the editor loaded (`updatedAt`). */
export async function saveIssue(token: string, id: string, draft: IssueDraftInput, updatedAt: string): Promise<IssueRow> {
  const body = await issuesCall<{ issue: IssueRow }>(token, queryString({ id }), {
    method: 'PATCH',
    body: JSON.stringify({ ...draft, updated_at: updatedAt }),
  });
  return body.issue;
}

export async function deleteIssue(token: string, id: string): Promise<void> {
  await issuesCall(token, queryString({ id }), { method: 'DELETE' });
}

export function issueUploadUrl(token: string, id: string, contentType: 'image/jpeg' | 'image/png'): Promise<UploadTicket> {
  return issuesCall(token, queryString({ id, action: 'upload-url' }), post({ content_type: contentType }));
}

/** Returns the addresses the test went to. */
export async function sendTestIssue(token: string, id: string, to: string[]): Promise<string[]> {
  return (await issuesCall<{ to: string[] }>(token, queryString({ id, action: 'test' }), post({ to }))).to;
}

/** Sends to every subscriber. `warning` is set when it went out but couldn't be recorded. */
export function sendIssue(token: string, id: string): Promise<{ issue: IssueRow; warning?: string }> {
  return issuesCall(token, queryString({ id, action: 'send' }), post());
}

export function checkIssue(token: string, id: string): Promise<{ issue: IssueRow; found: boolean }> {
  return issuesCall(token, queryString({ id, action: 'check' }), post());
}
```

- [ ] **Step 4: Write `lib/newsletter/issue-image.ts`**

```ts
// Photos for an issue (spec §6.4, §10.4). Each is resized in the browser to
// at most 1,200 px wide and saved as JPEG, or PNG when the original is a PNG,
// never WebP. Then it goes to the image bucket through a signed upload URL.

import { issueUploadUrl } from '@/lib/newsletter-admin';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_WIDTH = 1200;
const JPEG_QUALITY = 0.85;
/** Every upload gets a new file name, so a photo can be cached for a year. */
const CACHE_SECONDS = '31536000';

export class ImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageError';
  }
}

export interface PreparedImage {
  blob: Blob;
  type: 'image/jpeg' | 'image/png';
  width: number;
  height: number;
}

export function targetSize(width: number, height: number, maxWidth = MAX_IMAGE_WIDTH): { width: number; height: number } {
  if (width <= maxWidth) return { width, height };
  return { width: maxWidth, height: Math.max(1, Math.round((height * maxWidth) / width)) };
}

export function outputType(inputType: string): 'image/jpeg' | 'image/png' {
  return inputType === 'image/png' ? 'image/png' : 'image/jpeg';
}

/** Checks a chosen file before any work. Throws ImageError with a message for staff. */
export function checkImageFile(file: File): void {
  if (!file.type.startsWith('image/')) throw new ImageError('Choose a photo: a JPEG or PNG file.');
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ImageError('That photo is over 5 MB. Choose a smaller one, or export it at a smaller size.');
  }
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  checkImageFile(file);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ImageError("That file couldn't be opened as a photo. Try a JPEG or PNG.");
  }
  const size = targetSize(bitmap.width, bitmap.height);
  const type = outputType(file.type);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) throw new ImageError("This browser couldn't resize the photo. Try another browser.");
  if (type === 'image/jpeg') {
    // JPEG has no transparency: a transparent area becomes white, not black.
    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, size.width, size.height);
  }
  context.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, type, type === 'image/jpeg' ? JPEG_QUALITY : undefined),
  );
  if (!blob) throw new ImageError("This browser couldn't resize the photo. Try another browser.");
  return { blob, type, ...size };
}

export interface UploadDeps {
  prepare?: (file: File) => Promise<PreparedImage>;
  upload?: (path: string, token: string, image: PreparedImage) => Promise<void>;
}

async function uploadToBucket(path: string, token: string, image: PreparedImage): Promise<void> {
  // Imported here, not at the top: lib/supabase reads the public env vars as it loads.
  const { supabase } = await import('@/lib/supabase');
  const { error } = await supabase.storage
    .from('newsletter-images')
    .uploadToSignedUrl(path, token, image.blob, { contentType: image.type, cacheControl: CACHE_SECONDS });
  if (error) throw new ImageError(`The photo didn't upload: ${error.message}`);
}

/** Resizes and uploads a photo for the issue, and returns its public address. */
export async function uploadIssueImage(token: string, issueId: string, file: File, deps: UploadDeps = {}): Promise<string> {
  const image = await (deps.prepare ?? prepareImage)(file);
  const ticket = await issueUploadUrl(token, issueId, image.type);
  await (deps.upload ?? uploadToBucket)(ticket.path, ticket.token, image);
  return ticket.public_url;
}
```

- [ ] **Step 5: Run the tests, the redirect check and tsc**

Run:

```bash
npx vitest run tests/vitest/lib/newsletter-admin-issues.test.ts tests/vitest/lib/newsletter/issue-image.test.ts tests/vitest/lib/newsletter-admin.test.ts tests/vitest/config/api-redirects.test.ts
npx tsc --noEmit -p tsconfig.json
```

Expected: all pass, and tsc reports 0 errors.

- [ ] **Step 6: Commit**

```bash
git add lib/newsletter-admin.ts lib/newsletter/issue-image.ts tests/vitest/lib/newsletter-admin-issues.test.ts tests/vitest/lib/newsletter/issue-image.test.ts
git commit -m "feat(newsletter): issues API client, and photo resize and upload in the browser" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: TipTap, limited to the content the email allows

**Files:**
- Modify: `package.json` and `package-lock.json`, through `npm install`
- Create: `components/admin/newsletter/body-extensions.ts`
- Test: `tests/vitest/components/admin/body-extensions.test.ts`

**Interfaces:**
- **Consumes:** `isAllowedLink` (Task 2).
- **Produces:** `bodyExtensions(): Extensions`, `withoutImages(html): { html, removed }`, and `PASTED_IMAGES_NOTE`.

- [ ] **Step 1: Install TipTap 3.31.4, pinned**

Run:

```bash
npm install --save-exact @tiptap/core@3.31.4 @tiptap/pm@3.31.4 @tiptap/react@3.31.4 @tiptap/starter-kit@3.31.4 @tiptap/extension-image@3.31.4
```

Expected: `package.json` lists the five at exactly `3.31.4` with no `^`, and npm reports no peer-dependency errors. Their peer range includes React 18.

- [ ] **Step 2: Write the failing test**

`tests/vitest/components/admin/body-extensions.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import { bodyExtensions, withoutImages } from '@/components/admin/newsletter/body-extensions';
import { normalizeBody } from '@/lib/newsletter/issue';

/** Every node type, and every mark type as "mark:<type>", in a document. */
function types(node: unknown, found = new Set<string>()): Set<string> {
  const n = node as { type?: string; marks?: Array<{ type: string }>; content?: unknown[] } | null;
  if (n?.type) found.add(n.type);
  n?.marks?.forEach((mark) => found.add(`mark:${mark.type}`));
  n?.content?.forEach((child) => types(child, found));
  return found;
}

const ALLOWED = [
  'doc', 'paragraph', 'heading', 'text', 'hardBreak', 'bulletList', 'orderedList', 'listItem',
  'blockquote', 'horizontalRule', 'image', 'mark:bold', 'mark:italic', 'mark:link',
];

/** Roughly what Google Docs puts on the clipboard: styled spans, h1 and h4, a table, an image, links. */
const GOOGLE_DOCS = `<meta charset="utf-8"><b id="docs-internal-guid-1" style="font-weight:normal;">
<h1 dir="ltr"><span style="font-size:20pt;font-family:Arial;">Big title</span></h1>
<p dir="ltr"><span style="font-weight:700;">Bold</span> <span style="font-style:italic;">italic</span> <span style="text-decoration:line-through;">struck</span> <span style="text-decoration:underline;">under</span> <code>code</code></p>
<p><img src="https://lh7.googleusercontent.com/abc" width="200"></p>
<table><tbody><tr><td><p>In a table</p></td></tr></tbody></table>
<h4>Small heading</h4>
<ul><li><p>One</p></li><li><p>Two</p></li></ul>
<p><a href="javascript:alert(1)">bad link</a> <a href="https://hopetrustindia.com/blogs/">good link</a></p>
</b>`;

function parse(html: string) {
  const editor = new Editor({ extensions: bodyExtensions(), content: html });
  const json = editor.getJSON();
  editor.destroy();
  return json;
}

describe('the body editor schema', () => {
  it('reduces a Google Docs paste to the content the email allows, keeping the words', () => {
    const json = parse(withoutImages(GOOGLE_DOCS).html);
    expect(Array.from(types(json)).filter((type) => !ALLOWED.includes(type))).toEqual([]);
    const text = JSON.stringify(json);
    for (const words of ['Big title', 'Bold', 'italic', 'struck', 'under', 'code', 'In a table', 'Small heading', 'One', 'Two', 'bad link', 'good link']) {
      expect(text).toContain(words);
    }
    expect(text).not.toContain('javascript:');
    expect(text).not.toContain('googleusercontent');
    expect(text).toContain('https://hopetrustindia.com/blogs/');
    // Saving keeps every kind of content the editor holds.
    expect(types(normalizeBody(json))).toEqual(types(json));
  });

  it('keeps headings at the two allowed levels', () => {
    const json = parse('<h2>Two</h2><h3>Three</h3>');
    expect(json.content?.map((node) => node.attrs?.level)).toEqual([2, 3]);
  });
});

describe('withoutImages', () => {
  it('removes images and pictures from pasted HTML, and says so', () => {
    expect(withoutImages('<p>a<img src="x.png">b</p><picture><source srcset="y.webp"><img src="y.jpg"></picture>')).toEqual({
      html: '<p>ab</p>',
      removed: true,
    });
    expect(withoutImages('<p>plain</p>')).toEqual({ html: '<p>plain</p>', removed: false });
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `npx vitest run tests/vitest/components/admin/body-extensions.test.ts`

Expected: it fails because `body-extensions` doesn't exist.

- [ ] **Step 4: Write `components/admin/newsletter/body-extensions.ts`**

```ts
// The TipTap extensions for an issue's body: exactly the content spec §6.3
// allows, so the editor can't hold anything the email can't show. Pasted
// HTML is parsed against this schema, which reduces Google Docs and Word
// formatting to it. Pasted images are removed first (withoutImages), so every
// image is uploaded, and resized, through the Image button.

import type { Extensions } from '@tiptap/core';
import Image from '@tiptap/extension-image';
import StarterKit from '@tiptap/starter-kit';
import { isAllowedLink } from '@/lib/newsletter/issue';

export const PASTED_IMAGES_NOTE =
  'Pasted images were left out. Add photos with the Image button, so they are resized for email.';

export function bodyExtensions(): Extensions {
  return [
    StarterKit.configure({
      code: false,
      codeBlock: false,
      strike: false,
      underline: false,
      trailingNode: false,
      heading: { levels: [2, 3] },
      link: {
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: 'https',
        isAllowedUri: (url) => isAllowedLink(url),
        HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: null },
      },
    }),
    Image.configure({ inline: false, allowBase64: false }),
  ];
}

/** Pasted HTML without its images, and whether it had any. */
export function withoutImages(html: string): { html: string; removed: boolean } {
  const cleaned = html.replace(/<picture\b[\s\S]*?<\/picture>/gi, '').replace(/<img\b[^>]*>/gi, '');
  return { html: cleaned, removed: cleaned !== html };
}
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run tests/vitest/components/admin/body-extensions.test.ts`

Expected: it passes.

If an assertion fails because TipTap parses something differently than assumed, fix the extension options, not the test. For example, a heading level, or a disabled mark that stays. The allowed list is the spec.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json components/admin/newsletter/body-extensions.ts tests/vitest/components/admin/body-extensions.test.ts
git commit -m "feat(newsletter): TipTap 3.31.4, limited to the content the email allows" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: The body editor

**Files:**
- Create: `components/admin/newsletter/BodyEditor.tsx`
- Test: `tests/vitest/components/admin/BodyEditor.test.tsx`

**Interfaces:**
- **Consumes:** `bodyExtensions`, `withoutImages` and `PASTED_IMAGES_NOTE` (Task 9); `isAllowedLink` (Task 2).
- **Produces:** `default BodyEditor({ initial: BodyDoc, readOnly?: boolean, onChange(doc: BodyDoc), onUploadImage(file): Promise<string> })`.
  - `initial` is read once, when it mounts; remount it with a new `key` to replace the content.
  - The body has `role="textbox"` and `aria-label="Body"`.
  - The hidden file input has `aria-label="Choose a photo for the body"`.

- [ ] **Step 1: Write the failing test**

`tests/vitest/components/admin/BodyEditor.test.tsx`:

```tsx
import { beforeAll, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import BodyEditor from '@/components/admin/newsletter/BodyEditor';
import type { BodyDoc } from '@/lib/newsletter/content';

// ProseMirror measures the selection to scroll it into view, and jsdom has no layout.
beforeAll(() => {
  const empty = { length: 0, item: () => null, [Symbol.iterator]: Array.prototype[Symbol.iterator] };
  Range.prototype.getClientRects = () => empty as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  Element.prototype.scrollIntoView = () => {};
  document.elementFromPoint = () => null;
});

const INITIAL: BodyDoc = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello readers' }] }],
};
const PHOTO = 'https://abc.supabase.co/storage/v1/object/public/newsletter-images/issues/i/p.jpg';

describe('BodyEditor', () => {
  it('shows the body, with a toolbar of only the allowed formatting', async () => {
    render(<BodyEditor initial={INITIAL} onChange={() => {}} onUploadImage={async () => PHOTO} />);
    expect(await screen.findByText('Hello readers')).toBeInTheDocument();
    const toolbar = screen.getByRole('toolbar', { name: 'Formatting' });
    expect(Array.from(toolbar.querySelectorAll('button')).map((b) => b.getAttribute('aria-label'))).toEqual([
      'Bold', 'Italic', 'Heading', 'Subheading', 'Bulleted list', 'Numbered list', 'Pull-quote', 'Divider',
      'Link', 'Image', 'Undo', 'Redo',
    ]);
  });

  it('has no toolbar when read-only', async () => {
    render(<BodyEditor initial={INITIAL} readOnly onChange={() => {}} onUploadImage={async () => PHOTO} />);
    expect(await screen.findByText('Hello readers')).toBeInTheDocument();
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
  });

  it('uploads a photo through the Image button and adds it with its description', async () => {
    const onChange = vi.fn();
    const onUploadImage = vi.fn(async () => PHOTO);
    vi.spyOn(window, 'prompt').mockReturnValue('  Two people talking ');
    render(<BodyEditor initial={INITIAL} onChange={onChange} onUploadImage={onUploadImage} />);
    await screen.findByText('Hello readers');
    const file = new File(['x'], 'p.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText('Choose a photo for the body'), { target: { files: [file] } });
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onUploadImage).toHaveBeenCalledWith(file);
    const doc = onChange.mock.calls[onChange.mock.calls.length - 1][0] as BodyDoc;
    expect(doc.content).toContainEqual({
      type: 'image',
      attrs: expect.objectContaining({ src: PHOTO, alt: 'Two people talking' }),
    });
  });

  it("says why a photo didn't upload, and adds nothing", async () => {
    const onChange = vi.fn();
    vi.spyOn(window, 'prompt').mockReturnValue('A photo');
    render(
      <BodyEditor
        initial={INITIAL}
        onChange={onChange}
        onUploadImage={async () => {
          throw new Error('That photo is over 5 MB.');
        }}
      />,
    );
    await screen.findByText('Hello readers');
    fireEvent.change(screen.getByLabelText('Choose a photo for the body'), {
      target: { files: [new File(['x'], 'p.jpg', { type: 'image/jpeg' })] },
    });
    expect(await screen.findByRole('status')).toHaveTextContent('That photo is over 5 MB.');
    expect(onChange).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/vitest/components/admin/BodyEditor.test.tsx`

Expected: it fails because `BodyEditor` doesn't exist.

- [ ] **Step 3: Write `components/admin/newsletter/BodyEditor.tsx`**

```tsx
'use client';

// The body of an issue (spec §6.3, §8.1). TipTap holds only the content the
// email can show, with a toolbar for it. Photos go through the Image button,
// which resizes and uploads them. Pasted images are removed, with a note.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ChainedCommands } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import {
  Bold,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  Minus,
  Quote,
  Redo2,
  Undo2,
} from 'lucide-react';
import type { BodyDoc } from '@/lib/newsletter/content';
import { isAllowedLink } from '@/lib/newsletter/issue';
import { PASTED_IMAGES_NOTE, bodyExtensions, withoutImages } from './body-extensions';

export interface BodyEditorProps {
  /** Read once, when the editor mounts. Give it a new `key` to replace the content. */
  initial: BodyDoc;
  readOnly?: boolean;
  onChange: (doc: BodyDoc) => void;
  /** Resizes and uploads a photo, and returns its public address. */
  onUploadImage: (file: File) => Promise<string>;
}

/** Close to the email's look, so staff see roughly what readers will. */
const BODY_CSS = `
.nl-body{font-size:15px;line-height:1.65;color:#111}
.nl-body p{margin:0 0 12px}
.nl-body h2{font-size:22px;font-weight:700;text-align:center;margin:24px 0 10px}
.nl-body h3{font-size:18px;font-weight:700;margin:20px 0 8px}
.nl-body ul{list-style:disc;padding-left:24px;margin:0 0 12px}
.nl-body ol{list-style:decimal;padding-left:24px;margin:0 0 12px}
.nl-body li p{margin:0 0 4px}
.nl-body blockquote{background:#EE7429;color:#fff;border-radius:16px;padding:16px 20px;margin:20px 0;text-align:center;font-size:20px}
.nl-body hr{border:0;border-top:2px solid #EE7429;margin:24px 0}
.nl-body img{display:block;max-width:100%;height:auto;border-radius:12px;margin:8px 0 16px}
.nl-body img.ProseMirror-selectednode{outline:3px solid #EE7429}
.nl-body a{color:#EE7429;text-decoration:underline}
`;

function ToolButton({
  label,
  active = false,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      // Keeps the text selection, so the button acts on what is selected.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition disabled:opacity-40 ${
        active ? 'bg-[#ED7428] text-white' : 'text-gray-700 hover:bg-gray-100'
      }`}
    >
      {children}
    </button>
  );
}

export default function BodyEditor({ initial, readOnly = false, onChange, onUploadImage }: BodyEditorProps) {
  const [note, setNote] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const changed = useRef(onChange);
  changed.current = onChange;

  const editor = useEditor({
    extensions: bodyExtensions(),
    content: initial,
    editable: !readOnly,
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: {
        class: 'nl-body min-h-[320px] px-4 py-3 outline-none',
        role: 'textbox',
        'aria-label': 'Body',
        'aria-multiline': 'true',
      },
      transformPastedHTML(html) {
        const result = withoutImages(html);
        if (result.removed) setNote(PASTED_IMAGES_NOTE);
        return result.html;
      },
      handlePaste(_view, event) {
        const data = event.clipboardData;
        if (!data) return false;
        const hasText = data.types.includes('text/html') || data.types.includes('text/plain');
        // A screenshot or copied photo alone. Word also adds a picture of the
        // selection beside its HTML, so pastes with text still go through.
        if (!hasText && Array.from(data.files).some((file) => file.type.startsWith('image/'))) {
          setNote(PASTED_IMAGES_NOTE);
          return true;
        }
        return false;
      },
      handleDrop(_view, event) {
        if (event.dataTransfer?.files.length) {
          setNote(PASTED_IMAGES_NOTE);
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: current }) => changed.current(current.getJSON() as BodyDoc),
  });

  useEffect(() => {
    editor?.setEditable(!readOnly);
  }, [editor, readOnly]);

  function setLink() {
    if (!editor) return;
    const current = editor.getAttributes('link').href as string | undefined;
    const input = window.prompt('Link address: https://…, mailto:… or tel:…. Leave it empty to remove the link.', current ?? 'https://');
    if (input === null) return;
    const href = input.trim();
    const chain = editor.chain().focus(null, { scrollIntoView: false }).extendMarkRange('link');
    if (href === '' || href === 'https://') {
      chain.unsetLink().run();
    } else if (isAllowedLink(href)) {
      chain.setLink({ href }).run();
      setNote('');
    } else {
      setNote('A link must start with https://, http://, mailto: or tel:.');
    }
  }

  async function addImage(file: File | undefined) {
    if (fileInput.current) fileInput.current.value = '';
    if (!file || !editor) return;
    const alt = window.prompt("Describe the photo for people who can't see it:", '');
    if (alt === null) return;
    setUploading(true);
    setNote('');
    try {
      const src = await onUploadImage(file);
      editor.chain().focus(null, { scrollIntoView: false }).setImage({ src, alt: alt.trim() }).run();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "The photo didn't upload.");
    } finally {
      setUploading(false);
    }
  }

  const ready = Boolean(editor) && !readOnly;
  const run = (command: (chain: ChainedCommands) => ChainedCommands) => () => {
    if (editor) command(editor.chain().focus()).run();
  };

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <style>{BODY_CSS}</style>
      {!readOnly && (
        <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-1 border-b border-gray-100 bg-[#F7F6F4]/60 px-2 py-1.5">
          <ToolButton label="Bold" active={editor?.isActive('bold')} disabled={!ready} onClick={run((c) => c.toggleBold())}>
            <Bold className="h-4 w-4" />
          </ToolButton>
          <ToolButton label="Italic" active={editor?.isActive('italic')} disabled={!ready} onClick={run((c) => c.toggleItalic())}>
            <Italic className="h-4 w-4" />
          </ToolButton>
          <ToolButton
            label="Heading"
            active={editor?.isActive('heading', { level: 2 })}
            disabled={!ready}
            onClick={run((c) => c.toggleHeading({ level: 2 }))}
          >
            <Heading2 className="h-4 w-4" />
          </ToolButton>
          <ToolButton
            label="Subheading"
            active={editor?.isActive('heading', { level: 3 })}
            disabled={!ready}
            onClick={run((c) => c.toggleHeading({ level: 3 }))}
          >
            <Heading3 className="h-4 w-4" />
          </ToolButton>
          <ToolButton label="Bulleted list" active={editor?.isActive('bulletList')} disabled={!ready} onClick={run((c) => c.toggleBulletList())}>
            <List className="h-4 w-4" />
          </ToolButton>
          <ToolButton label="Numbered list" active={editor?.isActive('orderedList')} disabled={!ready} onClick={run((c) => c.toggleOrderedList())}>
            <ListOrdered className="h-4 w-4" />
          </ToolButton>
          <ToolButton label="Pull-quote" active={editor?.isActive('blockquote')} disabled={!ready} onClick={run((c) => c.toggleBlockquote())}>
            <Quote className="h-4 w-4" />
          </ToolButton>
          <ToolButton label="Divider" disabled={!ready} onClick={run((c) => c.setHorizontalRule())}>
            <Minus className="h-4 w-4" />
          </ToolButton>
          <ToolButton label="Link" active={editor?.isActive('link')} disabled={!ready} onClick={setLink}>
            <Link2 className="h-4 w-4" />
          </ToolButton>
          <ToolButton label="Image" disabled={!ready || uploading} onClick={() => fileInput.current?.click()}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          </ToolButton>
          <ToolButton label="Undo" disabled={!ready || !editor?.can().undo()} onClick={run((c) => c.undo())}>
            <Undo2 className="h-4 w-4" />
          </ToolButton>
          <ToolButton label="Redo" disabled={!ready || !editor?.can().redo()} onClick={run((c) => c.redo())}>
            <Redo2 className="h-4 w-4" />
          </ToolButton>
        </div>
      )}
      <EditorContent editor={editor} />
      {note && (
        <p role="status" className="border-t border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          {note}
        </p>
      )}
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        aria-label="Choose a photo for the body"
        onChange={(e) => addImage(e.target.files?.[0])}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run the test and tsc**

Run: `npx vitest run tests/vitest/components/admin/BodyEditor.test.tsx` and `npx tsc --noEmit -p tsconfig.json`

Expected: the tests pass, and tsc reports 0 errors.

- [ ] **Step 5: Commit**

```bash
git add components/admin/newsletter/BodyEditor.tsx tests/vitest/components/admin/BodyEditor.test.tsx
git commit -m "feat(newsletter): body editor with toolbar, photo upload, and pasted images removed" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: The preview and the two sending dialogs

**Files:**
- Create: `components/admin/newsletter/IssuePreview.tsx`, `components/admin/newsletter/IssueSendDialogs.tsx`
- Test: `tests/vitest/components/admin/IssuePreview.test.tsx`

**Interfaces:**
- **Consumes:** `renderIssueHtml`, `newsletterImagesBase`, `SIZE_WARN_BYTES` and `SIZE_MAX_BYTES` (render.ts); `issueRenderOptions`, `normalizeBody`, `kb` and `ISSUE_LIMITS` (Task 2).
- **Produces:**
  - **From `IssuePreview.tsx`:**
    - `IMAGES_BASE`;
    - `renderPreview(issue, imagesBase?)`, which returns `{ html, sendHtml, bytes, imagePrefixes }`;
    - `sizeNote(bytes)`, which returns `{ text, tone }`;
    - `default IssuePreview({ html, bytes })`.
  - **From `IssueSendDialogs.tsx`:**
    - `parseAddresses(text): string[]`;
    - `TestSendDialog({ defaultTo, busy, onSend(to), onClose })`;
    - `SendDialog({ subject, from, subscribed, busy, progress, onSend, onClose })`.

- [ ] **Step 1: Write the failing tests**

`tests/vitest/components/admin/IssuePreview.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import IssuePreview, { renderPreview, sizeNote } from '@/components/admin/newsletter/IssuePreview';
import { SendDialog, TestSendDialog, parseAddresses } from '@/components/admin/newsletter/IssueSendDialogs';
import type { IssueForRender } from '@/lib/newsletter/content';

const IMAGES = 'https://abc.supabase.co/storage/v1/object/public/newsletter-images';

describe('IssuePreview', () => {
  it('shows the email in a sandboxed frame, at phone width on request, with its size', async () => {
    render(<IssuePreview html="<p>Hello</p>" bytes={2048} />);
    const frame = screen.getByTitle('Email preview');
    expect(frame).toHaveAttribute('sandbox', '');
    expect(frame).toHaveAttribute('srcdoc', '<p>Hello</p>');
    expect(frame).toHaveStyle({ width: '640px' });
    await userEvent.click(screen.getByRole('button', { name: 'Phone' }));
    expect(frame).toHaveStyle({ width: '375px' });
    expect(screen.getByText('Email size: 2.0 KB')).toBeInTheDocument();
  });

  it('warns above 80 KB, and says it is too big above 95 KB', () => {
    expect(sizeNote(81 * 1024)).toEqual({ text: '81.0 KB: getting long. Gmail cuts emails off at 102 KB.', tone: 'warn' });
    expect(sizeNote(96 * 1024)).toEqual({ text: '96.0 KB: too big to send. Shorten it or remove an image.', tone: 'over' });
    expect(sizeNote(50 * 1024).tone).toBe('ok');
  });

  it('previews without the unsubscribe placeholder, and measures the send version', () => {
    const issue: IssueForRender = {
      subject: 'S',
      preheader: '',
      issue_date: '2026-10-14',
      title: 'Hello there',
      hero_image_url: null,
      hero_image_alt: '',
      body: { type: 'doc', content: [] },
      share_url: null,
    };
    const out = renderPreview(issue, IMAGES);
    expect(out.html).toContain('Hello there');
    expect(out.html).not.toContain('{{{RESEND_UNSUBSCRIBE_URL}}}');
    expect(out.sendHtml).toContain('{{{RESEND_UNSUBSCRIBE_URL}}}');
    expect(out.bytes).toBe(new TextEncoder().encode(out.sendHtml).length);
    expect(out.imagePrefixes).toEqual([`${IMAGES}/`]);
  });
});

describe('the sending dialogs', () => {
  it('reads addresses separated by commas, spaces or lines, once each', () => {
    expect(parseAddresses(' A@x.com, b@x.com;\nb@x.com  c@x.com ')).toEqual(['a@x.com', 'b@x.com', 'c@x.com']);
  });

  it('sends a test to the addresses typed, five at most', async () => {
    const onSend = vi.fn();
    render(<TestSendDialog defaultTo="me@hopetrustindia.com" busy={false} onSend={onSend} onClose={() => {}} />);
    const box = screen.getByLabelText(/Send to/);
    expect(box).toHaveValue('me@hopetrustindia.com');
    await userEvent.clear(box);
    await userEvent.type(box, 'a@x.com b@x.com c@x.com d@x.com e@x.com f@x.com');
    expect(screen.getByRole('alert')).toHaveTextContent("That's more than 5 addresses.");
    expect(screen.getByRole('button', { name: /Send test/ })).toBeDisabled();
    await userEvent.clear(box);
    await userEvent.type(box, 'a@x.com, b@x.com');
    await userEvent.click(screen.getByRole('button', { name: /Send test/ }));
    expect(onSend).toHaveBeenCalledWith(['a@x.com', 'b@x.com']);
  });

  it('shows what will go out before the final click', async () => {
    const onSend = vi.fn();
    render(
      <SendDialog
        subject="Know thyself"
        from="Hope Trust <newsletter@hopetrustindia.com>"
        subscribed={312}
        busy={false}
        progress=""
        onSend={onSend}
        onClose={() => {}}
      />,
    );
    expect(screen.getByRole('dialog', { name: 'Send to subscribers' })).toBeInTheDocument();
    expect(screen.getByText('Know thyself')).toBeInTheDocument();
    expect(screen.getByText('Hope Trust <newsletter@hopetrustindia.com>')).toBeInTheDocument();
    expect(screen.getByText('312 subscribers')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Send now/ }));
    expect(onSend).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/vitest/components/admin/IssuePreview.test.tsx`

Expected: it fails because the modules don't exist.

- [ ] **Step 3: Write `components/admin/newsletter/IssuePreview.tsx`**

```tsx
'use client';

// The live preview (spec §8.1, §12): the email as the send will build it, from
// the same renderer, in a sandboxed iframe (no scripts), at desktop or phone
// width, with the email's size.

import { useState, type ReactNode } from 'react';
import { Monitor, Smartphone } from 'lucide-react';
import type { IssueForRender } from '@/lib/newsletter/content';
import { issueRenderOptions, kb, normalizeBody } from '@/lib/newsletter/issue';
import { SIZE_MAX_BYTES, SIZE_WARN_BYTES, newsletterImagesBase, renderIssueHtml } from '@/lib/newsletter/render';

/** The public image bucket of this site's Supabase project. */
export const IMAGES_BASE = newsletterImagesBase(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '');

export interface RenderedPreview {
  /** The preview version, for the iframe. */
  html: string;
  /** The send version, and its size: the 95 KB limit and the Unsubscribe check apply to these. */
  sendHtml: string;
  bytes: number;
  imagePrefixes: string[];
}

export function renderPreview(issue: IssueForRender, imagesBase = IMAGES_BASE): RenderedPreview {
  const clean = { ...issue, body: normalizeBody(issue.body) };
  const sendOptions = issueRenderOptions(imagesBase, 'send');
  const send = renderIssueHtml(clean, sendOptions);
  return {
    html: renderIssueHtml(clean, issueRenderOptions(imagesBase, 'preview')).html,
    sendHtml: send.html,
    bytes: send.bytes,
    imagePrefixes: sendOptions.imagePrefixes,
  };
}

export function sizeNote(bytes: number): { text: string; tone: 'ok' | 'warn' | 'over' } {
  if (bytes > SIZE_MAX_BYTES) return { text: `${kb(bytes)}: too big to send. Shorten it or remove an image.`, tone: 'over' };
  if (bytes > SIZE_WARN_BYTES) return { text: `${kb(bytes)}: getting long. Gmail cuts emails off at 102 KB.`, tone: 'warn' };
  return { text: kb(bytes), tone: 'ok' };
}

const TONE = { ok: 'text-gray-500', warn: 'text-amber-700', over: 'font-semibold text-red-700' } as const;

export default function IssuePreview({ html, bytes }: { html: string; bytes: number }) {
  const [device, setDevice] = useState<'desktop' | 'phone'>('desktop');
  const size = sizeNote(bytes);
  const option = (value: 'desktop' | 'phone', label: string, icon: ReactNode) => (
    <button
      type="button"
      aria-pressed={device === value}
      onClick={() => setDevice(value)}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
        device === value ? 'bg-[#00373E] text-white' : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      {icon}
      {label}
    </button>
  );
  return (
    <section aria-label="Preview" className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label="Preview width" className="inline-flex gap-0.5 rounded-xl border border-gray-200 p-0.5">
          {option('desktop', 'Desktop', <Monitor className="h-3.5 w-3.5" />)}
          {option('phone', 'Phone', <Smartphone className="h-3.5 w-3.5" />)}
        </div>
        <p aria-live="polite" className={`text-xs ${TONE[size.tone]}`}>
          Email size: {size.text}
        </p>
      </div>
      <div className="overflow-x-auto rounded-xl bg-[#F4F4F4] p-2">
        <iframe
          title="Email preview"
          sandbox=""
          srcDoc={html}
          style={{ width: device === 'phone' ? 375 : 640 }}
          className="mx-auto block h-[1100px] max-w-none rounded-lg border-0 bg-white"
        />
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Write `components/admin/newsletter/IssueSendDialogs.tsx`**

```tsx
'use client';

// The two sending dialogs of the issue editor (spec §8.1): a test to up to five
// addresses, and the final send to every subscriber.

import { useEffect, useState, type ReactNode } from 'react';
import { Loader2, Send, X } from 'lucide-react';
import { ISSUE_LIMITS } from '@/lib/newsletter/issue';

const primary =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-[#ED7428] px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#ED7428]/20 transition hover:bg-[#d4651f] disabled:opacity-50';
const secondary =
  'inline-flex items-center justify-center rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50';

function Dialog({ title, busy, onClose, children }: { title: string; busy: boolean; onClose: () => void; children: ReactNode }) {
  // Escape closes the dialog, except while something is running.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="nl-dialog-title"
        className="relative w-full max-w-lg rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl sm:p-8"
      >
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-full p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40"
        >
          <X className="h-5 w-5" />
        </button>
        <h3 id="nl-dialog-title" className="mb-4 pr-8 text-lg font-bold text-[#00373E]">
          {title}
        </h3>
        {children}
      </div>
    </div>
  );
}

/** The addresses typed, separated by commas, semicolons, spaces or lines: lower-cased, once each. */
export function parseAddresses(text: string): string[] {
  const all = text
    .split(/[\s,;]+/)
    .map((address) => address.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(all));
}

export function TestSendDialog({
  defaultTo,
  busy,
  onSend,
  onClose,
}: {
  defaultTo: string;
  busy: boolean;
  onSend: (to: string[]) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(defaultTo);
  const addresses = parseAddresses(text);
  const tooMany = addresses.length > ISSUE_LIMITS.testRecipients;
  return (
    <Dialog title="Send a test" busy={busy} onClose={onClose}>
      <label htmlFor="nl-test-to" className="mb-1 block text-sm font-medium text-gray-700">
        Send to (up to {ISSUE_LIMITS.testRecipients} addresses)
      </label>
      <textarea
        id="nl-test-to"
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-[#ED7428] focus:ring-2 focus:ring-[#ED7428]/20"
      />
      <p className="mt-2 text-xs text-gray-500">The subject starts with [TEST]. In a test, Unsubscribe links to the website.</p>
      {tooMany && (
        <p role="alert" className="mt-2 text-xs font-medium text-red-700">
          That&apos;s more than {ISSUE_LIMITS.testRecipients} addresses.
        </p>
      )}
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" onClick={onClose} disabled={busy} className={secondary}>
          Cancel
        </button>
        <button type="button" onClick={() => onSend(addresses)} disabled={busy || addresses.length === 0 || tooMany} className={primary}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Send test
        </button>
      </div>
    </Dialog>
  );
}

export function SendDialog({
  subject,
  from,
  subscribed,
  busy,
  progress,
  onSend,
  onClose,
}: {
  subject: string;
  from: string;
  subscribed: number;
  busy: boolean;
  progress: string;
  onSend: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog title="Send to subscribers" busy={busy} onClose={onClose}>
      <dl className="space-y-3 text-sm">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wider text-gray-500">Subject</dt>
          <dd className="font-semibold text-gray-900">{subject}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wider text-gray-500">From</dt>
          <dd className="text-gray-800">{from}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wider text-gray-500">To</dt>
          <dd className="text-gray-800">{`${subscribed} subscriber${subscribed === 1 ? '' : 's'}`}</dd>
        </div>
      </dl>
      <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
        This can&apos;t be undone. Once it is sent, the issue can&apos;t be changed.
      </p>
      {progress && (
        <p role="status" className="mt-3 flex items-center gap-2 text-sm text-gray-600">
          <Loader2 className="h-4 w-4 animate-spin" /> {progress}
        </p>
      )}
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" onClick={onClose} disabled={busy} className={secondary}>
          Cancel
        </button>
        <button type="button" onClick={onSend} disabled={busy} className={primary}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Send now
        </button>
      </div>
    </Dialog>
  );
}
```

- [ ] **Step 5: Run the tests and tsc**

Run: `npx vitest run tests/vitest/components/admin/IssuePreview.test.tsx` and `npx tsc --noEmit -p tsconfig.json`

Expected: the tests pass, and tsc reports 0 errors.

- [ ] **Step 6: Commit**

```bash
git add components/admin/newsletter/IssuePreview.tsx components/admin/newsletter/IssueSendDialogs.tsx tests/vitest/components/admin/IssuePreview.test.tsx
git commit -m "feat(newsletter): sandboxed live preview with size note, and the test and send dialogs" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: The issue editor

**Files:**
- Create: `components/admin/newsletter/issue-status.ts`, `components/admin/newsletter/IssueEditor.tsx`
- Test: `tests/vitest/components/admin/IssueEditor.test.tsx`

**Interfaces:**
- **Consumes:** everything from Tasks 2, 8, 10 and 11; `syncUntilDone` (plan 2, `lib/newsletter-admin.ts`).
- **Produces:**
  - `ISSUE_STATUS: Record<IssueStatus, { label, className }>`;
  - `default IssueEditor({ token, id, onClose(), onUnauthorized(), onDirtyChange?(dirty) })`.
  - Unsaved edits are kept in `localStorage` under `newsletter-issue-draft:<id>` as `{ version, draft, at }`.

- [ ] **Step 1: Write the failing test**

`tests/vitest/components/admin/IssueEditor.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BodyDoc } from '@/lib/newsletter/content';
import { toDraft, type IssueRow } from '@/lib/newsletter/issue';

// IMAGES_BASE is read as the preview module loads, so the URL has to be set first.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
});

vi.mock('@/lib/newsletter-admin', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/newsletter-admin')>();
  return {
    ...real,
    getIssue: vi.fn(),
    saveIssue: vi.fn(),
    sendIssue: vi.fn(),
    sendTestIssue: vi.fn(),
    checkIssue: vi.fn(),
    deleteIssue: vi.fn(),
    syncUntilDone: vi.fn(),
  };
});
vi.mock('@/lib/newsletter/issue-image', () => ({ uploadIssueImage: vi.fn() }));
// The real body editor has its own tests. Here, a stand-in that edits the body on request.
vi.mock('@/components/admin/newsletter/BodyEditor', () => ({
  default: ({ initial, readOnly, onChange }: { initial: BodyDoc; readOnly?: boolean; onChange: (doc: BodyDoc) => void }) => (
    <div>
      <p data-testid="body">{JSON.stringify(initial)}</p>
      {!readOnly && (
        <button
          type="button"
          onClick={() => onChange({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'New words' }] }] })}
        >
          Type in the body
        </button>
      )}
    </div>
  ),
}));

import IssueEditor from '@/components/admin/newsletter/IssueEditor';
import * as api from '@/lib/newsletter-admin';
import { uploadIssueImage } from '@/lib/newsletter/issue-image';

const IMAGES = 'https://test.supabase.co/storage/v1/object/public/newsletter-images';
const ISSUE: IssueRow = {
  id: '11111111-1111-4111-8111-000000000001',
  subject: 'Know thyself',
  preheader: '',
  issue_date: '2026-10-14',
  title: 'Know Thyself',
  hero_image_url: `${IMAGES}/issues/i/hero.jpg`,
  hero_image_alt: 'A window',
  body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }] },
  share_url: null,
  status: 'draft',
  last_error: null,
  resend_broadcast_id: null,
  recipient_count: null,
  sent_at: null,
  sent_by: null,
  created_by: 'admin@hopetrustindia.com',
  updated_by: null,
  created_at: '2026-10-14T10:00:00.000Z',
  updated_at: '2026-10-14T10:00:00.000Z',
};
const ABOUT = { me: 'admin@hopetrustindia.com', from: 'Hope Trust <newsletter@hopetrustindia.com>', subscribed: 3 };
const SENT: IssueRow = {
  ...ISSUE,
  status: 'sent',
  recipient_count: 3,
  resend_broadcast_id: 'b-1',
  sent_at: '2026-10-14T10:10:00.000Z',
  sent_by: 'admin@hopetrustindia.com',
};

function open(change: Partial<IssueRow> = {}) {
  vi.mocked(api.getIssue).mockResolvedValue({ issue: { ...ISSUE, ...change }, ...ABOUT });
  const onClose = vi.fn();
  render(<IssueEditor token="tkn" id={ISSUE.id} onClose={onClose} onUnauthorized={() => {}} />);
  return { onClose };
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.resetAllMocks();
  vi.restoreAllMocks();
});

describe('IssueEditor', () => {
  it('loads the issue into the fields, with a live preview', async () => {
    open();
    expect(await screen.findByLabelText('Subject')).toHaveValue('Know thyself');
    expect(screen.getByLabelText('Title')).toHaveValue('Know Thyself');
    await waitFor(() => expect(screen.getByTitle('Email preview').getAttribute('srcdoc')).toContain('Know Thyself'));
    expect(screen.getByText('All changes saved')).toBeInTheDocument();
  });

  it('saves the whole draft with the version it was loaded at, and then has nothing left to save', async () => {
    open();
    const subject = await screen.findByLabelText('Subject');
    expect(screen.getByRole('button', { name: /^Save$/ })).toBeDisabled();
    await userEvent.clear(subject);
    await userEvent.type(subject, 'Know yourself');
    await userEvent.click(screen.getByRole('button', { name: 'Type in the body' }));
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    vi.mocked(api.saveIssue).mockImplementation(async (_token, _id, draft) => ({
      ...ISSUE,
      ...draft,
      updated_at: '2026-10-14T10:05:00.000Z',
    }));
    await userEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    expect(api.saveIssue).toHaveBeenCalledWith(
      'tkn',
      ISSUE.id,
      expect.objectContaining({
        subject: 'Know yourself',
        title: 'Know Thyself',
        body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'New words' }] }] },
      }),
      '2026-10-14T10:00:00.000Z',
    );
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Save$/ })).toBeDisabled();
  });

  it("on a clashing save, offers Reload and won't overwrite the other person's version", async () => {
    open();
    await userEvent.type(await screen.findByLabelText('Subject'), '!');
    const theirs = { ...ISSUE, title: 'Their title', updated_at: '2026-10-14T10:03:00.000Z' };
    vi.mocked(api.saveIssue).mockRejectedValue(
      new api.IssueApiError('Someone saved this issue after you opened it. Reload to see their changes, then make yours again.', 409, theirs, []),
    );
    await userEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Someone saved this issue after you opened it.');
    await userEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    expect(vi.mocked(api.saveIssue).mock.calls.map((call) => call[3])).toEqual([ISSUE.updated_at, ISSUE.updated_at]);
    vi.mocked(api.getIssue).mockResolvedValue({ issue: theirs, ...ABOUT });
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
    await waitFor(() => expect(screen.getByLabelText('Title')).toHaveValue('Their title'));
  });

  it('asks before leaving with unsaved changes', async () => {
    const { onClose } = open();
    await userEvent.type(await screen.findByLabelText('Subject'), '!');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await userEvent.click(screen.getByRole('button', { name: /Issues/ }));
    expect(confirm).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await userEvent.click(screen.getByRole('button', { name: /Issues/ }));
    expect(onClose).toHaveBeenCalled();
  });

  it('offers back the unsaved changes this browser kept', async () => {
    window.localStorage.setItem(
      `newsletter-issue-draft:${ISSUE.id}`,
      JSON.stringify({
        version: ISSUE.updated_at,
        draft: { ...toDraft(ISSUE), subject: 'Kept in the browser' },
        at: '2026-10-14T10:02:00.000Z',
      }),
    );
    open();
    await userEvent.click(await screen.findByRole('button', { name: 'Restore them' }));
    expect(screen.getByLabelText('Subject')).toHaveValue('Kept in the browser');
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
  });

  it('keeps unsaved changes in this browser while they are unsaved', async () => {
    open();
    await userEvent.type(await screen.findByLabelText('Subject'), '!');
    await waitFor(() => {
      const kept = JSON.parse(window.localStorage.getItem(`newsletter-issue-draft:${ISSUE.id}`) ?? 'null');
      expect(kept).toMatchObject({ version: ISSUE.updated_at, draft: { subject: 'Know thyself!' } });
    });
  });

  it('uploads the hero photo and shows it', async () => {
    open({ hero_image_url: null });
    await screen.findByLabelText('Subject');
    vi.mocked(uploadIssueImage).mockResolvedValue(`${IMAGES}/issues/i/new.jpg`);
    const file = new File(['x'], 'hero.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText('Choose the hero photo'), { target: { files: [file] } });
    expect(await screen.findByRole('img', { name: 'A window' })).toHaveAttribute('src', `${IMAGES}/issues/i/new.jpg`);
    expect(uploadIssueImage).toHaveBeenCalledWith('tkn', ISSUE.id, file);
  });

  it('lists what stops the issue from being sent, and keeps Send disabled', async () => {
    open({ hero_image_url: null, hero_image_alt: '' });
    expect(await screen.findByText('Add a hero photo.')).toBeInTheDocument();
    expect(screen.getByText("Describe the hero photo for people who can't see it.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Send to subscribers/ })).toBeDisabled();
  });

  it('sends a test to the signed-in admin by default', async () => {
    open();
    await screen.findByLabelText('Subject');
    vi.mocked(api.sendTestIssue).mockResolvedValue(['admin@hopetrustindia.com']);
    await userEvent.click(screen.getByRole('button', { name: /Send test/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Send a test' });
    expect(within(dialog).getByLabelText(/Send to/)).toHaveValue('admin@hopetrustindia.com');
    await userEvent.click(within(dialog).getByRole('button', { name: /Send test/ }));
    expect(api.sendTestIssue).toHaveBeenCalledWith('tkn', ISSUE.id, ['admin@hopetrustindia.com']);
    expect(await screen.findByText('Test sent to admin@hopetrustindia.com.')).toBeInTheDocument();
  });

  it('syncs with Resend, then sends, and shows the issue as sent', async () => {
    open();
    vi.mocked(api.syncUntilDone).mockResolvedValue({
      unsubscribedInResend: 0,
      removedFromSegment: 0,
      pushed: 0,
      failed: 0,
      remaining: 0,
      errors: [],
    });
    vi.mocked(api.sendIssue).mockResolvedValue({ issue: SENT });
    const send = await screen.findByRole('button', { name: /Send to subscribers/ });
    await waitFor(() => expect(send).toBeEnabled());
    await userEvent.click(send);
    const dialog = await screen.findByRole('dialog', { name: 'Send to subscribers' });
    expect(within(dialog).getByText('3 subscribers')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: /Send now/ }));
    expect(await screen.findByText('Sent to 3 subscribers.')).toBeInTheDocument();
    expect(vi.mocked(api.syncUntilDone).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(api.sendIssue).mock.invocationCallOrder[0],
    );
    expect(screen.getByLabelText('Subject')).toBeDisabled();
  });

  it("doesn't send while a subscriber change can't reach Resend", async () => {
    open();
    vi.mocked(api.syncUntilDone).mockResolvedValue({
      unsubscribedInResend: 0,
      removedFromSegment: 0,
      pushed: 0,
      failed: 1,
      remaining: 1,
      errors: ['asha@example.com: Invalid email'],
    });
    const send = await screen.findByRole('button', { name: /Send to subscribers/ });
    await waitFor(() => expect(send).toBeEnabled());
    await userEvent.click(send);
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /Send now/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('asha@example.com: Invalid email');
    expect(api.sendIssue).not.toHaveBeenCalled();
  });

  it('shows a sent issue read-only, with a link to its numbers in Resend', async () => {
    open(SENT);
    expect(await screen.findByRole('link', { name: /Opens and clicks in Resend/ })).toHaveAttribute(
      'href',
      'https://resend.com/broadcasts/b-1',
    );
    expect(screen.getByLabelText('Subject')).toBeDisabled();
    expect(screen.queryByRole('button', { name: /^Save$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Send to subscribers/ })).not.toBeInTheDocument();
  });

  it('settles an unclear send with Check status', async () => {
    open({ status: 'needs_check', last_error: "We couldn't confirm whether Resend sent this issue." });
    vi.mocked(api.checkIssue).mockResolvedValue({ issue: SENT, found: true });
    await userEvent.click(await screen.findByRole('button', { name: /Check status/ }));
    expect(await screen.findByText('Resend sent it, so the issue is now marked sent.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/vitest/components/admin/IssueEditor.test.tsx`

Expected: it fails because `IssueEditor` doesn't exist.

- [ ] **Step 3: Write `components/admin/newsletter/issue-status.ts`**

```ts
// How each issue status looks in the Newsletter tab (spec §8.1).
import type { IssueStatus } from '@/lib/newsletter/issue';

export const ISSUE_STATUS: Record<IssueStatus, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-gray-100 text-gray-700' },
  sending: { label: 'Sending', className: 'bg-sky-100 text-sky-800' },
  sent: { label: 'Sent', className: 'bg-emerald-100 text-emerald-800' },
  needs_check: { label: 'Needs check', className: 'bg-amber-100 text-amber-800' },
};
```

- [ ] **Step 4: Write `components/admin/newsletter/IssueEditor.tsx`**

```tsx
'use client';

// One issue in the Newsletter tab (spec §6.2, §8.1). The fields are on the
// left and the live preview on the right, with Save, Send test and Send to
// subscribers; a sent issue is read-only. Unsaved edits are also kept in this
// browser until they are saved, so a closed tab, or a switch to another
// dashboard tab, doesn't lose them.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  ImagePlus,
  Loader2,
  RefreshCw,
  Save,
  Send,
  Trash2,
} from 'lucide-react';
import type { BodyDoc } from '@/lib/newsletter/content';
import { ISSUE_LIMITS, draftKey, sendProblems, toDraft, type IssueRow } from '@/lib/newsletter/issue';
import { uploadIssueImage } from '@/lib/newsletter/issue-image';
import {
  IssueApiError,
  UnauthorizedError,
  checkIssue,
  deleteIssue,
  getIssue,
  saveIssue,
  sendIssue,
  sendTestIssue,
  syncUntilDone,
  type IssueContext,
  type IssueDraftInput,
} from '@/lib/newsletter-admin';
import BodyEditor from './BodyEditor';
import IssuePreview, { renderPreview } from './IssuePreview';
import { SendDialog, TestSendDialog } from './IssueSendDialogs';
import { ISSUE_STATUS } from './issue-status';

export interface IssueEditorProps {
  token: string;
  id: string;
  onClose: () => void;
  onUnauthorized: () => void;
  /** Tells the tab whether leaving now would lose unsaved changes. */
  onDirtyChange?: (dirty: boolean) => void;
}

type Busy = '' | 'saving' | 'uploading' | 'testing' | 'syncing' | 'sending' | 'checking' | 'deleting';

/** Unsaved edits kept in this browser, tied to the version they were made on. */
interface Backup {
  version: string;
  draft: IssueDraftInput;
  at: string;
}

const backupKey = (id: string) => `newsletter-issue-draft:${id}`;

function readBackup(id: string): Backup | null {
  try {
    const raw = window.localStorage.getItem(backupKey(id));
    return raw ? (JSON.parse(raw) as Backup) : null;
  } catch {
    return null;
  }
}

function writeBackup(id: string, backup: Backup | null): void {
  try {
    if (backup) window.localStorage.setItem(backupKey(id), JSON.stringify(backup));
    else window.localStorage.removeItem(backupKey(id));
  } catch {
    // Storage blocked or full: the warning on leaving still protects the edits.
  }
}

const field =
  'w-full rounded-xl border border-gray-200 bg-[#F7F6F4]/50 px-3 py-2.5 text-sm outline-none transition focus:border-[#ED7428] focus:bg-white focus:ring-2 focus:ring-[#ED7428]/20 disabled:cursor-not-allowed disabled:opacity-70';
const labelClass = 'mb-1 block text-[11px] font-semibold uppercase tracking-wider text-gray-500';
const barButton =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 px-3 py-2 text-xs font-medium text-white/80 transition hover:bg-white/10 hover:text-white disabled:opacity-50 sm:px-4 sm:text-sm';
const primaryButton =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-[#ED7428] px-3 py-2 text-xs font-semibold text-white shadow-lg shadow-[#ED7428]/20 transition hover:bg-[#d4651f] disabled:opacity-50 sm:px-4 sm:text-sm';
const smallButton =
  'inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold transition hover:bg-gray-50 disabled:opacity-50';

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

function HeroThumb({ src, alt }: { src: string; alt: string }) {
  // A plain img: the photo is in Supabase Storage, which next/image isn't set up for.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className="mb-2 max-h-48 w-full rounded-xl object-cover" />;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });
}

const plural = (n: number | null) => (n === 1 ? '' : 's');

export default function IssueEditor({ token, id, onClose, onUnauthorized, onDirtyChange }: IssueEditorProps) {
  const [issue, setIssue] = useState<IssueRow | null>(null);
  const [about, setAbout] = useState<IssueContext | null>(null);
  const [draft, setDraft] = useState<IssueDraftInput | null>(null);
  const [bodyKey, setBodyKey] = useState(0);
  const [offer, setOffer] = useState<Backup | null>(null);
  const [busy, setBusy] = useState<Busy>('');
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const [dialog, setDialog] = useState<'' | 'test' | 'send'>('');
  const [previewSource, setPreviewSource] = useState<IssueDraftInput | null>(null);
  const heroInput = useRef<HTMLInputElement>(null);

  const report = useCallback(
    (e: unknown, fallback: string) => {
      if (e instanceof UnauthorizedError) {
        onUnauthorized();
        return;
      }
      setProblems(e instanceof IssueApiError ? e.problems : []);
      setError(e instanceof Error ? e.message : fallback);
    },
    [onUnauthorized],
  );

  /** Shows an issue the server sent, with its fields as the draft. */
  const adopt = useCallback((next: IssueRow) => {
    setIssue(next);
    setDraft(toDraft(next));
    setBodyKey((key) => key + 1);
  }, []);

  const load = useCallback(async () => {
    setError('');
    setConflict(false);
    try {
      const detail = await getIssue(token, id);
      adopt(detail.issue);
      setAbout({ me: detail.me, from: detail.from, subscribed: detail.subscribed });
      const backup = readBackup(id);
      const usable =
        backup &&
        backup.version === detail.issue.updated_at &&
        detail.issue.status === 'draft' &&
        draftKey(backup.draft) !== draftKey(toDraft(detail.issue));
      if (usable) setOffer(backup);
      else if (backup) writeBackup(id, null);
    } catch (e) {
      report(e, "The issue didn't load.");
    }
  }, [token, id, adopt, report]);

  useEffect(() => {
    load();
  }, [load]);

  const readOnly = !issue || issue.status !== 'draft';
  const dirty = Boolean(issue && draft && !readOnly && draftKey(draft) !== draftKey(toDraft(issue)));

  // Keep unsaved edits in this browser, and warn before they could be lost.
  useEffect(() => {
    if (!issue || !draft || readOnly || offer) return;
    if (!dirty) {
      writeBackup(id, null);
      return;
    }
    const timer = setTimeout(() => writeBackup(id, { version: issue.updated_at, draft, at: new Date().toISOString() }), 800);
    return () => clearTimeout(timer);
  }, [id, issue, draft, dirty, readOnly, offer]);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // The preview follows the fields, a moment after typing stops.
  useEffect(() => {
    if (!draft) return;
    const timer = setTimeout(() => setPreviewSource(draft), 250);
    return () => clearTimeout(timer);
  }, [draft]);
  const preview = useMemo(() => (previewSource ? renderPreview(previewSource) : null), [previewSource]);
  const blockers = useMemo(
    () =>
      preview && previewSource && about
        ? sendProblems({
            issue: previewSource,
            html: preview.sendHtml,
            bytes: preview.bytes,
            subscribed: about.subscribed,
            imagePrefixes: preview.imagePrefixes,
          })
        : [],
    [preview, previewSource, about],
  );

  const update = <K extends keyof IssueDraftInput>(key: K, value: IssueDraftInput[K]) =>
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  const onBody = useCallback((body: BodyDoc) => setDraft((current) => (current ? { ...current, body } : current)), []);
  const uploadBodyImage = useCallback((file: File) => uploadIssueImage(token, id, file), [token, id]);

  async function save(): Promise<IssueRow | null> {
    if (!issue || !draft) return null;
    setBusy('saving');
    setError('');
    setProblems([]);
    setNotice('');
    try {
      const saved = await saveIssue(token, issue.id, draft, issue.updated_at);
      setIssue(saved);
      writeBackup(id, null);
      setNotice('Saved.');
      return saved;
    } catch (e) {
      if (e instanceof IssueApiError && e.status === 409 && e.issue) {
        // Someone else saved meanwhile: keep this version, so another Save can't overwrite theirs.
        if (e.issue.status === 'draft') setConflict(true);
        else adopt(e.issue);
      }
      report(e, 'Save failed.');
      return null;
    } finally {
      setBusy('');
    }
  }

  async function runTest(to: string[]) {
    const saved = dirty ? await save() : issue;
    if (!saved) return;
    setBusy('testing');
    setError('');
    setNotice('');
    try {
      const sentTo = await sendTestIssue(token, saved.id, to);
      setNotice(`Test sent to ${sentTo.join(', ')}.`);
      setDialog('');
    } catch (e) {
      report(e, "The test didn't send.");
    } finally {
      setBusy('');
    }
  }

  async function openSend() {
    setDialog('send');
    try {
      const detail = await getIssue(token, id);
      setAbout({ me: detail.me, from: detail.from, subscribed: detail.subscribed });
    } catch {
      // The count from when the issue opened is still shown.
    }
  }

  async function runSend() {
    const saved = dirty ? await save() : issue;
    if (!saved) return;
    setError('');
    setProblems([]);
    setNotice('');
    try {
      setBusy('syncing');
      setProgress('Checking the list with Resend…');
      const sync = await syncUntilDone(token, (p) =>
        setProgress(p.remaining > 0 ? `Checking the list with Resend… ${p.remaining} left` : 'Checking the list with Resend…'),
      );
      if (sync.remaining > 0) {
        const said = sync.errors.length > 0 ? ` Resend said: ${sync.errors.join('; ')}.` : '';
        const changes = sync.remaining === 1 ? "1 subscriber change hasn't" : `${sync.remaining} subscriber changes haven't`;
        setError(`${changes} reached Resend, so nothing was sent.${said} Fix them on the Subscribers screen, then try again.`);
        setDialog('');
        return;
      }
      setBusy('sending');
      setProgress('Sending…');
      const result = await sendIssue(token, saved.id);
      adopt(result.issue);
      setDialog('');
      const count = result.issue.recipient_count;
      setNotice(result.warning ?? `Sent to ${count ?? 'every'} subscriber${plural(count)}.`);
    } catch (e) {
      if (e instanceof IssueApiError && e.issue) adopt(e.issue);
      setDialog('');
      report(e, "The newsletter wasn't sent.");
    } finally {
      setBusy('');
      setProgress('');
    }
  }

  async function runCheck() {
    if (!issue) return;
    setBusy('checking');
    setError('');
    setNotice('');
    try {
      const result = await checkIssue(token, issue.id);
      adopt(result.issue);
      setNotice(
        result.found
          ? 'Resend sent it, so the issue is now marked sent.'
          : "Resend has no record of it, so nothing went out. It's a draft again.",
      );
    } catch (e) {
      if (e instanceof IssueApiError && e.issue) adopt(e.issue);
      report(e, 'Check failed.');
    } finally {
      setBusy('');
    }
  }

  async function runDelete() {
    if (!issue || !window.confirm("Delete this draft? This can't be undone.")) return;
    setBusy('deleting');
    try {
      await deleteIssue(token, issue.id);
      writeBackup(id, null);
      onClose();
    } catch (e) {
      report(e, 'Delete failed.');
      setBusy('');
    }
  }

  function back() {
    if (dirty) {
      if (!window.confirm('You have unsaved changes. Leave without saving?')) return;
      writeBackup(id, null);
    }
    onClose();
  }

  async function uploadHero(file: File | undefined) {
    if (heroInput.current) heroInput.current.value = '';
    if (!file || !issue) return;
    setBusy('uploading');
    setError('');
    try {
      update('hero_image_url', await uploadIssueImage(token, issue.id, file));
    } catch (e) {
      report(e, "The photo didn't upload.");
    } finally {
      setBusy('');
    }
  }

  function restore() {
    if (!offer) return;
    setDraft(offer.draft);
    setBodyKey((key) => key + 1);
    setOffer(null);
  }

  function discard() {
    writeBackup(id, null);
    setOffer(null);
  }

  if (!issue || !draft) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-white p-6 text-sm text-gray-600 shadow-sm">
        {error ? (
          <>
            <AlertTriangle className="h-4 w-4 text-red-600" /> {error}
            <button type="button" onClick={onClose} className="font-semibold underline">
              Back to issues
            </button>
          </>
        ) : (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Loading the issue…
          </>
        )}
      </div>
    );
  }

  const status = ISSUE_STATUS[issue.status];
  const working = busy !== '';

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 rounded-2xl bg-gradient-to-r from-[#00373E] to-[#024a53] p-4 shadow-sm sm:p-5 lg:flex-row lg:items-center lg:gap-4">
        <button type="button" onClick={back} className={barButton}>
          <ArrowLeft className="h-4 w-4" />
          Issues
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-bold text-white sm:text-lg">{draft.subject.trim() || 'Untitled issue'}</h2>
          <p className="text-xs text-white/60 sm:text-sm">
            <span className={`mr-2 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${status.className}`}>{status.label}</span>
            {dirty ? 'Unsaved changes' : readOnly ? 'Read-only' : 'All changes saved'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {issue.status === 'draft' && (
            <>
              <button type="button" onClick={runDelete} disabled={working} className={barButton}>
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
              <button type="button" onClick={() => save()} disabled={!dirty || working} className={barButton}>
                {busy === 'saving' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save
              </button>
            </>
          )}
          <button type="button" onClick={() => setDialog('test')} disabled={working} className={barButton}>
            <Send className="h-4 w-4" />
            Send test
          </button>
          {issue.status === 'draft' && (
            <button type="button" onClick={openSend} disabled={working || blockers.length > 0} className={primaryButton}>
              <Send className="h-4 w-4" />
              Send to subscribers
            </button>
          )}
        </div>
      </div>

      {offer && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          <span className="flex-1">This browser kept changes you hadn&apos;t saved, from {formatDateTime(offer.at)}.</span>
          <button type="button" onClick={restore} className="font-semibold underline">
            Restore them
          </button>
          <button type="button" onClick={discard} className="underline">
            Discard
          </button>
        </div>
      )}
      {error && (
        <div role="alert" className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </p>
          {problems.length > 1 && (
            <ul className="mt-2 list-disc pl-10">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          {conflict && (
            <button type="button" onClick={load} className="mt-2 inline-flex items-center gap-1.5 font-semibold underline">
              <RefreshCw className="h-4 w-4" />
              Reload
            </button>
          )}
        </div>
      )}
      {notice && !error && (
        <div role="status" className="mb-4 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}
      {issue.status === 'sent' && (
        <div className="mb-4 rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-gray-700">
          Sent to {issue.recipient_count ?? 'every'} subscriber{plural(issue.recipient_count)} on {formatDateTime(issue.sent_at)}
          {issue.sent_by ? ` by ${issue.sent_by}` : ''}. A sent issue can&apos;t be changed.
          {issue.resend_broadcast_id && (
            <a
              href={`https://resend.com/broadcasts/${issue.resend_broadcast_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-2 inline-flex items-center gap-1 font-semibold text-[#ED7428] hover:underline"
            >
              Opens and clicks in Resend
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      )}
      {(issue.status === 'needs_check' || issue.status === 'sending') && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="flex-1">
            {issue.status === 'needs_check'
              ? issue.last_error
              : "This issue is being sent. If that doesn't change within two minutes, press Check status."}
          </span>
          <button type="button" onClick={runCheck} disabled={working} className={smallButton}>
            {busy === 'checking' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Check status
          </button>
        </div>
      )}
      {issue.status === 'draft' && issue.last_error && !error && (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          The last send didn&apos;t go out: {issue.last_error}
        </div>
      )}
      {issue.status === 'draft' && blockers.length > 0 && (
        <div className="mb-4 rounded-2xl bg-white px-4 py-3 text-sm text-gray-600 shadow-sm">
          <p className="font-semibold text-gray-800">Before this can be sent:</p>
          <ul className="mt-1 list-disc pl-5">
            {blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="space-y-4 rounded-2xl bg-white p-4 shadow-sm sm:p-5">
          <Field id="nl-subject" label="Subject" hint={`${draft.subject.length} of ${ISSUE_LIMITS.subject} characters`}>
            <input
              id="nl-subject"
              type="text"
              value={draft.subject}
              maxLength={ISSUE_LIMITS.subject}
              disabled={readOnly}
              onChange={(e) => update('subject', e.target.value)}
              className={field}
            />
          </Field>
          <Field
            id="nl-preheader"
            label="Inbox preview text"
            hint="Optional: the grey line after the subject in most inboxes. Left empty, it's the start of the body."
          >
            <input
              id="nl-preheader"
              type="text"
              value={draft.preheader}
              maxLength={ISSUE_LIMITS.preheader}
              disabled={readOnly}
              onChange={(e) => update('preheader', e.target.value)}
              className={field}
            />
          </Field>
          <Field id="nl-date" label="Date">
            <input
              id="nl-date"
              type="date"
              value={draft.issue_date}
              disabled={readOnly}
              onChange={(e) => update('issue_date', e.target.value)}
              className={field}
            />
          </Field>
          <Field id="nl-title" label="Title" hint="Shown in the orange banner over the photo.">
            <textarea
              id="nl-title"
              rows={2}
              value={draft.title}
              maxLength={ISSUE_LIMITS.title}
              disabled={readOnly}
              onChange={(e) => update('title', e.target.value)}
              className={field}
            />
          </Field>
          <div>
            <p className={labelClass}>Hero photo</p>
            {draft.hero_image_url ? (
              <HeroThumb src={draft.hero_image_url} alt={draft.hero_image_alt} />
            ) : (
              <div className="mb-2 flex h-24 items-center justify-center rounded-xl border border-dashed border-gray-300 text-xs text-gray-400">
                No photo yet
              </div>
            )}
            {!readOnly && (
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => heroInput.current?.click()} disabled={working} className={smallButton}>
                  {busy === 'uploading' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                  {draft.hero_image_url ? 'Replace photo' : 'Upload photo'}
                </button>
                {draft.hero_image_url && (
                  <button type="button" onClick={() => update('hero_image_url', null)} className={smallButton}>
                    Remove
                  </button>
                )}
                <input
                  ref={heroInput}
                  type="file"
                  accept="image/*"
                  hidden
                  aria-label="Choose the hero photo"
                  onChange={(e) => uploadHero(e.target.files?.[0])}
                />
              </div>
            )}
            <div className="mt-3">
              <Field
                id="nl-hero-alt"
                label="Photo description (alt text)"
                hint="For people who can't see images, and for inboxes that block them."
              >
                <input
                  id="nl-hero-alt"
                  type="text"
                  value={draft.hero_image_alt}
                  maxLength={ISSUE_LIMITS.heroAlt}
                  disabled={readOnly}
                  onChange={(e) => update('hero_image_alt', e.target.value)}
                  className={field}
                />
              </Field>
            </div>
          </div>
          <div>
            <p className={labelClass}>Body</p>
            <BodyEditor key={bodyKey} initial={draft.body} readOnly={readOnly} onChange={onBody} onUploadImage={uploadBodyImage} />
          </div>
          <Field
            id="nl-share"
            label="Blog link for the Share button"
            hint="Optional. The Share button sends this link on WhatsApp. Left empty, it's the blog page."
          >
            <input
              id="nl-share"
              type="url"
              value={draft.share_url ?? ''}
              placeholder="https://hopetrustindia.com/blogs/"
              disabled={readOnly}
              onChange={(e) => update('share_url', e.target.value || null)}
              className={field}
            />
          </Field>
        </div>
        <div className="xl:sticky xl:top-4 xl:self-start">
          {preview ? (
            <IssuePreview html={preview.html} bytes={preview.bytes} />
          ) : (
            <div className="rounded-2xl bg-white p-6 text-sm text-gray-400 shadow-sm">Preparing the preview…</div>
          )}
        </div>
      </div>

      {dialog === 'test' && about && (
        <TestSendDialog
          defaultTo={about.me}
          busy={busy === 'testing' || busy === 'saving'}
          onSend={runTest}
          onClose={() => setDialog('')}
        />
      )}
      {dialog === 'send' && about && (
        <SendDialog
          subject={draft.subject}
          from={about.from}
          subscribed={about.subscribed}
          busy={busy === 'saving' || busy === 'syncing' || busy === 'sending'}
          progress={progress}
          onSend={runSend}
          onClose={() => setDialog('')}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run the tests and tsc**

Run: `npx vitest run tests/vitest/components/admin/IssueEditor.test.tsx` and `npx tsc --noEmit -p tsconfig.json`

Expected: the tests pass, and tsc reports 0 errors.

- [ ] **Step 6: Commit**

```bash
git add components/admin/newsletter/issue-status.ts components/admin/newsletter/IssueEditor.tsx tests/vitest/components/admin/IssueEditor.test.tsx
git commit -m "feat(newsletter): issue editor: fields, live preview, save with conflict check, test, send, check status" -m "Unsaved edits are kept in this browser until saved, and leaving with unsaved changes asks first." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: The Issues screen, and the tab with both screens

**Files:**
- Create: `components/admin/newsletter/IssuesScreen.tsx`
- Modify: `components/admin/newsletter/NewsletterTab.tsx`, replacing the whole file
- Test: `tests/vitest/components/admin/IssuesScreen.test.tsx`, `tests/vitest/components/admin/NewsletterTab.test.tsx`

**Interfaces:**
- **Consumes:** `listIssues` and `createIssue` (Task 8); `ISSUE_STATUS` and `IssueEditor` (Task 12); `formatDate` (plan 2, `SubscribersScreen.tsx`); `formatIssueDate` (render.ts).
- **Produces:**
  - `default IssuesScreen({ token, onUnauthorized, onOpen(id) })`;
  - `NewsletterTab` with Issues and Subscribers tabs (`role="tab"`), Issues first. The editor loads with `next/dynamic` only when an issue is opened.

- [ ] **Step 1: Write the failing tests**

`tests/vitest/components/admin/IssuesScreen.test.tsx`:

```tsx
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { IssueRow } from '@/lib/newsletter/issue';

vi.mock('@/lib/newsletter-admin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/newsletter-admin')>()),
  listIssues: vi.fn(),
  createIssue: vi.fn(),
}));

import IssuesScreen from '@/components/admin/newsletter/IssuesScreen';
import * as api from '@/lib/newsletter-admin';

afterEach(() => {
  vi.resetAllMocks();
});

describe('IssuesScreen', () => {
  it('lists the issues with their status, and opens one', async () => {
    vi.mocked(api.listIssues).mockResolvedValue({
      issues: [
        {
          id: 'b',
          subject: 'October',
          issue_date: '2026-10-14',
          status: 'sent',
          recipient_count: 312,
          sent_at: '2026-10-14T10:10:00.000Z',
          last_error: null,
          updated_at: '2026-10-14T10:10:00.000Z',
        },
        {
          id: 'a',
          subject: '',
          issue_date: '2026-10-20',
          status: 'draft',
          recipient_count: null,
          sent_at: null,
          last_error: null,
          updated_at: '2026-10-14T09:00:00.000Z',
        },
      ],
      me: 'admin@hopetrustindia.com',
      from: 'Hope Trust <newsletter@hopetrustindia.com>',
      subscribed: 312,
    });
    const onOpen = vi.fn();
    render(<IssuesScreen token="tkn" onUnauthorized={() => {}} onOpen={onOpen} />);
    expect(await screen.findByRole('button', { name: 'October' })).toBeInTheDocument();
    expect(screen.getByText('14th October, 2026')).toBeInTheDocument();
    expect(screen.getByText('Sent')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('312')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '(no subject)' }));
    expect(onOpen).toHaveBeenCalledWith('a');
  });

  it('starts a new issue and opens it', async () => {
    vi.mocked(api.listIssues).mockResolvedValue({ issues: [], me: 'a@x.com', from: 'x', subscribed: 0 });
    vi.mocked(api.createIssue).mockResolvedValue({ id: 'new-id' } as IssueRow);
    const onOpen = vi.fn();
    render(<IssuesScreen token="tkn" onUnauthorized={() => {}} onOpen={onOpen} />);
    expect(await screen.findByText(/No issues yet/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /New issue/ }));
    expect(onOpen).toHaveBeenCalledWith('new-id');
  });

  it('sends an expired session back to the login', async () => {
    vi.mocked(api.listIssues).mockRejectedValue(new api.UnauthorizedError());
    const onUnauthorized = vi.fn();
    render(<IssuesScreen token="tkn" onUnauthorized={onUnauthorized} onOpen={() => {}} />);
    await vi.waitFor(() => expect(onUnauthorized).toHaveBeenCalled());
  });
});
```

`tests/vitest/components/admin/NewsletterTab.test.tsx`:

```tsx
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/components/admin/newsletter/IssuesScreen', () => ({
  default: ({ onOpen }: { onOpen: (id: string) => void }) => (
    <button type="button" onClick={() => onOpen('issue-1')}>
      Open issue 1
    </button>
  ),
}));
vi.mock('@/components/admin/newsletter/SubscribersScreen', () => ({
  default: () => <h2>Newsletter subscribers</h2>,
}));
vi.mock('@/components/admin/newsletter/IssueEditor', () => ({
  default: ({ id, onClose, onDirtyChange }: { id: string; onClose: () => void; onDirtyChange?: (dirty: boolean) => void }) => (
    <div>
      <p>Editing {id}</p>
      <button type="button" onClick={() => onDirtyChange?.(true)}>
        Make a change
      </button>
      <button type="button" onClick={onClose}>
        Close editor
      </button>
    </div>
  ),
}));

import NewsletterTab from '@/components/admin/newsletter/NewsletterTab';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('NewsletterTab', () => {
  it('shows Issues first, and opens an issue in the editor', async () => {
    render(<NewsletterTab token="tkn" onUnauthorized={() => {}} />);
    expect(screen.getByRole('tab', { name: 'Issues' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Open issue 1' }));
    expect(await screen.findByText('Editing issue-1')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Close editor' }));
    expect(screen.getByRole('button', { name: 'Open issue 1' })).toBeInTheDocument();
  });

  it('asks before switching screens with unsaved changes', async () => {
    render(<NewsletterTab token="tkn" onUnauthorized={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open issue 1' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Make a change' }));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await userEvent.click(screen.getByRole('tab', { name: 'Subscribers' }));
    expect(confirm).toHaveBeenCalled();
    expect(screen.getByText('Editing issue-1')).toBeInTheDocument();
    confirm.mockReturnValue(true);
    await userEvent.click(screen.getByRole('tab', { name: 'Subscribers' }));
    expect(screen.getByRole('heading', { name: 'Newsletter subscribers' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/vitest/components/admin/IssuesScreen.test.tsx tests/vitest/components/admin/NewsletterTab.test.tsx`

Expected: `IssuesScreen` doesn't exist, and the current `NewsletterTab` has no tabs.

- [ ] **Step 3: Write `components/admin/newsletter/IssuesScreen.tsx`**

```tsx
'use client';

// The Issues screen of the Newsletter tab (spec §8.1): every issue, newest
// first, with its status. New issue starts a draft and opens it.

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, FilePlus2, Loader2 } from 'lucide-react';
import { UnauthorizedError, createIssue, listIssues, type IssueList } from '@/lib/newsletter-admin';
import { formatIssueDate } from '@/lib/newsletter/render';
import { ISSUE_STATUS } from './issue-status';
import { formatDate } from './SubscribersScreen';

export interface IssuesScreenProps {
  token: string;
  onUnauthorized: () => void;
  onOpen: (id: string) => void;
}

function issueDate(iso: string): string {
  try {
    return formatIssueDate(iso);
  } catch {
    return iso;
  }
}

export default function IssuesScreen({ token, onUnauthorized, onOpen }: IssuesScreenProps) {
  const [data, setData] = useState<IssueList | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const fail = useCallback(
    (e: unknown, fallback: string) => {
      if (e instanceof UnauthorizedError) onUnauthorized();
      else setError(e instanceof Error ? e.message : fallback);
    },
    [onUnauthorized],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await listIssues(token));
    } catch (e) {
      fail(e, "The issues didn't load.");
    } finally {
      setLoading(false);
    }
  }, [token, fail]);

  useEffect(() => {
    load();
  }, [load]);

  async function newIssue() {
    setCreating(true);
    setError('');
    try {
      const issue = await createIssue(token);
      onOpen(issue.id);
    } catch (e) {
      fail(e, "A new issue couldn't be started.");
      setCreating(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 rounded-2xl bg-gradient-to-r from-[#00373E] to-[#024a53] p-4 shadow-sm sm:flex-row sm:items-center sm:p-5">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-white sm:text-lg">Newsletter issues</h2>
          <p className="text-xs text-white/60 sm:text-sm">
            {data ? `${data.subscribed} subscribed · sent from ${data.from}` : 'Loading…'}
          </p>
        </div>
        <button
          type="button"
          onClick={newIssue}
          disabled={creating}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#ED7428] px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-[#ED7428]/20 transition hover:bg-[#d4651f] disabled:opacity-60"
        >
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePlus2 className="h-4 w-4" />}
          New issue
        </button>
      </div>

      {error && (
        <div role="alert" className="mb-4 flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-gray-100 text-[11px] uppercase tracking-wider text-gray-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Subject</th>
              <th className="px-4 py-3 font-semibold">Date</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Recipients</th>
              <th className="px-4 py-3 font-semibold">Sent on</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading && !data ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-gray-400">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td>
              </tr>
            ) : data && data.issues.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-gray-500">
                  No issues yet. Press New issue to write the first one.
                </td>
              </tr>
            ) : (
              data?.issues.map((issue) => {
                const status = ISSUE_STATUS[issue.status];
                return (
                  <tr key={issue.id} className="hover:bg-[#F7F6F4]/60">
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => onOpen(issue.id)}
                        className="text-left font-semibold text-[#00373E] hover:text-[#ED7428] hover:underline"
                      >
                        {issue.subject.trim() || '(no subject)'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{issueDate(issue.issue_date)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${status.className}`}>{status.label}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{issue.recipient_count ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(issue.sent_at)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Replace `components/admin/newsletter/NewsletterTab.tsx`**

```tsx
'use client';

// The Newsletter tab in /arel-ops (spec §8): Issues and Subscribers. The issue
// editor, with the TipTap editor inside it, loads only when an issue is
// opened, so the rest of the dashboard stays light.

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import IssuesScreen from './IssuesScreen';
import SubscribersScreen from './SubscribersScreen';

const IssueEditor = dynamic(() => import('./IssueEditor'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center gap-2 rounded-2xl bg-white p-6 text-sm text-gray-500 shadow-sm">
      <Loader2 className="h-4 w-4 animate-spin" />
      Opening the editor…
    </div>
  ),
});

export interface NewsletterTabProps {
  token: string;
  onUnauthorized: () => void;
}

type Screen = 'issues' | 'subscribers';
const LEAVE = 'You have unsaved changes in this issue. Leave without saving?';

/** The Newsletter tab in /arel-ops. */
export default function NewsletterTab({ token, onUnauthorized }: NewsletterTabProps) {
  const [screen, setScreen] = useState<Screen>('issues');
  const [openId, setOpenId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  function show(next: Screen) {
    if (dirty && !window.confirm(LEAVE)) return;
    setDirty(false);
    setOpenId(null);
    setScreen(next);
  }

  const tab = (value: Screen, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={screen === value}
      onClick={() => show(value)}
      className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
        screen === value ? 'bg-[#00373E] text-white shadow-sm' : 'text-gray-600 hover:bg-white'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div>
      <div role="tablist" aria-label="Newsletter screens" className="mb-5 inline-flex gap-1 rounded-2xl bg-[#F7F6F4] p-1">
        {tab('issues', 'Issues')}
        {tab('subscribers', 'Subscribers')}
      </div>
      {screen === 'subscribers' ? (
        <SubscribersScreen token={token} onUnauthorized={onUnauthorized} />
      ) : openId ? (
        <IssueEditor
          key={openId}
          token={token}
          id={openId}
          onUnauthorized={onUnauthorized}
          onDirtyChange={setDirty}
          onClose={() => {
            setDirty(false);
            setOpenId(null);
          }}
        />
      ) : (
        <IssuesScreen token={token} onUnauthorized={onUnauthorized} onOpen={setOpenId} />
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run the component suites and tsc**

Run: `npx vitest run tests/vitest/components/admin/` and `npx tsc --noEmit -p tsconfig.json`

Expected: all pass, and tsc reports 0 errors.

- [ ] **Step 6: Commit**

```bash
git add components/admin/newsletter/IssuesScreen.tsx components/admin/newsletter/NewsletterTab.tsx tests/vitest/components/admin/IssuesScreen.test.tsx tests/vitest/components/admin/NewsletterTab.test.tsx
git commit -m "feat(newsletter): Issues screen, and the Newsletter tab with Issues and Subscribers" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: End-to-end tests

**Files:**
- Modify: `tests/e2e/newsletter.spec.ts`

**Interfaces:**
- **Consumes:** the whole Newsletter tab (Tasks 9–13), with the API answered by the test.

- [ ] **Step 1: Make the footer-dialog test wait for hydration**

Plan 2's final review found that this test sometimes fails under parallel load. A click that lands before React hydrates is lost. In the test `from the footer dialog`, replace:

```ts
    await page.goto('/contact/');
    await page.getByRole('button', { name: 'Subscribe to our newsletter' }).click();
    const dialog = page.getByRole('dialog', { name: 'Subscribe to our newsletter' });
```

with:

```ts
    await page.goto('/contact/');
    const dialog = page.getByRole('dialog', { name: 'Subscribe to our newsletter' });
    // On a cold start, a click before React hydrates the page can be lost, so retry until the dialog opens.
    await expect(async () => {
      if (!(await dialog.isVisible())) await page.getByRole('button', { name: 'Subscribe to our newsletter' }).click();
      await expect(dialog.getByLabel('Full name')).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 15_000 });
```

- [ ] **Step 2: Open the Subscribers screen in the admin test**

In `lists subscribers from the API`, after `await page.getByRole('button', { name: 'Newsletter' }).click();`, add:

```ts
    await page.getByRole('tab', { name: 'Subscribers' }).click();
```

- [ ] **Step 3: Add the editor test (spec §13)**

Inside `test.describe('Admin newsletter tab', …)`, add:

```ts
  test('writes an issue with a live preview and saves it', async ({ page }) => {
    const payload = Buffer.from(
      JSON.stringify({ email: 'admin@example.com', role: 'admin', exp: Math.floor(Date.now() / 1000) + 3600 }),
    ).toString('base64');
    await page.addInitScript((token) => {
      sessionStorage.setItem('admin_token', token);
      sessionStorage.setItem('admin_email', 'admin@example.com');
    }, `e30.${payload}.signature`);
    const issue = {
      id: '11111111-1111-4111-8111-000000000001',
      subject: 'October',
      preheader: '',
      issue_date: '2026-10-14',
      title: 'Know Thyself',
      hero_image_url: null,
      hero_image_alt: '',
      body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello readers' }] }] },
      share_url: null,
      status: 'draft',
      last_error: null,
      resend_broadcast_id: null,
      recipient_count: null,
      sent_at: null,
      sent_by: null,
      created_by: 'admin@example.com',
      updated_by: null,
      created_at: '2026-10-14T10:00:00.000Z',
      updated_at: '2026-10-14T10:00:00.000Z',
    };
    const about = { me: 'admin@example.com', from: 'Hope Trust <newsletter@hopetrustindia.com>', subscribed: 2 };
    let saved: Record<string, unknown> | null = null;
    await page.route('**/api/admin-newsletter-issues**', async (route) => {
      const request = route.request();
      const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      if (request.method() === 'PATCH') {
        saved = request.postDataJSON();
        return json({ issue: { ...issue, ...saved, updated_at: '2026-10-14T10:05:00.000Z' } });
      }
      if (new URL(request.url()).searchParams.get('id')) return json({ issue, ...about });
      return json({ issues: [issue], ...about });
    });

    await page.goto('/arel-ops/');
    await page.getByRole('button', { name: 'Newsletter' }).click();
    await page.getByRole('button', { name: 'October' }).click();
    const title = page.getByLabel('Title', { exact: true });
    await expect(title).toHaveValue('Know Thyself');
    await title.fill('Know Yourself First');
    const preview = page.frameLocator('iframe[title="Email preview"]');
    await expect(preview.getByText('Know Yourself First')).toBeVisible();

    const body = page.getByRole('textbox', { name: 'Body' });
    await body.click();
    await page.keyboard.press('End');
    await page.keyboard.type(' and friends');
    await expect(preview.getByText('Hello readers and friends')).toBeVisible();

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Saved.')).toBeVisible();
    expect(saved).toMatchObject({ title: 'Know Yourself First', updated_at: '2026-10-14T10:00:00.000Z' });
    expect(JSON.stringify(saved)).toContain('Hello readers and friends');
  });
```

- [ ] **Step 4: Run the e2e suite against a dev server**

Start a dev server in the background, with output to `.superpowers/sdd/2026-10-14-newsletter-phase-3-issues/dev-server.log`, then wait for it:

```bash
npm run dev
curl --retry 60 --retry-delay 2 --retry-connrefused -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/
```

Run:

```bash
E2E_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/newsletter.spec.ts --project=chromium --reporter=list
E2E_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/newsletter.spec.ts --project=chromium --reporter=list --repeat-each=3
```

Expected: all pass, including 3 out of 3 of the repeated footer test. Stop this dev server afterwards: Task 16's production build writes into the same `.next` folder.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/newsletter.spec.ts
git commit -m "test(newsletter): e2e for the issue editor and preview; the footer test waits for hydration" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: An hourly clean-up, so the privacy promises hold on quiet days

Plan 2 left this for plan 3. The privacy policy promises that unconfirmed sign-ups go after 30 days and sign-up request IPs after a day. Today both clean-ups run only when a sign-up arrives, or when the Subscribers list loads.

**Files:**
- Modify: `netlify/functions/_shared/newsletter-signup.mts`, appending `runCleanup`
- Create: `netlify/functions/newsletter-cleanup.mts`
- Modify: the spec, §7.2 step 5
- Test: `tests/vitest/functions/newsletter/cleanup.test.ts`

**Interfaces:**
- **Produces:**
  - `runCleanup(deps): Promise<{ pending: number; requests: number }>`;
  - the scheduled function `newsletter-cleanup`, with `config = { schedule: '@hourly' }`.

- [ ] **Step 1: Write the failing test**

`tests/vitest/functions/newsletter/cleanup.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { runCleanup } from '@/netlify/functions/_shared/newsletter-signup.mts';
import { config } from '@/netlify/functions/newsletter-cleanup.mts';
import { makeDeps } from './fakes';

const DAY = 24 * 60 * 60_000;

describe('newsletter-cleanup', () => {
  it('runs every hour', () => {
    expect(config).toEqual({ schedule: '@hourly' });
  });

  it('deletes sign-ups left unconfirmed for 30 days and request IPs older than a day, and nothing else', async () => {
    const t = makeDeps();
    const now = t.clock.now().getTime();
    const iso = (ms: number) => new Date(ms).toISOString();
    t.memory.seed({ email: 'stale@example.com', status: 'pending', confirm_sent_at: iso(now - 31 * DAY) });
    t.memory.seed({ email: 'recent@example.com', status: 'pending', confirm_sent_at: iso(now - 29 * DAY) });
    t.memory.seed({ email: 'left@example.com', status: 'unsubscribed', created_at: iso(now - 90 * DAY) });
    await t.deps.db.recordRequest('198.51.100.1', iso(now - DAY - 60_000));
    await t.deps.db.recordRequest('198.51.100.2', iso(now - DAY + 60_000));
    expect(await runCleanup(t.deps)).toEqual({ pending: 1, requests: 1 });
    expect(t.memory.byEmail('stale@example.com')).toBeUndefined();
    expect(t.memory.byEmail('recent@example.com')).toBeDefined();
    expect(t.memory.byEmail('left@example.com')).toBeDefined();
    expect(t.memory.requests.map((r) => r.ip)).toEqual(['198.51.100.2']);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/vitest/functions/newsletter/cleanup.test.ts`

Expected: it fails because `runCleanup` and the function module don't exist.

- [ ] **Step 3: Append `runCleanup` to `newsletter-signup.mts`**

```ts
/**
 * Both clean-ups of spec §7.2 step 5: pending sign-ups after 30 days, and
 * logged sign-up requests after a day. The hourly newsletter-cleanup function
 * runs this, so the promises hold even when nobody signs up.
 */
export async function runCleanup(deps: NewsletterDeps): Promise<{ pending: number; requests: number }> {
  const now = deps.now().getTime();
  const [pending, requests] = await Promise.all([
    deps.db.deleteStalePending(iso(now - SIGNUP_RULES.pendingLifetimeMs)),
    deps.db.deleteRequestsBefore(iso(now - SIGNUP_RULES.requestLogLifetimeMs)),
  ]);
  return { pending, requests };
}
```

- [ ] **Step 4: Write `netlify/functions/newsletter-cleanup.mts`**

```ts
// Runs every hour on Netlify (a scheduled function, published deploys only),
// so the privacy policy's promises hold even on days without sign-ups:
// unconfirmed sign-ups go after 30 days, and sign-up request IPs after a day
// (spec §7.2 step 5, §10.5).
import { liveDeps } from './_shared/newsletter-deps.mts';
import { runCleanup } from './_shared/newsletter-signup.mts';

export default async () => {
  const deps = liveDeps();
  if (!deps) return new Response('Server misconfiguration', { status: 500 });
  const deleted = await runCleanup(deps);
  console.log('[newsletter-cleanup]', JSON.stringify(deleted));
  return new Response(JSON.stringify(deleted), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

export const config = { schedule: '@hourly' };
```

- [ ] **Step 5: Update the spec**

In §7.2 step 5, after "Each sign-up also deletes logged requests (step 3) older than a day.", add:

```markdown
 The hourly scheduled function `newsletter-cleanup` runs both clean-ups too, so they hold on days without sign-ups.
```

Keep the leading space: the sentence continues the same paragraph.

- [ ] **Step 6: Run the tests, and check the bundle**

Run:

```bash
npx vitest run tests/vitest/functions/newsletter/
npx netlify functions:build --src netlify/functions --functions .superpowers/sdd/2026-10-14-newsletter-phase-3-issues/fn-build
```

Expected: all the tests pass, and `newsletter-cleanup.zip` is built.

- [ ] **Step 7: Commit**

```bash
git add netlify/functions/_shared/newsletter-signup.mts netlify/functions/newsletter-cleanup.mts tests/vitest/functions/newsletter/cleanup.test.ts docs/superpowers/specs/2026-10-13-newsletter-design.md
git commit -m "feat(newsletter): hourly clean-up of stale sign-ups and request IPs" -m "The privacy policy's 30-day and 24-hour promises now hold on days with no sign-ups." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Phase 4: remove the old code, update the docs, and build

**Files:**
- Delete: `lib/newsletter-template.ts`, `scripts/test-newsletter.mjs`
- Modify: `docs/claude.md`, and the spec (§8.1, §9.1, §14)

- [ ] **Step 1: Confirm nothing uses the old files, then delete them**

Run: `grep -rn "newsletter-template\|test-newsletter" --include=*.ts --include=*.tsx --include=*.mjs --include=*.mts --include=*.json . | grep -v node_modules | grep -v "^./out/" | grep -v "^./.next/"`

Expected: only lines inside `scripts/test-newsletter.mjs` itself.

Then run: `git rm lib/newsletter-template.ts scripts/test-newsletter.mjs`

- [ ] **Step 2: Update `docs/claude.md`**

1. In the intro sentence of "Disabled Features", change "(marked `PAYMENT DISABLED`, `NEWSLETTER DISABLED`, or `WHATSAPP CRM DISABLED`)" to "(marked `PAYMENT DISABLED` or `WHATSAPP CRM DISABLED`)".
2. Delete the whole `### Newsletter` subsection under "Disabled Features", from its heading to the line `- \`newsletter_subscribers\` database table`.
3. In "How to re-enable", step 1, remove `` `NEWSLETTER DISABLED`, `` from the list.
4. In the tech table, change the Email row's description to `Resend REST API (newsletter broadcasts, confirmation, enrollment and test emails)`.
5. In the file tree:
   - delete the lines for `newsletter-template.ts`, for `supabase/functions/send-newsletter/` and its `index.ts`, and for `test-newsletter.mjs`;
   - after the `NewsletterForm.tsx` line, add `│   ├── admin/newsletter/       # Newsletter tab: issues, editor, preview, subscribers`;
   - after the `enrollments-admin.ts` line, add `│   ├── newsletter/             # Newsletter: issue rules, renderer, sign-up rules, import`.
6. After the "Disabled Features" section, add:

```markdown
## Newsletter (October 2026)

Staff write and send a monthly email newsletter from the **Newsletter** tab in `/arel-ops`. The design is in `docs/superpowers/specs/2026-10-13-newsletter-design.md`, and the plans that built it are in `docs/superpowers/plans/`.

- **Sign-up:** `components/NewsletterForm.tsx` sits in the footer dialog, on the blog listing and in the homepage card. People confirm by email, through `/newsletter/confirm/`.
- **Functions:** these are TypeScript `.mts` files in `netlify/functions/`: `newsletter-subscribe`, `newsletter-confirm`, `admin-newsletter-subscribers`, `admin-newsletter-issues`, and the hourly `newsletter-cleanup`. The shared code is in `netlify/functions/_shared/newsletter-*.mts`. Its services come in through `newsletter-deps.mts`, so the tests use in-memory versions (`tests/vitest/functions/newsletter/fakes.ts`).
- **The email:** `lib/newsletter/render.ts` builds the HTML for the editor's preview, the test send and the broadcast. `node --env-file=.env scripts/newsletter-preview.mts` renders the sample issue, and `--send you@example.com` emails it as a test.
- **Data:** `Database/newsletter.sql` holds subscribers, erased addresses, sign-up requests and issues; `Database/newsletter-storage.sql` holds the `newsletter-images` bucket. Apply SQL changes in the Supabase SQL editor.
- **Resend:** it needs a Full access key (`RESEND_API_KEY`), the "Newsletter" segment (`RESEND_NEWSLETTER_SEGMENT_ID`) and `NEWSLETTER_FROM_EMAIL`. Supabase is the record of consent. Resend holds a copy of the subscribed contacts, sends the broadcasts and hosts the unsubscribe page.
- **Admin sign-in:** `node --env-file=.env scripts/seed-admin.mjs <email> <password>` creates an admin, or resets an admin's password.
```

- [ ] **Step 3: Add the "as built" notes to the spec**

After the §8.1 bullet list, add:

```markdown
**As built in plan 3:**

- The editor keeps unsaved edits in the browser's local storage until they are saved, and offers them back when the issue is opened again.
- A save sends every field, with the version the editor loaded. If someone else saved in between, the save is refused (409), and the editor offers Reload.
- A sent issue links to its broadcast in Resend, where its opens and clicks are.
```

After §9.1's numbered list, add:

```markdown
**As built in plan 3:**

- **Sync before sending:**
  - The Send dialog first runs the full sync (pull and push) through the Subscribers API, then calls send.
  - The send function's own sync is push-only, with a 4-second budget, so the call stays inside Netlify's 10 seconds.
  - It won't send while any change still waits for Resend, and it names the addresses Resend refused.
- **Check status:**
  - The broadcast's `name` is the subject followed by `[issue <id>]`, and Check status looks for that marker.
  - An issue still `sending` after two minutes can be checked too, for example when Netlify stopped the function.
- **Timeout:** creating the broadcast times out after 4 seconds, and a timeout counts as an unclear outcome (step 8).
- **Recipient count:** `recipient_count` is the number of subscribed rows after the sync, because Resend doesn't return a count.
- **Links:** newsletter links always point at `https://hopetrustindia.com`, even when the email is rendered under `netlify dev`.
```

In §14, after item 4 ("Clean-up"), add:

```markdown

Phases 3 and 4 were built in plan 3 (`docs/superpowers/plans/2026-10-14-newsletter-phase-3-issues.md`).
```

- [ ] **Step 4: Verify everything, with no dev server running**

Run:

```bash
npx vitest run
npx tsc --noEmit -p tsconfig.json
npm run build
```

Expected:
- **vitest:** the only failures are the 7 known ones (`Header.test.tsx` 1, `pages/contact.test.tsx` 6).
- **tsc:** 0 errors.
- **build:** the static export succeeds and writes `out/arel-ops/index.html`.

Also run the scratch type-check over `netlify/functions` that plan 2 used, with a temporary tsconfig that extends `tsconfig.json`, includes `netlify/functions/**/*.mts` and `tests/vitest/functions/newsletter/**/*.ts`, and sets `allowImportingTsExtensions`. Delete the temporary file afterwards. Expected: no new errors in the files this plan created or changed.

- [ ] **Step 5: Commit**

```bash
git add -A lib/newsletter-template.ts scripts/test-newsletter.mjs docs/claude.md docs/superpowers/specs/2026-10-13-newsletter-design.md
git commit -m "chore(newsletter): remove the old template and test script; document the newsletter" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: The whole flow with real services (phase 3 exit)

Spec §14 phase 3's exit is a real issue going from draft to inboxes. This task runs locally under `netlify dev`, against the live Supabase database and Resend account. It needs the user: their inbox, the `/arel-ops` login, and Gmail's "Show original".

**Files:**
- Modify: the spec, adding §18 "Phase 3 results"

- [ ] **Step 1: Check what it needs**

- **Section 6 of the SQL is live:** run Task 1 Step 4. If it isn't, ask the user to paste it, and check again.
- **`.env` has everything:** run `node --env-file=.env -e "for (const k of ['NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','ADMIN_JWT_SECRET','RESEND_API_KEY','RESEND_NEWSLETTER_SEGMENT_ID','NEWSLETTER_FROM_EMAIL']) console.log(k, process.env[k] ? 'set' : 'MISSING')"`. Expected: every line says `set`.
- **Ask the user:**
  - the inbox to use (`akashdeepdash@gmail.com`, as in plan 2's check);
  - that they're fine sending one real broadcast to a segment that holds only that address;
  - that the test issue stays in the list as sent, since sent issues can't be deleted. Offer to remove it with SQL afterwards.

- [ ] **Step 2: Start the site with its functions**

Stop any dev server on port 3000. `netlify dev` mis-serves every page while an `out/` export exists, which is a Windows path bug. So move `out/` aside, start `netlify dev`, and wait for it:

```bash
mv out out.stale-plan3
npx netlify dev --offline
curl --retry 60 --retry-delay 2 --retry-connrefused -s -o /dev/null -w "%{http_code}\n" http://localhost:8888/arel-ops/
```

Run `npx netlify dev --offline` in the background, with its log at `.superpowers/sdd/2026-10-14-newsletter-phase-3-issues/netlify-dev.log`. Expected: `200`.

- [ ] **Step 3: Write and preview an issue**

The user does this at http://localhost:8888/arel-ops/:
1. Newsletter → Issues → **New issue**.
2. Fill in:
   - **Subject and title:** anything;
   - **Hero photo:** a phone photo over 1,200 px wide, with its description;
   - **Body:** a paragraph pasted from Google Docs or Word with bold, a heading and an image (the image should be left out, with the note), a link, a list, a pull-quote and an image added with the Image button.
3. Check the preview at Desktop and Phone width, and the size note.
4. Press **Save**.

Check the issue row (read-only):

```sql
select status, subject, issue_date, hero_image_url like '%/newsletter-images/issues/%' as hero_in_bucket,
       jsonb_array_length(body->'content') as blocks, created_by
from public.newsletter_issues order by created_at desc limit 1;
```

Check that the hero image is at most 1,200 px wide: open its URL in the browser, or `curl` the first bytes and read the size.

- [ ] **Step 4: Send a test**

The user presses **Send test**, keeps `akashdeepdash@gmail.com`, and opens the email in Gmail on a computer and on a phone. They check:
- the layout;
- that the photos show;
- **Book your session** opens the site with `utm_source=newsletter`;
- **Share** opens WhatsApp with the title and link;
- **Unsubscribe** opens the site (a test).

- [ ] **Step 5: Send a real broadcast to one subscriber**

1. On http://localhost:8888/, sign up `akashdeepdash@gmail.com` and confirm it from the email. The segment then holds exactly one subscribed contact. Check that with `node --env-file=.env .newsletter-preview/segment.mts`.
2. In the issue, press **Send to subscribers**. The dialog should show "1 subscriber". Then press **Send now**. Expected: "Sent to 1 subscriber.", with a link to the broadcast in Resend.
3. In Gmail, open the newsletter and use **Show original**. Record whether SPF, DKIM and DMARC pass, and whether `List-Unsubscribe` and `List-Unsubscribe-Post` are there (spec §6.6).
4. Press **Unsubscribe** in the email. Expected: Resend's unsubscribe page. Note whether it is branded (spec §4 step 3). `segment.mts` shows the address `UNSUBSCRIBED`.
5. In `/arel-ops` → Subscribers, press **Sync with Resend**. Expected: "1 unsubscribed from an email", and the row shows "unsubscribed from an email".

- [ ] **Step 6: Clean up**

1. Delete the test subscriber in `/arel-ops`.
2. If the user wants the test issue gone, they paste `delete from public.newsletter_issues where id = '<id>';` into the SQL editor.
3. Stop `netlify dev`, then run `mv out.stale-plan3 out`.

- [ ] **Step 7: Record the results in the spec**

Append to the spec:

```markdown
## 18. Phase 3 results

Recorded <date>, from plan 3 (`docs/superpowers/plans/2026-10-14-newsletter-phase-3-issues.md`). The check ran under `netlify dev` against the live Supabase database and Resend account.

| Check | Result |
|---|---|
| Issue created, saved, reopened | <…> |
| Hero photo resized to ≤1,200 px and uploaded to `issues/<id>/` | <…> |
| Paste from Google Docs or Word reduced to the allowed content; pasted image left out with the note | <…> |
| Preview at Desktop and Phone width; size shown | <…> |
| Test email: layout, photos, links with UTM tags, Share, Unsubscribe → site | <…> |
| Broadcast to the one-subscriber segment arrived | <…> |
| SPF / DKIM / DMARC in Gmail's "Show original" | <…> |
| `List-Unsubscribe` and `List-Unsubscribe-Post` headers (spec §6.6) | <…> |
| Unsubscribe link → Resend's page (branded or not) → contact unsubscribed → Sync → row unsubscribed (source resend) | <…> |
| Netlify bundles `admin-newsletter-issues` and `newsletter-cleanup` | <…> |
```

Fill in each cell with what was actually seen.

- [ ] **Step 8: Commit**

```bash
git add docs/superpowers/specs/2026-10-13-newsletter-design.md
git commit -m "docs(newsletter): record phase 3 checks" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 18: Final review, push, and the go-live decision

- [ ] **Step 1: Review the whole of plan 3**

Review the diff from the commit before Task 1 to HEAD. Leave out `package-lock.json`. The review covers:
- the Review Focus list;
- the spec sections this plan implements;
- the Global Constraints.

Fix what it finds, re-run the checks in Task 16 Step 4, and commit the fixes.

- [ ] **Step 2: Push**

Run: `git push origin feat-newsletter`

There is no pull request yet, so nothing deploys.

- [ ] **Step 3: Ask the user whether to go live**

Merging to `main` deploys sign-ups and sending together. Present this checklist:

1. **Hope Trust approvals:** the privacy-policy newsletter section, including the 24-hour IP sentence, and the homepage card's sentence.
2. **Netlify environment variables**, for production, with the Functions scope: `RESEND_API_KEY` (the Full access key), `RESEND_NEWSLETTER_SEGMENT_ID` and `NEWSLETTER_FROM_EMAIL`.
3. **Resend:**
   - the unpaid invoice is settled;
   - the unsubscribe page is branded (spec §4 step 3);
   - the domain's click tracking is decided.
4. **Email clients:** a test send has been checked in Apple Mail (iPhone), Outlook.com and classic Outlook for Windows (spec §16).
5. **The `/arel-ops` password** has been changed to a strong one.
6. **After the deploy:** time a few sign-ups on the live site (spec §17). A new address, a repeat and the honeypot should each answer in about 2.5 s.

If they say ship, open a pull request to `main` with `gh pr create`. List what goes live and the checks from Tasks 17 and 18. End the description with the attribution line from the session's instructions. Merge only when the user says to.

---

## After this plan

- Spec "Not in v1" items, each a small follow-up:
  - scheduled sends (Resend's `scheduled_at`);
  - open and click numbers inside `/arel-ops`;
  - a web archive of past issues;
  - a welcome email.
- **Deferred minors from plan 2:**
  - **M3:** keep a first consent's evidence when an unconfirmed re-signup arrives.
  - **M9:** hold the pull to the time budget.
  - **M12:** salt the erasure hash.
  - Group IPv6 addresses by /64.
