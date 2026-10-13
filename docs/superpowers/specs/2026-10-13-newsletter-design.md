# Newsletter: design spec

- **Date:** 13 October 2026
- **Branch:** `feat-newsletter`
- **Status:** awaiting review
- **Design reference:** `public/Newsletter_template/newsletter_hopetrust.pdf` (from the design team, 13 Oct 2026). It moves to `docs/design/` in phase 1 so it is never published with the site.

## 1. Goal

Hope Trust staff write and send a monthly email newsletter from the admin dashboard (`/arel-ops`), in the design team's layout. It goes to people who signed up on the website and to people imported from an existing list who agreed to receive it.

**Done means**

1. A non-developer can write an issue, preview it, send themselves a test and send it to everyone, without developer help.
2. The email matches the PDF design (within the email limits in §6.1) in Gmail (web, Android, iOS), Apple Mail (macOS, iOS) and Outlook (web, Windows).
3. It reaches the inbox: SPF, DKIM and DMARC pass for `hopetrustindia.com`.
4. Every newsletter has a working Unsubscribe button. One click unsubscribes the person, and they get no further newsletters (§7.6).
5. For every subscriber, Hope Trust can show when and how they agreed. Section 6(10) of India's DPDP Act 2023 puts the burden of proving consent on the organisation.

## 2. Decisions

| Topic | Decision | Source |
|---|---|---|
| Template | Rebuild the design team's PDF as an HTML email; each issue fills it | User |
| Authoring | Staff write new content in `/arel-ops` (not reused blog posts) | User |
| Audience | Website signups plus imported lists | User |
| Volume | Under 1,000 contacts, about monthly | User |
| Delivery | Resend Broadcasts: free up to 1,000 contacts, $40/month up to 5,000 | User (approach A) |
| Share button | Shares a blog link (§6.5) | User |
| Website signups | Double opt-in: added only after clicking a confirmation email | User |
| Signup fields | Name and email; phone dropped | User |
| Signup placement | Footer (every page), blog listing, homepage card | User |
| Sender | `Hope Trust <newsletter@hopetrustindia.com>`, replies to `frontoffice@hopetrustindia.com` | Assumed; not corrected |
| Who can send | Any `/arel-ops` admin, no approval step | Assumed; not corrected |
| Editor | Word-style rich-text editor (TipTap) that keeps formatting pasted from Google Docs or Word | Proposed |
| Title banner | Overlaps the hero photo as in the PDF; classic Outlook gets a fallback | Proposed |
| Scheduling | Not in v1; send now only | Proposed |
| Stats | In Resend's dashboard; not shown in `/arel-ops` in v1 | Proposed |
| Import formats | CSV and Excel (.xlsx) | Proposed |

## 3. Scope

**In v1**

- An email template that matches the PDF, rendered from each issue's content.
- A Newsletter tab in `/arel-ops` with two screens:
  - **Issues:** draft, edit, upload images, live preview, test send, send, history.
  - **Subscribers:** list, search, import, export, unsubscribe, delete, sync with Resend.
- Website signup with email confirmation, in the footer, the blog listing and the homepage card.
- Removal of the old, unused newsletter code.

**Not in v1.** Each is a small follow-up once v1 is in use:

- Scheduled sends (Resend supports `scheduled_at`).
- Open and click numbers inside `/arel-ops` (Resend has API endpoints for them).
- A web archive of past issues.
- A welcome email after confirmation, personalised greetings, subscription topics, more than one list.

## 4. Prerequisites outside the code

These need someone with access to Resend, GoDaddy (DNS for `hopetrustindia.com`) and Netlify. Nothing reaches real subscribers until steps 1–4 are done.

1. **Resend.** Create a team, or use the existing one, and add the domain `hopetrustindia.com`.
2. **DNS at GoDaddy.** The domain currently has no SPF, DKIM or DMARC records (checked 13 Oct 2026).
   - **Resend's records**, copied exactly from Resend: a DKIM TXT record at `resend._domainkey`, plus an MX and an SPF TXT record on the `send` subdomain.
   - **DMARC:** a TXT record at `_dmarc` with `v=DMARC1; p=none; rua=mailto:dmarc@hopetrustindia.com`. Make `dmarc@` a Google Workspace group or alias that reaches someone; it receives daily reports. Start at `p=none` and tighten to `quarantine` after a few clean weeks.
   - **Recommended in the same session.** This affects everyday Google Workspace mail, not the newsletter: a root SPF record (`v=spf1 include:_spf.google.com ~all`) and Google Workspace DKIM, generated in Google Admin.
