# The Hope Letter: fortnightly blog newsletter — design

- **Date:** 17 October 2026
- **Branch:** `feat-newsletter` (not merged; nothing is live yet)
- **Status:** awaiting review
- **Builds on:** `docs/superpowers/specs/2026-10-13-newsletter-design.md` (the "base spec"), built in plans 1–3. Everything there still holds unless this document says otherwise.
- **Design reference:** `docs/design/newsletter-2026-10-17-hope-letter.html`, the client's preview page (17 Oct 2026).
  - It holds two designs, **01 Cream editorial** and **02 Teal contemporary**, each with and without an optional book panel. Its buttons switch between them.
  - The email HTML of each variant is JSON inside the page's `design-data` script.
  - Its sample issue is the newest blog post, "The Most Important Connection You Can Have: With Yourself" (20 Dec 2025). That is the post §5.3's rule would pick first.

## 1. Why

Hope Trust wants its newsletter, The Hope Letter, to go out every fortnight without staff writing each issue. Each issue features one of the site's 389 blog posts: its photo, its title, a short intro, and a button to read it on the site. That keeps subscribers in touch and brings readers back to the site. Staff keep the editor built in plans 1–3 for issues they write themselves.

## 2. Decisions

| Topic | Decision | Source |
|---|---|---|
| Automatic issues | One blog post per issue: photo, title, intro, "Read the article" | User |
| Cadence | Every fortnight, automatically | User |
| Frequency limit | Subscribers never get two newsletters less than 14 days apart, of any kind | User |
| Manual editor | Kept | User |
| Manual issues' look | The new design too, so every issue looks like The Hope Letter | Claude |
| Which post | The newest post not sent before | User |
| Manual and automatic | A manual send counts as that fortnight's newsletter, and the automatic one skips | User |
| Send time | Tuesday, 10:00 India time, every other week | User |
| Question box | Shown only when someone has written a question | User |
| Safety net | A preview email to staff 48 hours before, with a link to swap the post or skip. If nobody acts, it goes. | User |
| Design | 01 Cream editorial or 02 Teal contemporary: **open (§11)** | Client |
| Starting | Automatic sending is off until staff switch it on and set the first send date | Claude |
| Posts without a usable photo | Never chosen automatically | Claude |
| Intro text | The post's first paragraph, cleaned; else its summary; else its excerpt (§5.3). Editable. No AI-written text. | Claude |
| Repeated photos | The automatic choice passes over a post whose photo was in any of the last 6 sent issues. The post keeps its place in line. | Claude |
| Broken titles | Fixed in the post files as part of this work (§8.1) | Claude |
| Raw "(https://…)" text in post bodies | Not part of this work (§3, non-goals) | Claude |
| Book panel | One setting for all issues, off by default | Claude |

**This replaces, in the base spec:**

- **§2 Authoring** ("staff write new content, not reused blog posts"): now both kinds.
- **§2 Volume** ("about monthly") and **Scheduling** ("not in v1"): now fortnightly and automatic.
- **§6.1** (the PDF layout) and **§6.5** (WhatsApp-only Share): replaced by §4 here.
- **§6.2's "Blog link for Share"** field: renamed "Article link" (§6).
- **§4 step 3's unsubscribe-page text** ("our monthly newsletter"): now "fortnightly".

## 3. Goals, non-goals, anti-goals

**Goals**

1. Every other Tuesday at 10:00 India time, the newest unsent blog post goes to the Newsletter segment as The Hope Letter, with no staff action.
2. Two days before, staff get a preview email. In `/arel-ops` they can edit the text, swap the post or skip the fortnight.
3. Every newsletter, automatic or manual, uses the client's design.
4. No subscriber gets two newsletters less than 14 days apart.
5. Automatic sends keep the base spec's guarantees:
   - an Unsubscribe link in every email;
   - no double sends (the §9.1 lock and Check status);
   - the size limit;
   - the sync before sending.

**Non-goals**