3. **Resend settings.**
   - Create one segment named "Newsletter".
   - Brand the unsubscribe page (Settings → Unsubscribe Page) with the Hope Trust logo, white background, dark text and the orange accent.
     - Title: "Unsubscribe from the Hope Trust newsletter".
     - Description: "You'll stop receiving our monthly newsletter. If you change your mind, you can sign up again on hopetrustindia.com."
     - A small "Powered by Resend" footer stays on the free plan; a paid plan removes it.
   - Decide on tracking for the domain. Click tracking is useful. Open counts have been unreliable since Apple Mail Privacy Protection.
4. **Netlify environment variables.**
   - New: `RESEND_API_KEY`, `RESEND_NEWSLETTER_SEGMENT_ID`, and `NEWSLETTER_FROM_EMAIL` set to `Hope Trust <newsletter@hopetrustindia.com>`.
   - Already set: `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_JWT_SECRET`, `NEXT_PUBLIC_SITE_URL`.
   - `NEWSLETTER_FROM_EMAIL` is also the fallback sender for the currently disabled enrollment emails in `netlify/functions/_shared/emails.mjs`.

## 5. Architecture

```
Website (static export)               Netlify Functions (new)             Stores and services
-----------------------               -----------------------             -------------------
NewsletterForm (footer, blog,  --->   newsletter-subscribe     ---------> Supabase: newsletter_subscribers
  homepage)                                                    ---------> Resend: confirmation email
/newsletter/confirm/?t=...     --->   newsletter-confirm       ---------> Supabase, then Resend contacts

/arel-ops -> Newsletter tab
  Issues (preview rendered      --->  admin-newsletter-issues  ---------> Supabase: newsletter_issues, image bucket
    in the browser)                                            ---------> Resend: test email, broadcast
  Subscribers                   --->  admin-newsletter-subscribers -----> Supabase <-> Resend contacts
```

- **One renderer.** `lib/newsletter/render.ts` turns an issue into email HTML. The editor preview runs it in the browser. The send and test-send functions run it on the server from the saved issue. The preview and the sent email are therefore the same HTML.
- **Two copies of the list.** Supabase is the record of subscribers and consent. Resend holds a copy of the contacts in the "Newsletter" segment, sends the broadcasts and hosts the unsubscribe page.
- **Keeping the copies in step.**
  - Every change to a subscriber sets `resend_synced_at` to null.
  - A sync step pushes those changes to Resend and copies unsubscribes made on Resend's page back into Supabase.
  - Single changes (a confirmation, an admin unsubscribe or delete) are pushed straight away. Full sync runs automatically after an import and before each send, and on demand from the Subscribers screen's Sync button. If an immediate push fails, the next sync retries it. There are no webhooks in v1.
- **New functions are TypeScript (`.mts`)**, so they can import the shared `lib/newsletter/*.ts` modules. Netlify bundles `.mts` functions without extra setup. Existing `.mjs` functions are untouched.
  - The new functions follow the existing conventions: JWT check, CORS headers, JSON responses, `admin_audit_log` entries and `/api/*` redirects in `netlify.toml`.
- **The Newsletter tab lives in `components/admin/newsletter/`.** `app/arel-ops/page.tsx` is already 1,448 lines, so the page only adds the tab button and renders `<NewsletterTab token onUnauthorized />`, the same way `EnrollmentsTab` works. The editor library loads only inside this tab, so public pages don't get heavier.

**Units**

| Unit | Does | Used by |
|---|---|---|
| `lib/newsletter/content.ts` | Issue and body types; validation of fields and of the allowed body content (§6.3) | Editor, functions, renderer |
| `lib/newsletter/render.ts` | Issue → email HTML for `preview`, `test` or `send`; HTML size | Editor preview, functions, local test script |
| `lib/newsletter/import.ts` | Parse uploaded rows; validate and de-duplicate emails | Import dialog, and the subscribers function, which re-checks every row it receives |
| `lib/newsletter-admin.ts` | Typed `fetch` client for the two admin endpoints, with `UnauthorizedError` like `lib/enrollments-admin.ts` | Newsletter tab |
| `netlify/functions/_shared/resend.mts` | Resend REST calls: contacts, broadcasts, test email, request pacing | Newsletter functions |
| `netlify/functions/_shared/admin.mts` | JWT check, audit log, JSON and CORS helpers for the new admin functions | Admin newsletter functions |
| `components/admin/newsletter/*` | Newsletter tab: issues list, editor, preview, send dialog, subscribers screen, import dialog | `/arel-ops` |
| `components/NewsletterForm.tsx` | Public signup form, rewritten | Footer dialog, blog listing, homepage card |
| `app/newsletter/confirm/page.tsx` | Confirmation page | Link in the confirmation email |

## 6. The email

### 6.1 From the PDF to an email

| In the PDF | In the email |
|---|---|
| Logo top left; date in an orange band top right | Same: a logo cell and an orange date band |
| Hero photo, with the orange title banner overlapping its lower edge | The photo is a background image and the banner sits inside its lower edge. Classic Outlook for Windows gets the same layout through a VML fallback. If images are blocked, the banner still shows on an orange background. |
| Two text columns | One column. Email can't flow text from one column into the next, and on phones the columns would stack anyway. |
| Centred intro paragraphs | Headings centred, body text left-aligned, because long centred text is hard to read on a phone |
| Orange pull-quote box | A full-width orange block with large white text |
| Orange rule before "Face the Inner Shadows" | An orange divider |
| Yellow "BOOK YOUR SESSION" button | Same; links to `/book-your-session/` |
| Orange footer band: phone, Instagram, website | Same, as links (`tel:`, the Instagram profile, the site) with white PNG icons |
| Yellow Share and Unsubscribe buttons with the logo between them | Same; see §6.5 and §6.6 |
| (not in the PDF) | One small grey line: "You're receiving this because you subscribed at hopetrustindia.com." This reduces spam reports. |

**Typeface.** Use the PDF's typeface. It looks like Montserrat; the design team should confirm. It loads from Google Fonts, with Arial and Helvetica as fallbacks. Gmail ignores web fonts, so Gmail readers see Arial.

**Colours.** Sampled from the PDF.

**Links in the PDF.** Several links appear as raw "(https://…)" text where a name such as "Carl Rogers" should be. That text was copied from the blog post, where the WordPress import left 449 such links across 186 posts. In the editor, links are real links with readable text. Fixing the blog posts is a separate task.

### 6.2 What staff fill in for each issue

| Field | Rules |
|---|---|
| Subject | Required; up to 150 characters |
| Inbox preview text | Optional; up to 200 characters. It's the grey line after the subject in most inboxes. Defaults to the start of the body. |
| Date | Defaults to today; shown as "13th October, 2026" |
| Hero photo and its alt text | Both required before sending |
| Title | Required; up to 160 characters; shown in the orange banner |
| Body | Rich text (§6.3) |
| Blog link for Share | Optional; defaults to `https://hopetrustindia.com/blogs/` |

### 6.3 What the body editor allows

- **Allowed:** paragraphs; headings at two levels; bold; italic; links; bulleted and numbered lists; pull-quotes, shown as the orange box; full-width images with alt text; dividers.
- **Pasted content:** anything pasted from Google Docs or Word is reduced to the list above. Pasted images are removed with a note to add them with the Image button, so every image is uploaded and resized.
- **Renderer checks:**
  - All text is escaped.
  - Links must be `https:`, `http:`, `mailto:` or `tel:`.
  - Images must come from the newsletter image bucket.

### 6.4 Rules for the HTML

- **Structure:** tables, 600 px wide, inline styles, fluid down to 320 px. No JavaScript, forms or video.
- **Size:** Gmail clips messages over 102 KB, which hides the footer and the unsubscribe link. Click tracking also makes every link longer. So:
  - the editor shows the current size;
  - it warns above 80 KB;
  - sending is blocked above 95 KB.
- **Dark mode:** a `color-scheme: light` meta tag discourages colour inversion. Check the Gmail app, which may still invert.
- **Analytics:** links to `hopetrustindia.com` get `utm_source=newsletter&utm_medium=email&utm_campaign=<issue date>`, so newsletter visits show up in GA4 (already on the site).
- **Plain-text version:** generated by Resend from the HTML.
- **Images:**
  - Added through the editor; up to 5 MB before processing.
  - Resized in the browser to at most 1,200 px wide.
  - Saved as JPEG, or as PNG if the original is a PNG. Never WebP, which doesn't display in Outlook for Windows.
  - Uploaded with a one-year cache header (file names are unique).