- Writing intros or questions with AI.
- Choosing posts by topic, season or subscriber.
- Building both designs, or a switch between them.
- The base spec's "not in v1" items (stats in `/arel-ops`, web archive, welcome email).
- Fixing the raw "(https://…)" text that the WordPress import left in post bodies. Base spec §6.1 calls this a separate task.
  - It's in 166 of the 236 posts with a usable photo.
  - The email never shows post bodies, but readers who click through will see it, as site visitors do today.
  - It's recommended as a follow-up.

**Anti-goals.** Each of these is a failure even if everything else works:

- An automatic newsletter goes out that nobody at Hope Trust could have seen first.
- A subscriber gets the same post twice, or two newsletters within 14 days.
- Automatic sending starts before Hope Trust switches it on, or runs from a deploy preview or a branch deploy.
- A missing image, or a WebP image that Outlook can't show.
- An email over Gmail's clip limit, which hides the Unsubscribe link.
- After an outage or a deploy, a missed run sends a stale issue days late, or sends it twice when it catches up.

## 4. The email

Built from the chosen design's HTML in the reference file. Copy, colours and type come from that design. The reference is a starting point, not production code: check it against the rules below and the base spec's email clients (§1 "Done means" 2), and fix what fails.

| # | Part | Blog issue | Manual issue |
|---|---|---|---|
| 1 | **Masthead:** logo, "The Hope Letter", the design's "fortnightly" line, issue number ("Issue 01") | Same | Same |
| 2 | **Kicker:** a short label above the title | Default from §5.3; editable | Optional field |
| 3 | **Title:** if it contains `: `, the part after the first colon gets the design's emphasis (italic in 01, yellow in 02) | The post title | The title field |
| 4 | **Byline:** "By Hope Trust · 9 min read" | The post's reading time | Reading time of the body |
| 5 | **Hero photo:** full width | The post's photo (§4.1) | The uploaded photo, as now |
| 6 | **Main text** | The intro paragraph, the question box if a question is written, then **Read the article** linking to the post | The rich-text body (base §6.3; pull-quotes take the question box's style). **Read the article** appears only when an article link is set |
| 7 | **Share:** "Share a little hope." with Email (`mailto:`), WhatsApp (`wa.me`), Facebook (sharer) and LinkedIn (share-offsite) | Shares the post | Shares the article link, or the blog listing |
| 8 | **Book panel:** optional, from the settings (§7) | Same | Same |
| 9 | **Booking band:** the design's copy; **Book session** links to `/book-your-session/` | Same | Same |
| 10 | **Footer** (detail below) | Same | Same |

**The footer** has:

- Instagram (`instagram.com/hopetrust`) and Facebook (`facebook.com/hopetrust`);
- "Hope Trust · Psychological Wellness", the postal address and `frontoffice@hopetrustindia.com`;
- the design's tagline;
- Unsubscribe and Privacy policy links, and the copyright line;
- the base spec's line "You're receiving this because you subscribed at hopetrustindia.com."

**The book panel** is the reference's "Show future book feature" view. Its fields: an eyebrow ("From Rahul Luther"), a title ("I, Bhogi"), one line of text, the link text ("Discover the book →") and the link.

**Kept from the base spec** (§6.4 and §6.6):

- tables 600 px wide, inline styles, and a light colour scheme;
- the size shown, a warning at 80 KB, and sending blocked at 95 KB;
- UTM tags on site links;
- `{{{RESEND_UNSUBSCRIBE_URL}}}` required in send mode;
- in test emails, Unsubscribe links to the site.

**Subject and preview text:** a blog issue's subject is the post title and its inbox preview text is the excerpt. Both are editable.

### 4.1 Images

- **Logo.** The reference embeds the logo as base64, which Gmail blocks. Host the round logo as a PNG with an opaque background, on the site or in the newsletter bucket.
- **Blog hero photo**, from the post's `featuredImage`:

| Source | Posts | What to do |
|---|---|---|
| `images.unsplash.com` | 153 | The URLs carry `auto=format`, which can serve WebP. Rewrite each to a fixed JPEG 1,200 px wide (e.g. `w=1200&h=750&fit=crop&fm=jpg&q=80`). |
| Site images, JPEG or PNG | 83 (75 JPEG, 8 PNG) | Use `https://hopetrustindia.com` plus the path. |
| Site images, WebP | 11 | Outlook for Windows doesn't show WebP. They need JPEG copies (the builder chooses how), or the automatic choice skips them. |
| No `featuredImage` | 142 | Never chosen automatically. If staff swap to one of these, they must upload a hero photo, as for a manual issue. |

- **Alt text:** the post title.
- **The renderer's image rule** (base §6.3, the bucket only) widens to: the newsletter bucket, `images.unsplash.com` and `hopetrustindia.com`.
- **Supply:** 236 to 247 posts have a usable photo (247 if the 11 WebP images get copies). That's 9 to 9½ years of fortnights.
- **Repeats:** the 153 Unsplash posts share 22 stock photos, assigned by keyword (`scripts/assign-stock-images.mjs`). So the usable posts carry about 105 distinct photos. §5.3's repeat rule stops the same photo appearing twice within six issues.

## 5. Automatic issues

### 5.1 Schedule and settings

- **Send times:** 10:00 India time (Asia/Kolkata, which has no daylight saving), every 14 days from the first send date. The first send date must be a Tuesday.
- **Preview time:** 48 hours before each send (Sunday, 10:00).
- **Settings:** a new "Automatic" panel in the Newsletter tab, with:
  - an on/off switch, off until Hope Trust switches it on;
  - the first send date;
  - preview recipients, up to 5 addresses.
- **The panel also shows** the next preview time, the next send time and the post next in line.

### 5.2 One newsletter per fortnight

No newsletter goes out less than 14 days (India calendar days) after the previous one. Test emails and preview emails don't count.

- **On a send day:** if a newsletter went out in the previous 13 days, the automatic issue is skipped, with that reason.
- **Manual Send:** blocked while the rule says no, with "The next newsletter can go out on ‹date›."
- **The send dialog** says when a manual send will make the next automatic issue skip.

### 5.3 Preview day

When automatic sending is on and a send time is 48 hours away:

1. **Nothing to send.** If §5.2 already rules out the send day, or there are no subscribers, email the preview recipients a short note saying no newsletter goes out this time, and why. Create nothing.
2. **Otherwise, create the issue:** kind `blog`, status `scheduled`, `scheduled_for` the send time. The post is the newest by its `date` that:
   - has a usable photo (§4.1);
   - isn't on any sent issue (§5.7);
   - has a photo that wasn't in any of the last 6 sent issues.

   A post passed over for its photo keeps its place and is considered again next time. Its fields:

| Field | Filled with |
|---|---|
| Subject | The post title |
| Inbox preview text | The excerpt |
| Kicker | The post's first category, or the chosen design's sample kicker when that category is the generic "Blog" ("A moment for yourself" in 01, "A little space for you" in 02) |
| Title | The post title |
| Intro | The post's first prose paragraph (rules below). If none qualifies, the `summary` (22 posts have one), else the excerpt. The excerpts are written for search results ("Discover…", "Explore…"), so they come last. |
| Byline | Reading time, as §4 part 4 |
| Hero photo | The post's photo (§4.1) |
| Article link | `https://hopetrustindia.com/blogs/<slug>/` |
| Question | Empty |

**The first prose paragraph** is the first block that:

- isn't a heading, list, image or quote;
- is at least 120 characters long.

To clean it:

- reduce links to their text;
- remove bare "(https://…)" text;
- cut it at a sentence end, at most 320 characters.

3. **Email the preview recipients** the issue, rendered as a test email, under a short note. The note says when it goes out, how many subscribers there are now, and links to `/arel-ops` to edit, swap or skip. Subject: "[Preview] Tue 21 Oct: ‹subject›".

If no unsent post with a usable photo is left, the note says so, and nothing is scheduled.

### 5.4 What staff can do in `/arel-ops`

The scheduled issue sits at the top of the Issues list, with its send time. Before that time, staff can:

- **Edit:** the subject, inbox preview text, kicker, title, intro and question, and replace the hero photo.
- **Swap the post:** search the posts by title; already-sent posts are marked. Swapping refills the fields from the new post. It asks to confirm first, because edits are lost.
- **Skip this fortnight:** the issue becomes `skipped`. Its post isn't used up and is first in line next time.
- **Send a test**, as for any issue.

Saving uses the existing save with its conflict check (base §8.1, as built in plan 3).

### 5.5 Send time

When a scheduled issue's send time comes:

1. **Switched off since the preview:** the issue becomes a draft, and nothing is sent.
2. **Rule or subscribers:** re-check §5.2 and that there are subscribers. If either fails, mark the issue `skipped` with the reason and tell the preview recipients.
3. **Sync** in full, pull and push (base §9.3).
4. **Send** as in base §9.1 from step 2: lock, render, checks, `POST /broadcasts`, then `sent`, draft or `needs_check`.
5. **Sent:** the post is now used. Email the preview recipients a short "Sent to N subscribers" note.
6. **Clear failure:** the issue becomes a draft with the error, and the preview recipients get an email saying it didn't go out and why. Staff can fix it and send it by hand; §5.2 still applies.
7. **Unclear outcome:** `needs_check`. The next run runs Check status (base §9.1 step 8) by itself.

### 5.6 Running it

- **One Netlify scheduled function,** often enough that sends go out within 15 minutes of 10:00. Netlify runs scheduled functions only on the published production deploy, never on deploy previews or branch deploys.
- **Each run is idempotent.** It works out what's due from the clock and the database, and does each step at most once. Two overlapping runs, or a retry after a timeout, must never send twice or preview twice.
- **Catching up after missed runs:**
  - A late preview still goes out, up to the send time.
  - A late send still goes out up to 3 hours after its time. After that, the issue is marked `missed` and the preview recipients are told.
- **Time limit:** Netlify stops a scheduled function after 30 seconds. The sync and the send must fit in that, or the builder splits them across runs.
- **Local testing:** the function can be run by hand under `netlify dev` for the live check.

### 5.7 Blog posts at run time

- **Where they are:** the posts are `.mdx` files in `content/blogs/`, read at build time by `lib/blog.ts`.
- **What's needed:** the function and the post search in `/arel-ops` need each post's slug, title, date, excerpt, summary, first category, featured image, reading time and URL.
- **How they get them:** the builder chooses, for example a JSON index generated at build time, bundled with the function and served to `/arel-ops`. A new post becomes available after the deploy that adds it.
- **"Already sent"** means the post's slug is on a sent issue. That includes a manual issue whose article link is a blog post.

## 6. Manual issues

- **New fields:** kicker and question, both optional.
- **Renamed field:** "Blog link for Share" becomes "Article link", still optional. When it's set, the email shows **Read the article**, and the share buttons share it.
- **Used posts:** a manual issue whose article link is a blog post marks that post as sent.
- **Unchanged:** the preview, test send, send dialog and history work as now, with the §5.2 rule added.

## 7. Settings and data

The user pastes SQL changes into Supabase's SQL editor, as in plans 2 and 3. The Supabase MCP can't write in this client. Check them afterwards with read-only queries.

- **`newsletter_issues`** gains:
  - `kind`: `manual` (the default) or `blog`;
  - the post slug, kicker, intro and question;
  - the reading time;
  - `scheduled_for`;
  - a skip or miss reason;
  - an issue number, assigned at send as the count of sent issues + 1.

  Its statuses gain `scheduled`, `skipped` and `missed`. Existing manual rows stay valid.
- **A one-row settings table**, admin-only like the other newsletter tables, holding:
  - automatic on/off, the first send date and the preview recipients;
  - the book panel: on/off, eyebrow, title, text, link text and URL.
- **Audit log:** every settings change, swap and skip goes to `admin_audit_log`.
- **Live check's test issue:** delete it afterwards (plan 3 Task 17 Step 6 offers this). Otherwise the first real issue is numbered 02.
- **Left to the builder:** names, constraints and indexes.

## 8. Wording to change

"Monthly" becomes "fortnightly" in:

- `components/BlogListClient.tsx:228`
- `components/LargeRectangleSection.tsx:105`
- `components/NewsletterDialogButton.tsx:97`
- `components/NewsletterConfirm.tsx:73`
- `app/privacy-policy/page.tsx:129`
- `lib/newsletter/subscriber.ts:52`
- `lib/newsletter/confirm-email.ts`, if it says monthly
- Resend's unsubscribe-page text (base §4 step 3)

**Two of these need care:**

- **The consent text** in `subscriber.ts` is what people agree to at sign-up. No one has signed up yet, so it can change without asking anyone to consent again.
- **The privacy-policy wording** still waits for Hope Trust's approval, on the go-live checklist.

### 8.1 Broken titles

Some post titles lost a space or a separator in the WordPress import. A post's title becomes the email's subject and heading. Fix them in the post files' `title` field, not the slug. Known so far:

- "When Your Heart Stirs for AnotherNavigating the Uncharted Waters of Married Attraction"
- "The Questions That Never Leave UsA Lifetime Journey from Teenage Doubt to Elder Wisdom"
- "Surrender to Win:The Liberating Paradox at the Heart of All Growth"
- "The Quiet Cracks:When Growing Apart is the Cost of Growing Up"
- "Addiction and ObsessionHow It Impacts The Addict And Where It Can Lead"
- "ExpectationsThe deadly traps for recovering addicts"
- "Healing a Broken HeartSteps to Healing"

**To find the rest:**

- check every title for a lower-case letter running into a capital, and a colon without a space after it;
- read the titles of the first year's queue.

**How to fix them:**

- Where the join separated a subtitle, use ": ", so the emphasis rule (§4 part 3) works.
- These fixes also correct the titles on the website.

## 9. Constraints

- **Plan 3's Global Constraints apply,** including:
  - the ES5 `tsc` target;
  - explicit `.mts` import extensions;
  - the 10-second limit on HTTP functions;
  - vitest for tests.
- **Resend:**
  - The account is shared with other clients, so broadcast names carry the issue marker (base §9.1).
  - The free plan allows 100 regular emails a day (tests, previews and notes) and 1,000 contacts.
- **Time:** use India time for every date shown or compared, and store times in UTC.

## 10. Testing

**Unit tests:**

- the schedule: send and preview times from a first date, across month and year ends;
- the §5.2 rule;
- the post choice: newest unsent with a usable photo, the photo-repeat rule, and after skips and swaps;
- the intro: finding and cleaning the first paragraph, and the fallbacks;
- the Unsplash URL rewrite;
- the renderer for both kinds, including the title emphasis;
- the scheduled function's decisions, with a fake clock:
  - preview due;
  - send due;
  - overlapping runs;
  - catch-up and missed;
  - switched off.

**Live check.** Plan 3's Task 17 runs once, on the new design. It adds:

- an automatic send due a few minutes after the run (the builder decides how, for example a test-only clock override under `netlify dev`);
- the preview email;
- an edited question;
- the send;
- the skip path.

**Email clients:** as in the base spec (§1 and §16).

## 11. Open questions for Hope Trust

1. Which design: 01 Cream editorial or 02 Teal contemporary?
2. Who gets the preview emails?

## 12. Left to the builder

- how the function and `/arel-ops` get the post list (§5.7);
- how often the function runs;
- whether the sync and the send share a run;
- how the WebP site images get JPEG copies;
- table, column and constraint names;
- how the chosen design's HTML becomes the renderer's template.