### 6.5 Share

The Share button opens WhatsApp with a short message and the issue's blog link (`https://wa.me/?text=…`). The message reads: "<issue title>, from the Hope Trust newsletter: <blog link>". On a computer this opens WhatsApp Web. The blog link is set per issue (§6.2).

### 6.6 Unsubscribe

The yellow Unsubscribe button from the PDF footer is in every issue. It can't be removed in the editor, because the renderer adds the footer itself. Its link is Resend's `{{{RESEND_UNSUBSCRIBE_URL}}}`, which Resend replaces with a personal link for each recipient. The link opens the branded unsubscribe page (§4), and Resend marks the contact unsubscribed. §7.6 covers everything that happens next.

Test sends don't go through broadcasts, and Resend fills in the real link only for broadcasts. So in a test email the button is shown but links to the website. Unsubscribe itself is tested with a real broadcast (§13).

**To verify on the first real broadcast:** whether Resend also adds the `List-Unsubscribe` and `List-Unsubscribe-Post` headers that give Gmail its one-click button. Resend's documentation doesn't say. Gmail only requires them from senders of 5,000 or more emails a day, so this doesn't block v1.

## 7. Signup and consent

### 7.1 The form

- **Fields:** full name and email, plus a hidden honeypot field that catches bots.
- **Notice under the button:** "We'll email you the Hope Trust newsletter about once a month. Unsubscribe any time." with a link to the privacy policy. The notice text carries a version number, so we can record which version each person saw.
- **Placements:**
  - **Footer:** the "Subscribe to our newsletter" button opens the form in a small dialog.
  - **Blog listing:** the existing call-out, switched back on.
  - **Homepage card:** `LargeRectangleSection`, switched back on. Its sentence "Connect with others, share experiences, and find encouragement in a safe, supportive space" describes a community rather than a newsletter. Proposed replacement, which Hope Trust can change: "A monthly letter from our team, with ideas you can use between sessions. Unsubscribe any time."
- **Same message for everyone.** After submitting, everyone sees "Check your inbox to confirm your subscription", whether the address is new, pending, already subscribed or previously unsubscribed. The current form says "You're already subscribed!", which tells anyone whether an address is on a mental-health mailing list.

### 7.2 `newsletter-subscribe`

1. **Validate** with zod: name 2–200 characters; email valid, at most 254 characters, stored in lower case.
2. **Honeypot.** If it's filled, return the normal success response and do nothing else.
3. **Rate limit**, using the same counting pattern as `create-order`. These limits stop the form being used to flood someone's inbox.
   - At most 5 confirmation emails per IP address per 15 minutes.
   - Per email address: at least 10 minutes between confirmation emails, and at most 3 while the address is pending.
4. **Act on the current status:**
   - New address: save as `pending` with a confirmation token, and send the confirmation email.
   - Pending: send the confirmation again, within the limits above.
   - Unsubscribed: keep the row `unsubscribed`, give it a new token and send the confirmation email. Only confirming re-subscribes them, and their unsubscribe record survives if they never confirm.
   - Subscribed: do nothing.
5. **Clean up.** Delete `pending` rows older than 30 days. They never gave consent, so there's no reason to keep their data. `unsubscribed` rows are never cleaned up this way.

### 7.3 Confirmation

- **The email** goes out through Resend's regular API, from the same sender.
  - Subject: "Confirm your Hope Trust newsletter subscription".
  - One button, and the line "If you didn't sign up, ignore this email and you won't be added."
- **The link** is `https://hopetrustindia.com/newsletter/confirm/?t=<token>`.
  - The token is 32 random bytes; only its SHA-256 hash is stored.
  - It's valid for 7 days and works once.
- **The confirm page asks for a click** ("Confirm my subscription") rather than confirming when the page loads, because corporate email scanners open links automatically. The click calls `newsletter-confirm`.
- **`newsletter-confirm`:**
  - With a valid token on a `pending` or `unsubscribed` row, it:
    1. sets the row to `subscribed`, with `consent_at` set to now, and clears `unsubscribed_at` and `unsubscribe_source`;
    2. clears the token, and removes the address's hash from `newsletter_erased` if it's there (§7.5);
    3. marks the row for Resend sync and tries to push it to Resend straight away. If that fails, the next sync retries.
  - If the token is invalid or expired, the page offers to sign up again.
- **Page style:** a simple branded page with the site header, footer and Bricolage type. It isn't a landing page.
- **Not indexed:** the page is `noindex`, and `newsletter` is added to the `UNLISTED` set in `scripts/generate-sitemap.mjs`.

### 7.4 Import (admin)

1. **Upload** a CSV or .xlsx file. It's parsed in the browser with the `xlsx` package the dashboard already uses for exports. The installed version (0.18.5, the last one on npm) has known flaws when reading crafted files (CVE-2023-30533, CVE-2024-22363). Upgrade to SheetJS's current release from `cdn.sheetjs.com` as part of this work, and re-run the enrollments export test afterwards.
2. **Map columns:** pick the email and name columns, then see how many rows are valid, invalid or duplicated.
3. **Record consent.** Two things are required before importing:
   - a statement of where and when these people agreed, for example "Clients who ticked the newsletter box on the intake form, 2025–26";
   - a tick: "Everyone on this list agreed to receive the Hope Trust newsletter."
4. **Import** in chunks of 200 rows, with these rules:
   - Invalid emails are skipped.
   - Any address already in the table is skipped, whatever its status. An import can never re-subscribe someone who unsubscribed.
   - Any address on the erasure list (§7.5) is skipped.
   - New rows are saved as `subscribed` with `source = import`. The statement, the uploader, a batch ID and the time are stored as consent evidence.
5. **Sync to Resend** with a progress bar (§9.3).

### 7.5 Erasure

Delete removes the row and the Resend contact. The audit log records the subscriber ID, not the email address.

Delete also adds a SHA-256 hash of the address to `newsletter_erased`, which stores no readable personal data. Imports skip hashed addresses, so an old spreadsheet can't add the person back. If the person later signs up on the website and confirms, that is fresh consent, so the hash is removed.

### 7.6 Unsubscribing

**Ways to unsubscribe**

| Route | What happens |
|---|---|
| The Unsubscribe button in any newsletter (§6.6) | One click opens Hope Trust's branded unsubscribe page, and the person is unsubscribed in Resend immediately |
| The inbox's own "Unsubscribe" link (Gmail, Apple Mail and Yahoo show one next to the sender) | The same, if Resend adds the one-click headers; verified on the first broadcast (§6.6) |
| Asking Hope Trust: replying to the newsletter (replies go to frontoffice@), phoning, or in person | Staff press Unsubscribe on the Subscribers screen (§8.2). The change goes to Resend straight away. |
| Marking the newsletter as spam | Resend adds the address to its suppression list and stops sending to it |

**Guarantees**

- **Always in the email.** No issue can go out without the Unsubscribe button. The renderer always adds the footer in send mode, and the send function refuses any HTML that doesn't contain `{{{RESEND_UNSUBSCRIBE_URL}}}` (§9.1).
- **Takes effect at once.** Resend skips unsubscribed contacts in every later broadcast. This doesn't wait for our sync: Supabase picks up the change at the next sync (§9.3), which runs before every send.
- **Imports can't undo it.** An imported spreadsheet never re-subscribes anyone (§7.4).
- **Coming back is deliberate.** The only way back in is to sign up on the website again and click the confirmation email (§7.2).
- **There's a record.** `unsubscribed_at` and `unsubscribe_source` are kept: `resend` means the email link, `admin` means staff did it. Both show on the Subscribers screen and in the CSV export.

## 8. Admin: the Newsletter tab

### 8.1 Issues

- **List:** subject, date, status (Draft, Sending, Sent or Needs check), recipients and sent time, plus a "New issue" button.
- **Editor:**
  - The fields from §6.2 on the left.
  - A live preview on the right, with Desktop and Phone widths and the HTML size.
  - A toolbar for the body (§6.3).
- **Saving:** an explicit Save button, with an "unsaved changes" warning on leaving. Send test and Send both save first.
- **Send test:** up to 5 addresses (default: the logged-in admin). The subject gets a "[TEST]" prefix.
- **Send to subscribers:**
  - A dialog shows the subject, the sender and the current subscriber count, and needs a final click.
  - Sending is blocked if the hero photo or its alt text is missing, the subject or title is empty, the HTML is over 95 KB, or there are no subscribers.
- **After sending:** sent issues are read-only, with a link to the broadcast's stats in Resend. Drafts can be deleted; sent issues can't.

### 8.2 Subscribers

- **Overview:** counts by status, search by name or email, filters by status and source.
- **Table:** paginated; shows name, email, status, source and consent date.
- **Row actions:** Unsubscribe, Delete.
- **Toolbar:** Import (§7.4), Export CSV, Sync with Resend.

## 9. Sending, and keeping Resend in step

### 9.1 Send

1. **Check** the admin token and load the issue.
2. **Lock:** `update newsletter_issues set status = 'sending' where id = $1 and status = 'draft'`. If no row changes, the issue is already being sent (a double click, or two admins), so stop.
3. **Sync** (§9.3). If any subscribed contacts are still not synced afterwards, return the issue to draft with a message to try again in a minute.
4. **Render** the HTML in send mode. Check the size limit, and check that the HTML contains `{{{RESEND_UNSUBSCRIBE_URL}}}`. If either check fails, return the issue to draft and don't send.
5. **Send:** call `POST /broadcasts` with `segment_id`, `from`, `reply_to`, `subject`, `html`, `send: true`, and a `name` that contains the issue ID.
6. **Success:** set the status to `sent` and store the broadcast ID, recipient count, time and sender. Add an audit log entry.
7. **Clear failure** (a 4xx from Resend): back to `draft`, with the error shown in the editor.
8. **Unclear outcome** (timeout or 5xx): set the status to `needs_check`. "Check status" looks for a broadcast whose name contains the issue ID.
   - Found: the issue becomes `sent`.
   - Not found: it goes back to `draft`.

   This prevents sending twice.

### 9.2 Test send

The function renders the saved issue in test mode and sends it through Resend's regular email API, using the existing `sendEmail` helper. Test sends count toward the free plan's 100 regular emails a day, which is plenty.

### 9.3 Sync

1. **Pull.** List the contacts in the Newsletter segment, 100 per page. Any contact unsubscribed in Resend but `subscribed` in Supabase becomes `unsubscribed`, with `unsubscribe_source = 'resend'`.
2. **Push.** Take rows where `resend_synced_at is null`, about 40 per call. Resend allows 10 requests a second, and Netlify functions time out after about 10 seconds. For each row:
   - **Subscribed:** create the contact in the segment. If it already exists, update it to `unsubscribed: false` and make sure it's in the segment. Resend's docs confirm create, update and delete by email; the exact call for adding an existing contact to a segment gets checked in phase 2.
   - **Unsubscribed:** update it to `unsubscribed: true`.
   - Then set `resend_synced_at`.
3. **Report** what was pulled, what was pushed and how many rows remain. The screen calls again until none remain.

**Contact limit.** Resend's free plan allows 1,000 stored contacts, including unsubscribed ones, and refuses broadcasts while you're over the limit. Supabase keeps the unsubscribe record. So if the limit gets close, unsubscribed contacts can be deleted from Resend without any risk of re-adding them.

## 10. Data

All SQL goes in `Database/newsletter.sql`, alongside the other schema files.

### 10.1 `newsletter_subscribers`

This table is recreated. It's empty (0 rows, checked 13 Oct 2026), so no data needs migrating.

```sql
create table newsletter_subscribers (
  id                        uuid primary key default gen_random_uuid(),
  email                     text not null unique
                              check (email = lower(btrim(email)) and char_length(email) <= 254),
  full_name                 text check (full_name is null or char_length(btrim(full_name)) between 1 and 200),
  status                    text not null default 'pending'
                              check (status in ('pending', 'subscribed', 'unsubscribed')),
  source                    text not null check (source in ('website', 'import')),

  -- consent evidence
  consent_at                timestamptz,  -- website: the confirmation click; import: when the import was attested
  consent_note              text,         -- website: page and notice version; import: the uploader's statement
  signup_page               text,
  signup_ip                 text,
  signup_user_agent         text,
  imported_by               text,         -- admin email
  import_batch_id           uuid,

  -- email confirmation (website signups)
  confirm_token_hash        text,
  confirm_token_expires_at  timestamptz,
  confirm_sent_at           timestamptz,
  confirm_send_count        int not null default 0,

  -- unsubscribe
  unsubscribed_at           timestamptz,
  unsubscribe_source        text check (unsubscribe_source in ('resend', 'admin')),

  -- copy in Resend
  resend_contact_id         text,
  resend_synced_at          timestamptz,  -- null = a change not yet pushed to Resend

  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index on newsletter_subscribers (status);
create index on newsletter_subscribers (signup_ip, confirm_sent_at);
create index on newsletter_subscribers (resend_synced_at) where resend_synced_at is null;
```

`full_name` may be empty only for imported rows; the website form requires it.

### 10.2 `newsletter_issues` (new)

```sql
create table newsletter_issues (
  id                   uuid primary key default gen_random_uuid(),
  subject              text not null default '' check (char_length(subject) <= 150),
  preheader            text not null default '' check (char_length(preheader) <= 200),
  issue_date           date not null default current_date,
  title                text not null default '' check (char_length(title) <= 160),
  hero_image_url       text,
  hero_image_alt       text not null default '' check (char_length(hero_image_alt) <= 250),
  body                 jsonb not null default '{"type": "doc", "content": []}'::jsonb,
  share_url            text,  -- blog link for the Share button; null means /blogs/
  status               text not null default 'draft'
                         check (status in ('draft', 'sending', 'sent', 'needs_check')),
  last_error           text,
  resend_broadcast_id  text,
  recipient_count      int,
  sent_at              timestamptz,
  sent_by              text,
  created_by           text not null,
  updated_by           text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index on newsletter_issues (created_at desc);
```

### 10.3 `newsletter_erased` (new)

```sql
create table newsletter_erased (
  email_sha256  text primary key,  -- hex SHA-256 of the lower-cased, trimmed address
  erased_at     timestamptz not null default now()
);
```

### 10.4 Storage and access

- **Image bucket:** `newsletter-images`, readable by anyone, because email clients have to load the images.
  - Uploads only through signed upload URLs issued by the admin function.
  - JPEG and PNG only, up to 5 MB.
- **Row-level security:**
  - Enabled on all three tables, with no `anon` policies. The functions use the service role.
  - The current `anon_insert_newsletter` policy goes away, because signups now go through the function.

## 11. API

Every endpoint lives under `/api/*` and is redirected to `/.netlify/functions/*`, like the existing admin functions. Admin endpoints need `Authorization: Bearer <admin JWT>`. Every endpoint returns JSON, except the CSV export.

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/newsletter-subscribe` | POST | Public signup (§7.2) |
| `/api/newsletter-confirm` | POST | Public confirmation (§7.3) |
| `/api/admin-newsletter-issues` | GET | List issues, or get one with `?id=` |
| | POST | Create a draft |
| | PATCH `?id=` | Update a draft |
| | DELETE `?id=` | Delete a draft |
| | POST `?id=&action=upload-url` | Signed upload URL for an image |
| | POST `?id=&action=test` | Test send; body `{ to: string[] }` |
| | POST `?id=&action=send` | Send to subscribers (§9.1) |
| | POST `?id=&action=check` | Resolve a `needs_check` issue |
| `/api/admin-newsletter-subscribers` | GET | List, search and counts; `?format=csv` exports |
| | POST `?action=import` | Import one chunk of rows (§7.4) |
| | POST `?action=sync` | Sync with Resend (§9.3) |
| | PATCH `?id=` | Unsubscribe |
| | DELETE `?id=` | Delete (erasure) |

## 12. Security and privacy

- **Admin endpoints** check the JWT the same way `admin-enrollments` does. Every send, test send, import, export, unsubscribe and delete is written to `admin_audit_log`.
- **Public endpoints:**
  - give the same response whatever the address's status, so nobody can find out whether an address is subscribed;
  - use a honeypot, rate limits and a request size limit;
  - accept requests only from the site (CORS).
- **Email HTML** is built only by the renderer, from the allowed content in §6.3. All text is escaped, and link and image URLs are checked.
- **The preview iframe** is sandboxed (`srcdoc`, scripts disabled).
- **Data:**
  - Only the minimum is kept: name, email and consent evidence.
  - Pending signups expire after 30 days.
  - Erased people are remembered only as a hash (§7.5).
  - The design PDF moves out of `public/`.

## 13. Testing

- **Unit tests** (Vitest, `tests/vitest/lib/newsletter/`):
  - **Renderer:**
    - text is escaped and only allowed content renders;
    - link and image URLs are checked;
    - links to the site get UTM tags;
    - the unsubscribe placeholder is present in send mode and absent in test mode;
    - the date format is right;
    - the fixture issue's HTML is under 80 KB and matches its snapshot.
  - **Import:** parsing and de-duplication rules, including skipping existing and erased addresses.
  - **Confirmation tokens:** hashing and expiry.
- **Function tests** (Vitest, `tests/vitest/functions/`, mocking Supabase and `fetch` the way the existing tests do):
  - Admin endpoints reject requests without a valid token, and input is validated.
  - Subscribe gives the same response whatever the address's status, and its rate limits work.
  - Confirm works with a valid token and fails once the token has expired.
  - The send lock and the status changes behave as in §9.1, including resolving `needs_check`.
  - Send refuses HTML without the unsubscribe link.
  - Sync marks contacts unsubscribed in Resend as unsubscribed in Supabase, and admin Unsubscribe pushes `unsubscribed: true` to Resend.
  - Sync pages through contacts and paces its requests.
- **End-to-end tests** (Playwright):
  - The signup form shows the confirmation message (API mocked).
  - An admin can open the Newsletter tab, edit a draft and see the preview (API mocked).
- **Fixture issue:** the PDF's content as an issue, with real links. It's used for the snapshot test and the visual checks.
- **Manual checks before the first real send:**
  - Test sends to Gmail (web, Android, iOS), Apple Mail (macOS, iOS) and Outlook (web, Windows). Check:
    - layout at full and phone width;
    - dark mode;
    - how it looks with images blocked;
    - every link.
  - In Gmail, open "Show original" to confirm SPF, DKIM and DMARC pass and to look for the unsubscribe headers.
  - One full run on production: sign up, confirm, receive a broadcast, then click Unsubscribe. Check that:
    - the branded page appears;
    - the contact shows as unsubscribed in Resend at once, and in the Subscribers screen after a sync;
    - the address is left out of the next send.
  - Try Gmail's own "Unsubscribe" link next to the sender too, if it appears.

## 14. Build order

Each phase ends in a working state that can be reviewed.

0. **Setup outside the code** (§4). It can start now and runs alongside phases 1–3.
1. **Template.**
   - Build the renderer and the fixture issue.
   - Prepare the email assets: logo, icons and colours sampled from the PDF.
   - Add a local script that renders the fixture and sends it to test addresses.
   - Move the PDF to `docs/design/`.
   - **Exit:** the fixture looks right in every client listed in §13. This is where the hero overlap and the fonts get settled.
2. **Subscribers.**
   - Write the SQL, plus `newsletter-subscribe`, `newsletter-confirm` and the confirm page.
   - Put the new `NewsletterForm` in the three placements.
   - Build the Subscribers screen with import, export and sync.
   - Remove the old `supabase/functions/send-newsletter/`. It was never deployed, and it reads columns that no longer exist.
   - **Exit:** real signups confirm and appear in Resend.
3. **Issues.**
   - Create the issues table and the admin issues function.
   - Build the editor with images and preview, then test send, send and history.
   - **Exit:** a real issue goes from draft to inboxes.
4. **Clean-up.**
   - Remove `lib/newsletter-template.ts`, `scripts/test-newsletter.mjs` and the `NEWSLETTER DISABLED` comments.
   - Update `docs/claude.md`, `.env.example` and the newsletter policies in `Database/rls-policies.sql`.

## 15. Risks to check early

| Risk | Checked | If it happens |
|---|---|---|
| Gmail or Outlook doesn't show the title banner over the photo | Phase 1 test sends | Put the banner directly under the photo |
| Netlify can't bundle `.mts` functions that import from `lib/` | Phase 1, with a local `netlify build` | Write the renderer as `.mjs` with JSDoc types |
| Resend broadcasts don't add the one-click unsubscribe headers | First broadcast, phase 3 | Acceptable below 5,000 emails a day; otherwise switch sending to approach B (our own sender through Resend's regular API) |
| The editor library (TipTap) doesn't work with React 18.2 and Next 15 | Phase 3, at install | Pin a version that supports React 18; TipTap 3 lists React 17–19 |
| Upgrading `xlsx` changes the enrollments export | Phase 2 | Keep 0.18.5 and accept CSV only for import |
| DNS isn't done by the end of phase 2 | Phase 0 | Phases 1–3 can be built and tested using Resend's test sender to the account owner's address; nothing goes live until DNS is done |
| "Share the blog link" meant something other than §6.5 | Spec review | Change §6.5 |
