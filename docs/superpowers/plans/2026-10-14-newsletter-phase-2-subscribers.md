# Newsletter Phase 2: Subscribers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** People can sign up for the Hope Trust newsletter on the website and confirm by email. Admins can see, import, export, unsubscribe and delete subscribers in `/arel-ops`. Supabase stays the record of consent, and Resend's "Newsletter" segment holds a copy of exactly the subscribed people.

**Architecture:**

- **Three new Netlify functions (TypeScript `.mts`):** `newsletter-subscribe` and `newsletter-confirm` (public), and `admin-newsletter-subscribers` (JWT). Each function file is three lines. It hands the request to a handler in `netlify/functions/_shared/` along with a `NewsletterDeps` object (database, Resend client, settings, clock, admin check).
- **Handlers get their services passed in.** Production builds the real ones (`liveDeps()`). Tests pass in-memory versions (`tests/vitest/functions/newsletter/fakes.ts`), so every rule is tested without Supabase or Resend.
- **Shared rules live in `lib/newsletter/`.** They're plain TypeScript, so the browser (form, import dialog) and the functions use the same validation.
- **Sync** (`newsletter-sync.mts`) has two halves:
  - **Pull** copies unsubscribes made on Resend's page into Supabase. It also takes anyone out of the segment who has no consent on record.
  - **Push** sends waiting changes to Resend, within a time budget, so it fits Netlify's function time limit.

**Tech Stack:**

- Next.js 15 (static export), React 18.2, Tailwind 3.3.
- Netlify Functions v2 (`export default (req: Request) => Response`), bundled by esbuild.
- `@supabase/supabase-js` with the service role, and the Resend REST API (`fetch`).
- `zod` 3.23, `jsonwebtoken`, and SheetJS `xlsx` 0.20.3 from `cdn.sheetjs.com`.
- Vitest 4 (jsdom, plus `// @vitest-environment node` for function tests), Testing Library, and Playwright.

**Spec:** `docs/superpowers/specs/2026-10-13-newsletter-design.md`. This plan covers §14 phase 2: §7 signup and consent, §8.2 the Subscribers screen, §9.3 sync, §10.1 and §10.3 data, the subscriber endpoints in §11, and §12. It uses the §16 results from plan 1: `.mts` functions bundle fine, and the domain is verified in Resend.

This is **plan 2 of 3**. Plan 3 covers issues, the editor, sending and the clean-up. It reuses `NewsletterDeps`, `pushAndRecord`, `runSync` and `NewsletterTab` from this plan.

## Global Constraints

These come from the spec. Every task must respect them.

- **Sender:** `Hope Trust <newsletter@hopetrustindia.com>` (`NEWSLETTER_FROM_EMAIL`). Replies go to `frontoffice@hopetrustindia.com`.
- **Same answer for everyone:** after submitting, everyone sees "Check your inbox to confirm your subscription", whether the address is new, pending, subscribed or unsubscribed. No public response says whether an address is on the list.
- **Notice under every form:** "We'll email you the Hope Trust newsletter about once a month. Unsubscribe any time." It links to the privacy policy, and it carries a version number that's stored with each signup.
- **Validation:** name 2–200 characters. Email must be valid and at most 254 characters, and is stored trimmed and in lower case. Phone isn't collected.
- **Rate limits:**
  - 5 confirmation emails per IP address per 15 minutes;
  - at least 10 minutes between confirmation emails to one address;
  - at most 3 confirmation emails to one address before it confirms.
- **Unconfirmed signups** (`pending`) are deleted after 30 days. `unsubscribed` rows are never cleaned up.
- **Confirmation token:**
  - 32 random bytes; only its SHA-256 hash is stored;
  - valid for 7 days and works once;
  - the confirm page asks for a click and is `noindex`;
  - `newsletter` is added to `UNLISTED` in `scripts/generate-sitemap.mjs`.
- **Import:**
  - CSV and .xlsx files, sent in chunks of 200 rows;
  - needs a consent statement and a tick;
  - skips invalid addresses, addresses already in the table (whatever their status) and erased addresses;
  - new rows are `subscribed` with `source = 'import'`, storing the statement, the uploader, a batch ID and the time.
- **Erasure:** Delete removes the row and the Resend contact. The audit log records the subscriber ID, not the email. The SHA-256 of the address goes into `newsletter_erased`, and a website confirmation removes it again.
- **Access:** RLS on every newsletter table with no `anon` policies. Only the functions (service role) touch the tables.
- **Admin endpoints:** check the JWT that `admin-login` issues. Every import, export, unsubscribe and delete is written to `admin_audit_log`.
- **Public endpoints:** honeypot, rate limits, a 4 KB request limit, and CORS headers naming the site.
- **Functions:** new ones are `.mts`, and each gets an `/api/*` redirect in `netlify.toml`.
- **Resend:** at most 10 requests a second per team. The free plan stores 1,000 contacts, unsubscribed ones included.
- **Commits:** every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Repo traps:**
  - Tailwind 3.3 has no 5%-step opacity classes (`bg-black/65` compiles to nothing); use arbitrary values such as `bg-black/[0.6]`.
  - Never run `next build` while `next dev` runs in the same folder.
  - `next build` type-checks `app/`, `components/` and `lib/` against an ES5 target, so code there must not use `for…of` over a Map, a Set or `.entries()`. `npx tsc --noEmit -p tsconfig.json` has 0 errors on this branch and must stay at 0. `netlify/` and `tests/` aren't type-checked.
  - Seven Vitest tests already fail on this branch (1 in `Header.test.tsx`, 6 in `pages/contact.test.tsx`; baseline 378 pass, 7 fail). They are not this plan's to fix.

## Decisions this plan makes

The spec leaves these open or gets them slightly wrong. Task 15 writes them back into the spec.

1. **SQL files:** the tables go in `Database/newsletter.sql`. The bucket stays in `Database/newsletter-storage.sql`, which plan 1 already applied. This settles a deferred minor from plan 1's final review.
2. **Consent evidence:**
   - `signup_page`, `signup_ip`, `signup_user_agent` and a new `signup_notice` column describe the latest website signup request.
   - `consent_at` and `consent_note` describe the consent itself and change only on confirmation or import. So an unconfirmed re-signup by someone who unsubscribed never overwrites when and how they first agreed.
   - `source` is where the current consent came from: a website confirmation sets it to `website`, even for someone first imported.
3. **The confirmation link is `/newsletter/confirm/#t=<token>`,** not `?t=`. A URL fragment never reaches a server log or Google Analytics, which is already on every page.
4. **Resend gets the email address and subscription state only, no names.** V1 has no personalised greetings, and handing a processor less personal data is better under DPDP.
5. **Rate limits that would reveal something stay silent:**
   - The IP limit counts addresses per IP and answers 429; it describes the requester, not the address.
   - The per-address limits return the normal success message and send nothing, because a 429 there would reveal that the address signed up recently.
6. **Sync:**
   - Push looks a contact up before creating it, so it never relies on how Resend treats a duplicate create.
   - Contacts in the segment with no consent on record are removed from it.
   - An imported address that already unsubscribed in Resend stays unsubscribed.
   - Each call works for at most about 7 seconds, not a fixed 40 rows, because Netlify's time limit may be as short as 10 seconds.
7. **Delete removes the Resend contact first** and keeps the row if that fails. Otherwise a failed delete would leave an erased person in the segment, with no row left to retry from.
8. **The CSV export starts with a UTF-8 BOM,** so Excel shows Hindi and Telugu names. Any cell starting with `=`, `+`, `-` or `@` gets a leading `'`, because names come from the public and Excel would run them as formulas.
9. **The `RESEND_API_KEY` needs Full access.** A sending-only key gets 401 on contacts and segments.
10. **`Database/rls-policies.sql` and `Database/supabase-setup.sql` lose their old newsletter sections now, not in phase 4.** Re-running either file would otherwise recreate a public insert policy on the new table.
11. **The privacy policy gets a newsletter section.** The spec doesn't mention it, but the form's notice links there. Hope Trust must approve the wording before the forms go live (Task 17).

## Review Focus

These are the failure modes the spec implies that are most likely to bite a real person. Each has a test in the task that owns the code.

1. **Re-signup after unsubscribing.** The person stays unsubscribed, with their unsubscribe record, until they click the new link. Once they do, they're subscribed in Resend again, not silently left unsubscribed there. Tests:
   - Task 7: "keeps an unsubscribed person unsubscribed, with their records, until they confirm";
   - Task 8: "re-subscribes someone who unsubscribed, once they click, here and in Resend";
   - Task 6: "re-subscribes a website row whose contact is unsubscribed".
2. **Unsubscribes that cross with other changes.**
   - An unsubscribe on Resend's page must not undo a newer website confirmation that hasn't reached Resend yet.
   - An imported address that already unsubscribed in Resend must not be re-subscribed by the import.
   - Tests in Task 6: "leaves rows with a waiting change for the push", and "keeps an imported address unsubscribed when it already unsubscribed in Resend".
3. **Text from the public in admin files.** A name like `=HYPERLINK("http://x")` must not run as a formula in Excel. Hindi and Telugu names must survive both the CSV export and a UTF-8 CSV import. Tests:
   - Task 10: "exports a formula-safe CSV that Excel reads as UTF-8";
   - Task 9: "reads a UTF-8 CSV, with or without a byte-order mark".
4. **Duplicate submissions.** Two quick submits for one address, or the same file imported twice, must not create duplicate rows or return an error. Tests:
   - Task 7: "gives a concurrent request for the same address the normal answer";
   - Task 10: "never changes rows that already exist, whatever their status, and skips erased addresses".
5. **A sync that can't finish.** One address Resend keeps rejecting must not stop the rest of the queue or leave the Sync button spinning forever. Tests:
   - Task 6: "one failing row doesn't stop the others, and stays queued";
   - Task 14, `syncUntilDone`: "stops when a call makes no progress".

---

## File structure

| File | Status | Responsibility |
|---|---|---|
| `Database/newsletter.sql` | Create | `newsletter_subscribers` (recreated), `newsletter_erased`, indexes, trigger, RLS |
| `Database/rls-policies.sql`, `Database/supabase-setup.sql` | Modify | Drop the old public-insert newsletter sections |
| `lib/newsletter/subscriber.ts` | Create | Subscriber types, email rules, signup schema, notice text and version |
| `lib/newsletter/confirm-email.ts` | Create | The confirmation email (HTML and text) |
| `lib/newsletter/import.ts` | Create | Spreadsheet grid → checked, de-duplicated rows |
| `lib/newsletter/read-spreadsheet.ts` | Create | Reads an uploaded CSV/.xlsx in the browser with SheetJS |
| `lib/newsletter-admin.ts` | Create | Typed client for `/api/admin-newsletter-subscribers`, plus `syncUntilDone` |
| `netlify/functions/_shared/newsletter-crypto.mts` | Create | Token and email hashing |
| `netlify/functions/_shared/resend.mts` | Create | Paced Resend REST client |
| `netlify/functions/_shared/newsletter-db.mts` | Create | `NewsletterDb` interface and its Supabase implementation |
| `netlify/functions/_shared/admin.mts` | Create | Admin JWT check |
| `netlify/functions/_shared/newsletter-deps.mts` | Create | `NewsletterDeps` and `liveDeps()` |
| `netlify/functions/_shared/newsletter-sync.mts` | Create | `planPull`, `pushOne`, `pushAndRecord`, `runSync` |
| `netlify/functions/_shared/http.mts` | Create | JSON, CORS, body and IP helpers |
| `netlify/functions/_shared/newsletter-signup.mts` | Create | `handleSubscribe`, `handleConfirm` |
| `netlify/functions/_shared/newsletter-admin.mts` | Create | `handleAdminSubscribers` |
| `netlify/functions/newsletter-subscribe.mts`, `newsletter-confirm.mts`, `admin-newsletter-subscribers.mts` | Create | The three functions |
| `netlify.toml` | Modify | Three `/api/*` redirects |
| `components/NewsletterForm.tsx` | Rewrite | Public signup form |
| `components/NewsletterDialogButton.tsx` | Create | Footer button and dialog |
| `components/Footer.tsx`, `components/BlogListClient.tsx`, `components/LargeRectangleSection.tsx`, `app/page.tsx` | Modify | The three placements |
| `components/NewsletterConfirm.tsx`, `app/newsletter/confirm/layout.tsx`, `app/newsletter/confirm/page.tsx` | Create | Confirm page |
| `scripts/generate-sitemap.mjs` | Modify | `newsletter` in `UNLISTED` |
| `app/privacy-policy/page.tsx` | Modify | Newsletter section |
| `components/admin/newsletter/NewsletterTab.tsx`, `SubscribersScreen.tsx`, `ImportDialog.tsx` | Create | Admin Newsletter tab |
| `app/arel-ops/page.tsx` | Modify | Newsletter tab button and panel |
| `package.json`, `package-lock.json` | Modify | `xlsx` → SheetJS 0.20.3 |
| `supabase/functions/send-newsletter/` | Delete | Old, never-deployed function |
| `.env.example`, the spec | Modify | New variable; decisions and results |
| `tests/vitest/lib/newsletter/*.test.ts`, `tests/vitest/functions/newsletter/*`, `tests/vitest/components/*`, `tests/vitest/pages/*`, `tests/e2e/newsletter.spec.ts` | Create | Tests |

---
### Task 1: Check Resend's contact calls and get the segment ID

The spec left one Resend detail open (§9.3): the exact call that adds an existing contact to a segment. Resend's docs, read on 14 Oct 2026, answer it, but they don't say what several error cases return. Task 4's client is written for the behaviour below. This task checks it against the live API with a throwaway contact on `example.com`, which receives no email, and the contact is deleted at the end. Nothing from this task is committed.

**What Resend's docs say** (https://resend.com/docs/api-reference):

- **Contacts are global, one per email address, since November 2025.**
  - `unsubscribed` is a single team-wide flag that blocks every broadcast.
  - The old Audiences are now called Segments.
- **Contact calls:**
  - `POST /contacts` with `{ email, unsubscribed, segments: [{ id }] }` creates a contact, already in the segment.
  - `GET`, `PATCH` and `DELETE /contacts/{id|email}` read, update and remove one.
  - `POST /contacts/{id|email}/segments/{segment_id}` adds an existing contact to a segment; `DELETE` on the same path removes it.
  - `GET /contacts/{id|email}/segments` lists a contact's segments.
- **Listing:** `GET /contacts?segment_id=…&limit=100&after=<last id>` returns `{ has_more, data: [{ id, email, unsubscribed, … }] }`.
- **Rate limit:** 10 requests a second per team; a `429` carries `retry-after`.

**Files:**
- Create, not committed: `.newsletter-preview/resend-check.mts` (the folder is git-ignored)

**Interfaces:**
- **Consumes:** `RESEND_API_KEY` from `.env`.
- **Produces:**
  - `RESEND_NEWSLETTER_SEGMENT_ID` in `.env`;
  - the observed status codes, which Task 4 relies on and Task 15 records.

- [ ] **Step 1: Ask the user**

Ask, and wait for answers:

1. Is the `RESEND_API_KEY` in `.env` a **Full access** key? Contacts and segments need one. A "Sending access" key gets 401. If unsure, run the script anyway: it says so.
2. Does a segment named "Newsletter" exist in Resend? If not, may the script create it? This is spec §4 step 3, and an empty segment is harmless.
3. May the script create and then delete one throwaway contact, `newsletter-check+<timestamp>@example.com`?

- [ ] **Step 2: Write the script**

Create `.newsletter-preview/resend-check.mts`:

```ts
// Checks the Resend contact and segment calls that the newsletter sync relies
// on, using one throwaway contact that is deleted at the end.
//
//   node --env-file=.env .newsletter-preview/resend-check.mts [--create-segment]

const KEY = process.env.RESEND_API_KEY;
if (!KEY) {
  console.error('RESEND_API_KEY is not set');
  process.exit(1);
}

type Result = { status: number; json: any; limit: string | null };

async function call(method: string, path: string, body?: unknown): Promise<Result> {
  await new Promise((resolve) => setTimeout(resolve, 150)); // stay under 10 requests a second
  const res = await fetch(`https://api.resend.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${KEY}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = text;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // keep the raw text
  }
  return { status: res.status, json, limit: res.headers.get('ratelimit-limit') };
}

function show(label: string, r: Result) {
  console.log(`${label.padEnd(36)} ${r.status} ${JSON.stringify(r.json)}`);
}

const segments = await call('GET', '/segments');
show('A0  list segments', segments);
if (segments.status === 401 || segments.status === 403) {
  console.error('\nThis API key cannot manage contacts. Create a Full access key in Resend and put it in .env.');
  process.exit(1);
}
let segmentId: string | undefined =
  process.env.RESEND_NEWSLETTER_SEGMENT_ID ||
  segments.json?.data?.find((s: { name: string }) => s.name === 'Newsletter')?.id;
if (!segmentId && process.argv.includes('--create-segment')) {
  const created = await call('POST', '/segments', { name: 'Newsletter' });
  show('A0b create segment "Newsletter"', created);
  segmentId = created.json?.id;
}
if (!segmentId) {
  console.error('\nNo "Newsletter" segment. Re-run with --create-segment, or create it in Resend.');
  process.exit(1);
}

const email = `newsletter-check+${Date.now()}@example.com`;
const encoded = encodeURIComponent(email).replace(/%40/g, '@');

show('A1  get unknown contact', await call('GET', `/contacts/${encoded}`));
show('A5  update unknown contact', await call('PATCH', `/contacts/${encoded}`, { unsubscribed: true }));
const created = await call('POST', '/contacts', { email, unsubscribed: false, segments: [{ id: segmentId }] });
show('A2  create contact in segment', created);
const id: string = created.json?.id;
show('A9  create same email again', await call('POST', '/contacts', { email, unsubscribed: false }));
show('A1b get by raw email', await call('GET', `/contacts/${email}`));
show('A1c get by encoded email', await call('GET', `/contacts/${encoded}`));
show('A3  add to segment again', await call('POST', `/contacts/${id}/segments/${segmentId}`));
show('A3b contact segments', await call('GET', `/contacts/${id}/segments`));
show('A4  unsubscribe by id', await call('PATCH', `/contacts/${id}`, { unsubscribed: true }));
const listed = await call('GET', `/contacts?segment_id=${segmentId}&limit=100`);
const mine = listed.json?.data?.find((c: { id: string }) => c.id === id) ?? null;
console.log(`${'A4b listed in segment'.padEnd(36)} ${listed.status} ${JSON.stringify(mine)}  ratelimit-limit=${listed.limit}`);
show('A7  remove from segment', await call('DELETE', `/contacts/${id}/segments/${segmentId}`));
show('A6  delete contact', await call('DELETE', `/contacts/${id}`));
show('A6b delete again', await call('DELETE', `/contacts/${id}`));

console.log(`\nAdd this line to .env:\nRESEND_NEWSLETTER_SEGMENT_ID=${segmentId}`);
```

- [ ] **Step 3: Run it**

Run: `node --env-file=.env .newsletter-preview/resend-check.mts`. Add `--create-segment` only if the user agreed in Step 1.

- [ ] **Step 4: Compare with what Task 4 expects**

| Line | Expected | If different |
|---|---|---|
| A0 | `200` with a `data` list | 401/403: the key is sending-only. The user creates a Full access key, replaces it in `.env`, and the script runs again. |
| A1 | `404` | Note the status; in Task 4, make `getContact`, `updateContact` and `deleteContact` treat that status as "not found" too. |
| A5 | `404` | Same as A1. |
| A2 | `200` or `201` with an `id` | Stop: the sync can't create contacts. Show the user the response. |
| A9 | anything | For information only. The push always looks a contact up before creating it. |
| A1b, A1c | `200` with `"unsubscribed":false` | If A1c (`%2B`) fails but A1b works, change `contactKey` in Task 4 to leave `+` unencoded: `encodeURIComponent(v).replace(/%40/g, '@').replace(/%2B/g, '+')`. |
| A3 | `200` (already a member), or a 4xx | Either works: `ensureInSegment` checks membership after a 4xx. Note which. |
| A3b | `200`, listing the segment | — |
| A4, A4b | `200`, then `"unsubscribed":true` in the segment list | — |
| A7, A6 | `200` | — |
| A6b | `404` | Same as A1. |
| `ratelimit-limit` | `10` or more | If lower, set `minIntervalMs` in Task 4 to `Math.ceil(1000 / limit) + 10`. |

- [ ] **Step 5: Save the segment ID**

Add the printed `RESEND_NEWSLETTER_SEGMENT_ID=…` line to `.env`. Keep the script's output for Task 15. `.newsletter-preview/` is git-ignored, so there's nothing to commit.

---

### Task 2: The subscriber tables

This replaces the unused 2025 table, which had `full_name`, `email` and `phone` columns, held 0 rows on 14 Oct 2026, and has an `anon` insert policy. It also adds the erasure list. RLS is enabled, no policies are added, and grants to `anon` and `authenticated` are revoked: only the functions use these tables, through the service role.

**Files:**
- Create: `Database/newsletter.sql`
- Modify: `Database/rls-policies.sql`, `Database/supabase-setup.sql`

**Interfaces:**
- **Consumes:** `public.set_updated_at()`, which already exists and is used by `enrollments` and `doctors`.
- **Produces:**
  - `public.newsletter_subscribers`, whose 23 columns match `SubscriberRow` in Task 3;
  - `public.newsletter_erased (email_sha256, erased_at)`.

- [ ] **Step 1: Write the SQL**

Create `Database/newsletter.sql`:

```sql
-- =============================================================================
-- Newsletter: subscribers and erased addresses
-- Spec: docs/superpowers/specs/2026-10-13-newsletter-design.md §10.1, §10.3
--
-- Safe to run more than once. The old 2025 table (full_name, email, phone) is
-- dropped only while it still has that shape and no rows.
-- The image bucket is in newsletter-storage.sql; plan 3 adds newsletter_issues.
--
-- Access: RLS is on and there are no policies, and anon/authenticated have no
-- grants. Only the Netlify functions (service role) read or write these tables.
-- =============================================================================

-- 1. Drop the unused 2025 table (0 rows on 14 Oct 2026).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'newsletter_subscribers' and column_name = 'phone'
  ) then
    if exists (select 1 from public.newsletter_subscribers) then
      raise exception 'The old newsletter_subscribers table has rows. Migrate them before running this file.';
    end if;
    drop table public.newsletter_subscribers;
  end if;
end $$;

-- 2. Subscribers. Supabase is the record of consent; Resend's "Newsletter"
--    segment holds a copy of the subscribed rows.
create table if not exists public.newsletter_subscribers (
  id                        uuid primary key default gen_random_uuid(),
  email                     text not null unique
                              check (email = lower(btrim(email)) and char_length(email) between 3 and 254),
  full_name                 text check (full_name is null or char_length(btrim(full_name)) between 1 and 200),
  status                    text not null default 'pending'
                              check (status in ('pending', 'subscribed', 'unsubscribed')),
  -- where the current consent came from
  source                    text not null check (source in ('website', 'import')),

  -- consent evidence: set only by a confirmation click or an import
  consent_at                timestamptz,
  consent_note              text check (consent_note is null or char_length(consent_note) <= 600),
  imported_by               text,
  import_batch_id           uuid,

  -- the latest website sign-up request (also used for the rate limits)
  signup_page               text check (signup_page is null or char_length(signup_page) <= 200),
  signup_ip                 text,
  signup_user_agent         text check (signup_user_agent is null or char_length(signup_user_agent) <= 500),
  signup_notice             text check (signup_notice is null or char_length(signup_notice) <= 20),

  -- email confirmation: only the SHA-256 of the token is kept
  confirm_token_hash        text unique,
  confirm_token_expires_at  timestamptz,
  confirm_sent_at           timestamptz,
  confirm_send_count        int not null default 0,

  -- unsubscribe record
  unsubscribed_at           timestamptz,
  unsubscribe_source        text check (unsubscribe_source in ('resend', 'admin')),

  -- the copy in Resend
  resend_contact_id         text,
  resend_synced_at          timestamptz,  -- null = a change Resend hasn't seen yet

  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index if not exists newsletter_subscribers_status_idx
  on public.newsletter_subscribers (status);
create index if not exists newsletter_subscribers_signup_ip_idx
  on public.newsletter_subscribers (signup_ip, confirm_sent_at);
create index if not exists newsletter_subscribers_unsynced_idx
  on public.newsletter_subscribers (updated_at) where resend_synced_at is null;
create index if not exists newsletter_subscribers_created_idx
  on public.newsletter_subscribers (created_at desc);

-- Same function as Database/enrollments.sql and doctors-table.sql.
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists newsletter_subscribers_updated_at on public.newsletter_subscribers;
create trigger newsletter_subscribers_updated_at
  before update on public.newsletter_subscribers
  for each row execute function set_updated_at();

comment on table public.newsletter_subscribers is
  'Newsletter subscribers and their consent evidence. Written only by the newsletter Netlify functions.';
comment on column public.newsletter_subscribers.signup_ip is
  'IP address of the latest website sign-up request; the consent itself is consent_at/consent_note.';
comment on column public.newsletter_subscribers.resend_synced_at is
  'Null while a change has not reached Resend; the sync pushes these rows.';

-- 3. Erased addresses: only a hash, so an old spreadsheet can't add someone back.
create table if not exists public.newsletter_erased (
  email_sha256  text primary key check (email_sha256 ~ '^[0-9a-f]{64}$'),
  erased_at     timestamptz not null default now()
);

comment on table public.newsletter_erased is
  'SHA-256 of the lower-cased address of everyone deleted from the newsletter. Imports skip these.';

-- 4. Access: functions only.
alter table public.newsletter_subscribers enable row level security;
alter table public.newsletter_erased enable row level security;
revoke all on table public.newsletter_subscribers from anon, authenticated;
revoke all on table public.newsletter_erased from anon, authenticated;
```

- [ ] **Step 2: Remove the old newsletter sections from the two setup files**

In `Database/rls-policies.sql`, replace everything from the `-- TABLE: newsletter_subscribers` header block down to and including `CREATE POLICY "Deny anon delete" ON newsletter_subscribers` and its `FOR DELETE TO anon USING (false);` line with:

```sql
-- ------------------------------------------------------------
-- TABLE: newsletter_subscribers
-- Moved to Database/newsletter.sql (October 2026). It has no anon policies:
-- sign-ups go through the newsletter-subscribe Netlify function.
-- ------------------------------------------------------------
```

In the same file's verification comment, change:

```sql
-- Expected: every table shows relrowsecurity = true
--           and policies show 3 inserts + 3 denials each.
```

to:

```sql
-- Expected: every table shows relrowsecurity = true; contact_submissions and
--           joinus_applications show 1 insert + 3 denials each, and
--           newsletter_subscribers shows no policies (see newsletter.sql).
```

In `Database/supabase-setup.sql`, replace the block from `create table if not exists newsletter_subscribers (` through `for insert to anon with check (true);` that follows it (the `newsletter_subscribers` policy only) with:

```sql
-- Newsletter subscribers: see Database/newsletter.sql. Don't recreate the old
-- table or its public insert policy here.
```

- [ ] **Step 3: Apply it to the database (ask first)**

This changes the live database, so ask the user before applying it, as plan 1 did for the bucket. Once they agree, apply `Database/newsletter.sql` with the Supabase MCP tool `apply_migration`: project `mjgbotzrjmwggzwkoovi`, name `newsletter_subscribers_v2`. The user can instead paste the file into the Supabase SQL editor.

- [ ] **Step 4: Check the result**

Run with the MCP tool `execute_sql`:

```sql
select
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'newsletter_subscribers') as subscriber_columns,
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'newsletter_erased') as erased_columns,
  (select bool_and(relrowsecurity) from pg_class
     where relnamespace = 'public'::regnamespace and relname in ('newsletter_subscribers', 'newsletter_erased')) as rls_on,
  (select count(*) from pg_policies
     where schemaname = 'public' and tablename in ('newsletter_subscribers', 'newsletter_erased')) as policies,
  (select count(*) from information_schema.role_table_grants
     where table_schema = 'public' and table_name in ('newsletter_subscribers', 'newsletter_erased')
       and grantee in ('anon', 'authenticated')) as public_grants,
  (select count(*) from pg_trigger
     where tgrelid = 'public.newsletter_subscribers'::regclass and not tgisinternal) as triggers;
```

Expected: `subscriber_columns = 23`, `erased_columns = 2`, `rls_on = true`, `policies = 0`, `public_grants = 0`, `triggers = 1`.

Then check the constraints and the trigger. This block leaves nothing behind:

```sql
do $$
declare fresh boolean;
begin
  begin
    insert into public.newsletter_subscribers (email, source) values ('Upper@Example.com', 'website');
    raise exception 'an upper-case email was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.newsletter_subscribers (email, source, status) values ('a@example.com', 'website', 'active');
    raise exception 'an unknown status was accepted';
  exception when check_violation then null;
  end;
  insert into public.newsletter_subscribers (email, source, updated_at)
    values ('schema-check@example.com', 'website', now() - interval '1 day');
  update public.newsletter_subscribers set full_name = 'Check' where email = 'schema-check@example.com';
  select updated_at > now() - interval '1 hour' into fresh
    from public.newsletter_subscribers where email = 'schema-check@example.com';
  delete from public.newsletter_subscribers where email = 'schema-check@example.com';
  if not fresh then raise exception 'the updated_at trigger did not fire'; end if;
end $$;
```

Expected: it succeeds with no error.

Then run the MCP tool `get_advisors` with type `security`. Expected: nothing new about `newsletter_subscribers` or `newsletter_erased`, except possibly the INFO notice "RLS enabled, no policies", which is intended. Show the user any WARN or ERROR that names these tables.

- [ ] **Step 5: Commit**

```bash
git add Database/newsletter.sql Database/rls-policies.sql Database/supabase-setup.sql
git commit -m "feat(newsletter): subscriber and erasure tables" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 3: Subscriber rules and token hashing

**Files:**
- Create: `lib/newsletter/subscriber.ts`
- Create: `netlify/functions/_shared/newsletter-crypto.mts`
- Test: `tests/vitest/lib/newsletter/subscriber.test.ts`
- Test: `tests/vitest/functions/newsletter/crypto.test.ts`

**Interfaces:**
- **Consumes:** the table shape from Task 2.
- **Produces:**
  - Types: `SubscriberStatus`, `SubscriberSource`, `UnsubscribeSource`, `SubscriberRow`, and `AdminSubscriber` (`SubscriberRow` without `confirm_token_hash` and `confirm_token_expires_at`).
  - Lists: `SUBSCRIBER_STATUSES`, `SUBSCRIBER_SOURCES`.
  - Notice and messages: `SIGNUP_NOTICE` (`{ version: '2026-10', text }`), `KNOWN_NOTICE_VERSIONS`, `SIGNUP_SUCCESS_MESSAGE`, `LIMITS`.
  - Email rules: `normaliseEmail(v)`, `emailSchema`, `isValidEmail(v)`.
  - Form validation: `nameSchema`, `signupSchema` (`{ full_name, email, page, notice, website? }`), `SignupInput`.
  - From `newsletter-crypto.mts`: `TOKEN_PATTERN`, `newToken()`, `hashToken(token)`, `hashEmail(email)`.

- [ ] **Step 1: Write the failing tests**

Create `tests/vitest/lib/newsletter/subscriber.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  KNOWN_NOTICE_VERSIONS,
  SIGNUP_NOTICE,
  isValidEmail,
  normaliseEmail,
  signupSchema,
} from '@/lib/newsletter/subscriber';

describe('normaliseEmail', () => {
  it('trims and lower-cases, the way the database stores addresses', () => {
    expect(normaliseEmail('  Asha.Rao@Example.COM ')).toBe('asha.rao@example.com');
  });
});

describe('isValidEmail', () => {
  it.each(['asha@example.com', 'a.b+news@sub.example.co.in', ' Asha@Example.com '])('accepts %s', (value) => {
    expect(isValidEmail(value)).toBe(true);
  });

  it.each(['', 'asha', 'asha@', '@example.com', 'asha rao@example.com', 'asha@example', null, 42])(
    'rejects %s',
    (value) => {
      expect(isValidEmail(value)).toBe(false);
    },
  );

  it('accepts 254 characters and rejects 255', () => {
    expect(isValidEmail(`${'a'.repeat(64)}@${'b'.repeat(185)}.com`)).toBe(true);
    expect(isValidEmail(`${'a'.repeat(64)}@${'b'.repeat(186)}.com`)).toBe(false);
  });
});

describe('signupSchema', () => {
  const valid = { full_name: '  Asha Rao ', email: ' Asha@Example.com', page: '/blogs/', notice: '2026-10' };

  it('trims the name and normalises the email', () => {
    const parsed = signupSchema.parse(valid);
    expect(parsed.full_name).toBe('Asha Rao');
    expect(parsed.email).toBe('asha@example.com');
    expect(parsed.page).toBe('/blogs/');
  });

  it('keeps Hindi, Telugu and emoji in names exactly as typed', () => {
    expect(signupSchema.parse({ ...valid, full_name: 'आशा రావు 🌿' }).full_name).toBe('आशा రావు 🌿');
  });

  it('asks for a name of at least two characters', () => {
    const result = signupSchema.safeParse({ ...valid, full_name: 'A' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({ path: ['full_name'], message: 'Please enter your full name' });
  });

  it('asks for an email address before complaining about its format', () => {
    const result = signupSchema.safeParse({ ...valid, email: '   ' });
    expect(result.error?.issues[0]).toMatchObject({ path: ['email'], message: 'Please enter your email address' });
  });

  it('falls back to "/" for a page path that is not a site path', () => {
    expect(signupSchema.parse({ ...valid, page: 'javascript:alert(1)' }).page).toBe('/');
    expect(signupSchema.parse({ ...valid, page: undefined }).page).toBe('/');
  });

  it('lets the honeypot field be left out', () => {
    expect(signupSchema.parse(valid).website).toBeUndefined();
  });
});

describe('SIGNUP_NOTICE', () => {
  it('is a version the sign-up function accepts', () => {
    expect(KNOWN_NOTICE_VERSIONS).toContain(SIGNUP_NOTICE.version);
  });
});
```

Create `tests/vitest/functions/newsletter/crypto.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { TOKEN_PATTERN, hashEmail, hashToken, newToken } from '@/netlify/functions/_shared/newsletter-crypto.mts';

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

describe('newToken', () => {
  it('makes 32 random bytes as base64url, different every time', () => {
    const a = newToken();
    const b = newToken();
    expect(a).toMatch(TOKEN_PATTERN);
    expect(b).toMatch(TOKEN_PATTERN);
    expect(a).not.toBe(b);
  });
});

describe('hashToken', () => {
  it('is the SHA-256 of the token, never the token itself', () => {
    const token = newToken();
    expect(hashToken(token)).toBe(sha256(token));
    expect(hashToken(token)).not.toContain(token);
  });
});

describe('hashEmail', () => {
  it('hashes the normalised address, so case and spaces do not matter', () => {
    expect(hashEmail(' Asha@Example.COM ')).toBe(sha256('asha@example.com'));
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/vitest/lib/newsletter/subscriber.test.ts tests/vitest/functions/newsletter/crypto.test.ts`
Expected: FAIL. Neither module exists yet.

- [ ] **Step 3: Write the modules**

Create `lib/newsletter/subscriber.ts`:

```ts
// Subscriber rules shared by the sign-up form, the admin screens and the
// newsletter functions (spec §7, §10.1). Browser-safe: no Node-only APIs.

import { z } from 'zod';

export type SubscriberStatus = 'pending' | 'subscribed' | 'unsubscribed';
export type SubscriberSource = 'website' | 'import';
export type UnsubscribeSource = 'resend' | 'admin';

export const SUBSCRIBER_STATUSES: readonly SubscriberStatus[] = ['pending', 'subscribed', 'unsubscribed'];
export const SUBSCRIBER_SOURCES: readonly SubscriberSource[] = ['website', 'import'];

/** One row of newsletter_subscribers (Database/newsletter.sql). Timestamps are ISO strings. */
export interface SubscriberRow {
  id: string;
  email: string;
  full_name: string | null;
  status: SubscriberStatus;
  /** Where the current consent came from. */
  source: SubscriberSource;
  consent_at: string | null;
  consent_note: string | null;
  imported_by: string | null;
  import_batch_id: string | null;
  /** The latest website sign-up request. */
  signup_page: string | null;
  signup_ip: string | null;
  signup_user_agent: string | null;
  signup_notice: string | null;
  confirm_token_hash: string | null;
  confirm_token_expires_at: string | null;
  confirm_sent_at: string | null;
  confirm_send_count: number;
  unsubscribed_at: string | null;
  unsubscribe_source: UnsubscribeSource | null;
  resend_contact_id: string | null;
  /** Null while a change hasn't reached Resend. */
  resend_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

/** A row as the admin screens get it: without the confirmation token. */
export type AdminSubscriber = Omit<SubscriberRow, 'confirm_token_hash' | 'confirm_token_expires_at'>;

/**
 * The notice under every sign-up form. Change `version` whenever the wording
 * changes, and add the new version to KNOWN_NOTICE_VERSIONS.
 */
export const SIGNUP_NOTICE = {
  version: '2026-10',
  text: "We'll email you the Hope Trust newsletter about once a month. Unsubscribe any time.",
} as const;

/** Versions the sign-up function accepts; a page opened before a change may still send an older one. */
export const KNOWN_NOTICE_VERSIONS: readonly string[] = ['2026-10'];

export const SIGNUP_SUCCESS_MESSAGE = 'Check your inbox to confirm your subscription.';

export const LIMITS = {
  name: 200,
  email: 254,
  page: 200,
  userAgent: 500,
  statement: 500,
} as const;

/** The form of an address the database stores. */
export function normaliseEmail(value: string): string {
  return value.trim().toLowerCase();
}

export const emailSchema = z
  .string({ required_error: 'Please enter your email address', invalid_type_error: 'Please enter your email address' })
  .trim()
  .toLowerCase()
  .min(1, 'Please enter your email address')
  .max(LIMITS.email, 'Please enter a shorter email address')
  .email('Please enter a valid email address');

export function isValidEmail(value: unknown): boolean {
  return emailSchema.safeParse(value).success;
}

export const nameSchema = z
  .string({ required_error: 'Please enter your full name', invalid_type_error: 'Please enter your full name' })
  .trim()
  .min(2, 'Please enter your full name')
  .max(LIMITS.name, 'Please use a shorter name');

/** The body the sign-up form posts to /api/newsletter-subscribe. */
export const signupSchema = z.object({
  full_name: nameSchema,
  email: emailSchema,
  /** Path of the page the form was on, e.g. "/blogs/". */
  page: z.string().trim().max(LIMITS.page).regex(/^\/\S*$/).catch('/'),
  notice: z.string().trim().max(20),
  /** Honeypot: hidden from people, so only bots fill it in. */
  website: z.string().max(500).optional(),
});

export type SignupInput = z.infer<typeof signupSchema>;
```

Create `netlify/functions/_shared/newsletter-crypto.mts`:

```ts
// Confirmation tokens and address hashes (spec §7.3, §7.5). Server-only.

import { createHash, randomBytes } from 'node:crypto';
import { normaliseEmail } from '../../../lib/newsletter/subscriber';

/** What newToken() produces: 32 random bytes as base64url. */
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Only this hash is stored, so a copy of the database can't confirm anyone. */
export function hashToken(token: string): string {
  return sha256(token);
}

/** What newsletter_erased keeps: no readable address, but imports can still match it. */
export function hashEmail(email: string): string {
  return sha256(normaliseEmail(email));
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run tests/vitest/lib/newsletter/subscriber.test.ts tests/vitest/functions/newsletter/crypto.test.ts`
Expected: PASS.

If "falls back to '/'" fails because zod's `.catch` isn't available, check that `node_modules/zod/package.json` is 3.22 or later (`.catch` arrived in 3.20 and `.toLowerCase` in 3.22). Don't change the test.

- [ ] **Step 5: Commit**

```bash
git add lib/newsletter/subscriber.ts netlify/functions/_shared/newsletter-crypto.mts tests/vitest/lib/newsletter/subscriber.test.ts tests/vitest/functions/newsletter/crypto.test.ts
git commit -m "feat(newsletter): subscriber rules and token hashing" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Resend client

A small REST client with only the calls the newsletter needs. It spaces requests at least 110 ms apart, which keeps one caller under Resend's 10 a second. On a `429` it waits for `retry-after` (at most 2 seconds) and tries once more. "Not found" comes back as `null` or `false`, not an exception, because the sync expects missing contacts. Base the not-found status on Task 1's results; Resend's docs say `404`.

**Files:**
- Create: `netlify/functions/_shared/resend.mts`
- Test: `tests/vitest/functions/newsletter/resend.test.ts`

**Interfaces:**
- **Consumes:** nothing from earlier tasks.
- **Produces:**
  - `class ResendError extends Error { status: number; type: string }`
  - `interface ResendContact { id: string; email: string; unsubscribed: boolean }`
  - `interface ContactPage { contacts: ResendContact[]; hasMore: boolean }`
  - `interface EmailInput { from: string; to: string[]; subject: string; html: string; text?: string; replyTo?: string }`
  - `interface ResendClient`, with these methods:
    - `getContact(idOrEmail): Promise<ResendContact | null>`
    - `createContact(email, segmentId): Promise<string>`: the new contact's id
    - `updateContact(idOrEmail, { unsubscribed }): Promise<boolean>`: false when not found
    - `deleteContact(idOrEmail): Promise<boolean>`: false when not found
    - `addToSegment(contactId, segmentId): Promise<void>`
    - `removeFromSegment(contactId, segmentId): Promise<void>`: a missing contact counts as done
    - `contactSegmentIds(contactId): Promise<string[]>`
    - `listSegmentContacts(segmentId, after?): Promise<ContactPage>`
    - `sendEmail(input): Promise<string>`: the email id
  - `contactKey(idOrEmail): string`
  - `createResendClient(options: { apiKey; fetch?; minIntervalMs?; sleep?; clock?; baseUrl? }): ResendClient`

- [ ] **Step 1: Write the failing tests**

Create `tests/vitest/functions/newsletter/resend.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { ResendError, contactKey, createResendClient } from '@/netlify/functions/_shared/resend.mts';

type Reply = { status: number; body?: unknown; headers?: Record<string, string> };

/** A fetch that answers with `replies` in order and records every request. */
function fakeFetch(replies: Reply[]) {
  const calls: Array<{ url: string; method: string; body: any; headers: Record<string, string> }> = [];
  const fn = async (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({
      url: String(url),
      method: init.method ?? 'GET',
      body: init.body ? JSON.parse(String(init.body)) : undefined,
      headers: init.headers as Record<string, string>,
    });
    const reply = replies.shift() ?? { status: 200, body: {} };
    return new Response(reply.body === undefined ? null : JSON.stringify(reply.body), {
      status: reply.status,
      headers: reply.headers,
    });
  };
  return { fn: fn as unknown as typeof fetch, calls };
}

function client(replies: Reply[], extra: { clock?: () => number; sleeps?: number[] } = {}) {
  const fake = fakeFetch(replies);
  const sleeps = extra.sleeps ?? [];
  const resend = createResendClient({
    apiKey: 're_test',
    fetch: fake.fn,
    minIntervalMs: extra.clock ? 110 : 0,
    clock: extra.clock,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });
  return { resend, calls: fake.calls, sleeps };
}

describe('contactKey', () => {
  it('encodes a plus sign but keeps the @, as in Resend\'s examples', () => {
    expect(contactKey('asha+news@example.com')).toBe('asha%2Bnews@example.com');
    expect(contactKey('e169aa45-1ecf-4183-9955-b1499d5701d3')).toBe('e169aa45-1ecf-4183-9955-b1499d5701d3');
  });
});

describe('createResendClient', () => {
  it('sends the API key', async () => {
    const { resend, calls } = client([{ status: 200, body: { id: 'c1', email: 'a@example.com', unsubscribed: false } }]);
    await resend.getContact('a@example.com');
    expect(calls[0].headers.Authorization).toBe('Bearer re_test');
  });

  it('getContact maps the contact, and returns null when Resend has no such contact', async () => {
    const { resend, calls } = client([
      { status: 200, body: { object: 'contact', id: 'c1', email: 'a@example.com', unsubscribed: true } },
      { status: 404, body: { statusCode: 404, name: 'not_found', message: 'Contact not found' } },
    ]);
    expect(await resend.getContact('a@example.com')).toEqual({ id: 'c1', email: 'a@example.com', unsubscribed: true });
    expect(await resend.getContact('b@example.com')).toBeNull();
    expect(calls[0].url).toBe('https://api.resend.com/contacts/a@example.com');
  });

  it('createContact puts the contact straight into the segment', async () => {
    const { resend, calls } = client([{ status: 201, body: { object: 'contact', id: 'c9' } }]);
    expect(await resend.createContact('a@example.com', 'seg-1')).toBe('c9');
    expect(calls[0]).toMatchObject({
      url: 'https://api.resend.com/contacts',
      method: 'POST',
      body: { email: 'a@example.com', unsubscribed: false, segments: [{ id: 'seg-1' }] },
    });
  });

  it('updateContact and deleteContact report a missing contact as false', async () => {
    const { resend, calls } = client([
      { status: 200, body: { id: 'c1' } },
      { status: 404, body: { name: 'not_found', message: 'nope' } },
      { status: 200, body: { deleted: true } },
      { status: 404, body: { name: 'not_found', message: 'nope' } },
    ]);
    expect(await resend.updateContact('c1', { unsubscribed: true })).toBe(true);
    expect(await resend.updateContact('x@example.com', { unsubscribed: true })).toBe(false);
    expect(await resend.deleteContact('c1')).toBe(true);
    expect(await resend.deleteContact('c1')).toBe(false);
    expect(calls[0]).toMatchObject({ method: 'PATCH', body: { unsubscribed: true } });
    expect(calls[2]).toMatchObject({ method: 'DELETE', url: 'https://api.resend.com/contacts/c1' });
  });

  it('adds to and removes from a segment by contact id', async () => {
    const { resend, calls } = client([
      { status: 200, body: { id: 'seg-1' } },
      { status: 404, body: { name: 'not_found', message: 'gone' } },
    ]);
    await resend.addToSegment('c1', 'seg-1');
    await resend.removeFromSegment('c1', 'seg-1'); // a 404 counts as already removed
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'POST https://api.resend.com/contacts/c1/segments/seg-1',
      'DELETE https://api.resend.com/contacts/c1/segments/seg-1',
    ]);
  });

  it('lists a segment a page at a time, lower-casing emails', async () => {
    const { resend, calls } = client([
      {
        status: 200,
        body: { object: 'list', has_more: true, data: [{ id: 'c1', email: 'Asha@Example.com', unsubscribed: false }] },
      },
    ]);
    const page = await resend.listSegmentContacts('seg-1', 'c0');
    expect(page).toEqual({ contacts: [{ id: 'c1', email: 'asha@example.com', unsubscribed: false }], hasMore: true });
    expect(calls[0].url).toBe('https://api.resend.com/contacts?segment_id=seg-1&limit=100&after=c0');
  });

  it('lists the segments a contact is in', async () => {
    const { resend } = client([{ status: 200, body: { data: [{ id: 'seg-1' }, { id: 'seg-2' }], has_more: false } }]);
    expect(await resend.contactSegmentIds('c1')).toEqual(['seg-1', 'seg-2']);
  });

  it('sendEmail maps replyTo to reply_to', async () => {
    const { resend, calls } = client([{ status: 200, body: { id: 'email-1' } }]);
    const id = await resend.sendEmail({
      from: 'Hope Trust <newsletter@hopetrustindia.com>',
      to: ['a@example.com'],
      subject: 'Hi',
      html: '<p>Hi</p>',
      text: 'Hi',
      replyTo: 'frontoffice@hopetrustindia.com',
    });
    expect(id).toBe('email-1');
    expect(calls[0].body).toEqual({
      from: 'Hope Trust <newsletter@hopetrustindia.com>',
      to: ['a@example.com'],
      subject: 'Hi',
      html: '<p>Hi</p>',
      text: 'Hi',
      reply_to: 'frontoffice@hopetrustindia.com',
    });
  });

  it('turns an error reply into a ResendError with its status, type and message', async () => {
    const { resend } = client([
      { status: 422, body: { statusCode: 422, name: 'validation_error', message: 'Invalid `email` field.' } },
    ]);
    const err = await resend.createContact('bad', 'seg-1').catch((e) => e);
    expect(err).toBeInstanceOf(ResendError);
    expect(err).toMatchObject({ status: 422, type: 'validation_error', message: 'Invalid `email` field.' });
  });

  it('waits for retry-after on a 429, at most 2 seconds, then tries once more', async () => {
    const { resend, sleeps, calls } = client([
      { status: 429, headers: { 'retry-after': '5' }, body: { name: 'rate_limit_exceeded', message: 'slow down' } },
      { status: 200, body: { id: 'c1', email: 'a@example.com', unsubscribed: false } },
    ]);
    expect(await resend.getContact('a@example.com')).not.toBeNull();
    expect(sleeps).toContain(2000);
    expect(calls).toHaveLength(2);
  });

  it('gives up after a second 429', async () => {
    const { resend } = client([
      { status: 429, headers: { 'retry-after': '1' }, body: { name: 'rate_limit_exceeded', message: 'slow down' } },
      { status: 429, headers: { 'retry-after': '1' }, body: { name: 'rate_limit_exceeded', message: 'slow down' } },
    ]);
    await expect(resend.getContact('a@example.com')).rejects.toMatchObject({ status: 429 });
  });

  it('spaces requests 110 ms apart', async () => {
    let now = 0;
    const sleeps: number[] = [];
    const fake = fakeFetch([]);
    const resend = createResendClient({
      apiKey: 're_test',
      fetch: fake.fn,
      clock: () => now,
      sleep: async (ms) => {
        sleeps.push(ms);
        now += ms;
      },
    });
    await resend.updateContact('c1', { unsubscribed: true });
    await resend.updateContact('c2', { unsubscribed: true });
    await resend.updateContact('c3', { unsubscribed: true });
    expect(sleeps).toEqual([110, 110]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/vitest/functions/newsletter/resend.test.ts`
Expected: FAIL. The module doesn't exist.

- [ ] **Step 3: Write the client**

Create `netlify/functions/_shared/resend.mts`:

```ts
// The Resend REST calls the newsletter needs (spec §5, §9.3): contacts, the
// "Newsletter" segment and single emails. Contacts are global per address and
// segments group them (Resend's model since November 2025).
// API: https://resend.com/docs/api-reference
//
// Requests are spaced at least `minIntervalMs` apart to stay under Resend's
// 10 a second. A 429 waits for retry-after (at most 2 s) and tries once more.

export class ResendError extends Error {
  readonly status: number;
  readonly type: string;

  constructor(status: number, type: string, message: string) {
    super(message);
    this.name = 'ResendError';
    this.status = status;
    this.type = type;
  }
}

export interface ResendContact {
  id: string;
  email: string;
  unsubscribed: boolean;
}

export interface ContactPage {
  contacts: ResendContact[];
  hasMore: boolean;
}

export interface EmailInput {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export interface ResendClient {
  getContact(idOrEmail: string): Promise<ResendContact | null>;
  createContact(email: string, segmentId: string): Promise<string>;
  updateContact(idOrEmail: string, patch: { unsubscribed: boolean }): Promise<boolean>;
  deleteContact(idOrEmail: string): Promise<boolean>;
  addToSegment(contactId: string, segmentId: string): Promise<void>;
  removeFromSegment(contactId: string, segmentId: string): Promise<void>;
  contactSegmentIds(contactId: string): Promise<string[]>;
  listSegmentContacts(segmentId: string, after?: string): Promise<ContactPage>;
  sendEmail(input: EmailInput): Promise<string>;
}

export interface ResendClientOptions {
  apiKey: string;
  fetch?: typeof fetch;
  /** Gap between request starts; 110 ms keeps one caller under 10 a second. */
  minIntervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
  clock?: () => number;
  baseUrl?: string;
}

const MAX_RETRY_WAIT_MS = 2000;
const NOT_FOUND = 404;

/** A contact id or email as a path segment. Resend's own examples keep a raw "@". */
export function contactKey(idOrEmail: string): string {
  return encodeURIComponent(idOrEmail).replace(/%40/g, '@');
}

function isNotFound(err: unknown): boolean {
  return err instanceof ResendError && err.status === NOT_FOUND;
}

type Json = Record<string, any>;

export function createResendClient(options: ResendClientOptions): ResendClient {
  const doFetch = options.fetch ?? fetch;
  const minInterval = options.minIntervalMs ?? 110;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const clock = options.clock ?? Date.now;
  const base = options.baseUrl ?? 'https://api.resend.com';
  let nextStart = 0;

  async function pace(): Promise<void> {
    const now = clock();
    const wait = nextStart - now;
    nextStart = Math.max(now, nextStart) + minInterval;
    if (wait > 0) await sleep(wait);
  }

  async function request(method: string, path: string, body?: unknown, retried = false): Promise<Json | null> {
    await pace();
    const res = await doFetch(`${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 429 && !retried) {
      const seconds = Number(res.headers.get('retry-after'));
      await sleep(Math.min(Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 1000, MAX_RETRY_WAIT_MS));
      return request(method, path, body, true);
    }
    const text = await res.text();
    let data: Json | null = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }
    }
    if (!res.ok) {
      throw new ResendError(
        res.status,
        typeof data?.name === 'string' ? data.name : 'http_error',
        typeof data?.message === 'string' ? data.message : `Resend returned ${res.status}`,
      );
    }
    return data;
  }

  const toContact = (c: Json): ResendContact => ({
    id: String(c.id),
    email: String(c.email).toLowerCase(),
    unsubscribed: Boolean(c.unsubscribed),
  });

  return {
    async getContact(idOrEmail) {
      try {
        return toContact((await request('GET', `/contacts/${contactKey(idOrEmail)}`)) ?? {});
      } catch (err) {
        if (isNotFound(err)) return null;
        throw err;
      }
    },

    async createContact(email, segmentId) {
      const created = await request('POST', '/contacts', { email, unsubscribed: false, segments: [{ id: segmentId }] });
      if (typeof created?.id !== 'string') throw new ResendError(502, 'bad_response', 'Resend did not return a contact id');
      return created.id;
    },

    async updateContact(idOrEmail, patch) {
      try {
        await request('PATCH', `/contacts/${contactKey(idOrEmail)}`, { unsubscribed: patch.unsubscribed });
        return true;
      } catch (err) {
        if (isNotFound(err)) return false;
        throw err;
      }
    },

    async deleteContact(idOrEmail) {
      try {
        await request('DELETE', `/contacts/${contactKey(idOrEmail)}`);
        return true;
      } catch (err) {
        if (isNotFound(err)) return false;
        throw err;
      }
    },

    async addToSegment(contactId, segmentId) {
      await request('POST', `/contacts/${contactKey(contactId)}/segments/${encodeURIComponent(segmentId)}`);
    },

    async removeFromSegment(contactId, segmentId) {
      try {
        await request('DELETE', `/contacts/${contactKey(contactId)}/segments/${encodeURIComponent(segmentId)}`);
      } catch (err) {
        if (!isNotFound(err)) throw err;
      }
    },

    async contactSegmentIds(contactId) {
      const page = await request('GET', `/contacts/${contactKey(contactId)}/segments?limit=100`);
      return Array.isArray(page?.data) ? page.data.map((s: Json) => String(s.id)) : [];
    },

    async listSegmentContacts(segmentId, after) {
      const query = new URLSearchParams({ segment_id: segmentId, limit: '100' });
      if (after) query.set('after', after);
      const page = await request('GET', `/contacts?${query}`);
      return {
        contacts: Array.isArray(page?.data) ? page.data.map(toContact) : [],
        hasMore: Boolean(page?.has_more),
      };
    },

    async sendEmail(input) {
      const sent = await request('POST', '/emails', {
        from: input.from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        ...(input.text ? { text: input.text } : {}),
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      });
      return String(sent?.id ?? '');
    },
  };
}
```

If Task 1 found that Resend reports a missing contact with a status other than 404, add that status to `isNotFound`, for example `[404, 422].includes(err.status)`. Add a matching reply to the "report a missing contact as false" test.

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run tests/vitest/functions/newsletter/resend.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_shared/resend.mts tests/vitest/functions/newsletter/resend.test.ts
git commit -m "feat(newsletter): paced Resend client for contacts and segments" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 5: Data access, service wiring and test fakes

The handlers in Tasks 6–9 never call Supabase or Resend directly. They get a `NewsletterDeps` object. This task defines that object and its real implementation. It also writes the in-memory versions that every later function test uses. The in-memory database follows the real one's rules: email addresses are unique, and a guarded update fails if the row changed since it was read.

**Files:**
- Create: `netlify/functions/_shared/newsletter-db.mts`
- Create: `netlify/functions/_shared/admin.mts`
- Create: `netlify/functions/_shared/newsletter-deps.mts`
- Create: `tests/vitest/functions/newsletter/fakes.ts`
- Test: `tests/vitest/functions/newsletter/wiring.test.ts`

**Interfaces:**
- **Consumes:**
  - `SubscriberRow`, `AdminSubscriber`, `SubscriberStatus` and `SubscriberSource` (Task 3);
  - `ResendClient`, `createResendClient`, `ResendError` and `EmailInput` (Task 4);
  - `newsletterImagesBase` (plan 1, `lib/newsletter/render.ts`).
- **Produces, from `newsletter-db.mts`:**
  - Types: `SubscriberFilters`, `SubscriberPatch`, `NewSubscriber`, `SyncRow`, `AuditEntry`.
  - The `NewsletterDb` interface. Its methods, all async:
    - `findByEmail`, `findById`, `findByTokenHash`;
    - `insert`, which throws `DuplicateEmailError` when the address is taken;
    - `update(id, patch, ifUpdatedAt?)`: the updated row, or `null`;
    - `countRecentFromIp`, `deleteStalePending`;
    - `list`, `listAll`, `counts`, `existingEmails`, `insertImported`;
    - `erasedHashes`, `unErase`, `erase`;
    - `syncRows`, `rowsToPush`, `countToPush`, `markPulledUnsubscribed`, `markNeedsPush`;
    - `audit`.
  - Also `DuplicateEmailError`, `createNewsletterDb(supabase)`, `searchPattern(q)`, `chunked(items, size)` and `ADMIN_COLUMNS`.
- **Produces, from `admin.mts`:** `AdminUser { email }` and `verifyAdminToken(req, secret?)`.
- **Produces, from `newsletter-deps.mts`:** `SITE_ORIGIN`, `REPLY_TO`, `NewsletterConfig`, `NewsletterDeps`, and `liveDeps(env?)`, which returns `null` when a variable is missing.
- **Produces, from `fakes.ts`:**
  - `createClock()`, `createMemoryDb(now)` and `createFakeResend()`;
  - `makeDeps(overrides?)`, which returns `{ deps, clock, memory, resend }`;
  - `jsonRequest(url, method, body?, headers?)`;
  - constants `SEGMENT`, `SITE`, `ADMIN_TOKEN`, `ADMIN_EMAIL`.

- [ ] **Step 1: Write the failing tests**

Create `tests/vitest/functions/newsletter/wiring.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { verifyAdminToken } from '@/netlify/functions/_shared/admin.mts';
import { DuplicateEmailError, chunked, searchPattern } from '@/netlify/functions/_shared/newsletter-db.mts';
import { liveDeps } from '@/netlify/functions/_shared/newsletter-deps.mts';
import { SEGMENT, makeDeps } from './fakes';

const SECRET = 'test-secret-that-is-long-enough!!';
const withAuth = (token: string) =>
  new Request('https://hopetrustindia.com/api/admin-newsletter-subscribers', { headers: { authorization: `Bearer ${token}` } });

describe('verifyAdminToken', () => {
  it('accepts a token from admin-login', () => {
    const token = jwt.sign({ sub: 'u1', email: 'admin@hopetrustindia.com', role: 'admin' }, SECRET, { expiresIn: '1h' });
    expect(verifyAdminToken(withAuth(token), SECRET)).toEqual({ email: 'admin@hopetrustindia.com' });
  });

  it('rejects expired, wrongly signed, non-admin and missing tokens', () => {
    const expired = jwt.sign({ email: 'a@x.com', role: 'admin' }, SECRET, { expiresIn: -10 });
    const forged = jwt.sign({ email: 'a@x.com', role: 'admin' }, 'another-secret');
    const notAdmin = jwt.sign({ email: 'a@x.com', role: 'viewer' }, SECRET);
    expect(verifyAdminToken(withAuth(expired), SECRET)).toBeNull();
    expect(verifyAdminToken(withAuth(forged), SECRET)).toBeNull();
    expect(verifyAdminToken(withAuth(notAdmin), SECRET)).toBeNull();
    expect(verifyAdminToken(new Request('https://hopetrustindia.com/'), SECRET)).toBeNull();
    expect(verifyAdminToken(withAuth('x'), undefined)).toBeNull();
  });
});

describe('searchPattern', () => {
  it('escapes LIKE wildcards and drops characters that break PostgREST filters', () => {
    expect(searchPattern('asha_rao')).toBe('%asha\\_rao%');
    expect(searchPattern('a,b(c)"d%e')).toBe('%abcde%');
    expect(searchPattern('  ')).toBeNull();
    expect(searchPattern(undefined)).toBeNull();
  });

  it('keeps Indian-language letters, @, dots and plus signs', () => {
    expect(searchPattern('आशा')).toBe('%आशा%');
    expect(searchPattern('a.b+x@y.com')).toBe('%a.b+x@y.com%');
  });
});

describe('chunked', () => {
  it('splits a list into groups', () => {
    expect(chunked([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunked([], 2)).toEqual([]);
  });
});

describe('liveDeps', () => {
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    RESEND_API_KEY: 're_test',
    RESEND_NEWSLETTER_SEGMENT_ID: 'seg-1',
    NEWSLETTER_FROM_EMAIL: 'Hope Trust <newsletter@hopetrustindia.com>',
  };

  it('returns null when a variable is missing', () => {
    expect(liveDeps({ ...env, RESEND_NEWSLETTER_SEGMENT_ID: undefined })).toBeNull();
  });

  it('builds the settings from the environment', () => {
    const deps = liveDeps(env);
    expect(deps?.config).toEqual({
      segmentId: 'seg-1',
      fromEmail: 'Hope Trust <newsletter@hopetrustindia.com>',
      replyTo: 'frontoffice@hopetrustindia.com',
      siteUrl: 'https://hopetrustindia.com',
      imagesBase: 'https://abc.supabase.co/storage/v1/object/public/newsletter-images',
    });
  });
});

// The fakes stand in for Supabase and Resend in every handler test, so they
// must keep the same rules.
describe('test fakes', () => {
  it('refuse a second row for the same address', async () => {
    const { deps } = makeDeps();
    await deps.db.insert({ email: 'a@example.com', status: 'pending', source: 'website' });
    await expect(deps.db.insert({ email: 'a@example.com', status: 'pending', source: 'website' })).rejects.toBeInstanceOf(
      DuplicateEmailError,
    );
  });

  it('skip a guarded update when the row changed since it was read', async () => {
    const { deps } = makeDeps();
    const row = await deps.db.insert({ email: 'a@example.com', status: 'pending', source: 'website' });
    await deps.db.update(row.id, { full_name: 'First' });
    expect(await deps.db.update(row.id, { full_name: 'Second' }, row.updated_at)).toBeNull();
    expect((await deps.db.findById(row.id))?.full_name).toBe('First');
  });

  it('put created contacts in the segment and page through it', async () => {
    const { deps, resend } = makeDeps();
    for (let i = 0; i < 150; i++) await deps.resend.createContact(`p${i}@example.com`, SEGMENT);
    const first = await deps.resend.listSegmentContacts(SEGMENT);
    const second = await deps.resend.listSegmentContacts(SEGMENT, first.contacts.at(-1)!.id);
    expect(first).toMatchObject({ hasMore: true });
    expect(first.contacts).toHaveLength(100);
    expect(second.contacts).toHaveLength(50);
    expect(second.hasMore).toBe(false);
    expect(resend.contacts.size).toBe(150);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/vitest/functions/newsletter/wiring.test.ts`
Expected: FAIL. The modules don't exist.

- [ ] **Step 3: Write the data access module**

Create `netlify/functions/_shared/newsletter-db.mts`:

```ts
// Data access for the newsletter tables (Database/newsletter.sql), through the
// service-role Supabase client. Handlers depend on the NewsletterDb interface
// only; tests use the in-memory version in tests/vitest/functions/newsletter/fakes.ts.

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AdminSubscriber,
  SubscriberRow,
  SubscriberSource,
  SubscriberStatus,
} from '../../../lib/newsletter/subscriber';

export interface SubscriberFilters {
  q?: string;
  status?: SubscriberStatus | '';
  source?: SubscriberSource | '';
}

/** Columns a handler may change. */
export type SubscriberPatch = Partial<Omit<SubscriberRow, 'id' | 'email' | 'created_at' | 'updated_at'>>;
export type NewSubscriber = Pick<SubscriberRow, 'email' | 'status' | 'source'> & SubscriberPatch;
export type SyncRow = Pick<
  SubscriberRow,
  'id' | 'email' | 'status' | 'source' | 'resend_contact_id' | 'resend_synced_at' | 'updated_at'
>;

export interface AuditEntry {
  action: string;
  actorEmail: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
}

export interface NewsletterDb {
  findByEmail(email: string): Promise<SubscriberRow | null>;
  findById(id: string): Promise<SubscriberRow | null>;
  findByTokenHash(hash: string): Promise<SubscriberRow | null>;
  /** Throws DuplicateEmailError when the address is already in the table. */
  insert(row: NewSubscriber): Promise<SubscriberRow>;
  /** The updated row, or null when no row matched: deleted, or changed since `ifUpdatedAt`. */
  update(id: string, patch: SubscriberPatch, ifUpdatedAt?: string): Promise<SubscriberRow | null>;
  /** Rows whose latest confirmation email went out to a request from this IP since `sinceIso`. */
  countRecentFromIp(ip: string, sinceIso: string): Promise<number>;
  /** Deletes pending rows whose last confirmation email (or creation) is older than `beforeIso`. */
  deleteStalePending(beforeIso: string): Promise<number>;
  list(filters: SubscriberFilters, limit: number, offset: number): Promise<{ rows: AdminSubscriber[]; total: number }>;
  listAll(filters: SubscriberFilters): Promise<AdminSubscriber[]>;
  counts(): Promise<Record<SubscriberStatus, number>>;
  existingEmails(emails: string[]): Promise<Set<string>>;
  /** Inserts rows, skipping any address already present; returns how many were added. */
  insertImported(rows: NewSubscriber[]): Promise<number>;
  erasedHashes(hashes: string[]): Promise<Set<string>>;
  unErase(hash: string): Promise<void>;
  /** Remembers the address hash, then deletes the row. */
  erase(id: string, hash: string): Promise<void>;
  /** Every row, with the columns the sync compares. */
  syncRows(): Promise<SyncRow[]>;
  /** Subscribed or unsubscribed rows with a change Resend hasn't seen, oldest change first. */
  rowsToPush(limit: number): Promise<SubscriberRow[]>;
  countToPush(): Promise<number>;
  /** Unsubscribes rows on Resend's word, skipping any row with a change waiting to go to Resend. */
  markPulledUnsubscribed(ids: string[], nowIso: string): Promise<number>;
  markNeedsPush(ids: string[]): Promise<void>;
  /** Writes admin_audit_log; never throws. */
  audit(entry: AuditEntry): Promise<void>;
}

export class DuplicateEmailError extends Error {
  constructor() {
    super('That address is already in newsletter_subscribers');
    this.name = 'DuplicateEmailError';
  }
}

const SUBSCRIBERS = 'newsletter_subscribers';
const ERASED = 'newsletter_erased';
/** Supabase's API returns at most 1,000 rows per request. */
const PAGE = 1000;
/** Values per `in (…)` filter, to keep request URLs short. */
const IN_CHUNK = 100;

/** Every column except the confirmation token's. */
export const ADMIN_COLUMNS = [
  'id', 'email', 'full_name', 'status', 'source', 'consent_at', 'consent_note', 'imported_by',
  'import_batch_id', 'signup_page', 'signup_ip', 'signup_user_agent', 'signup_notice',
  'confirm_sent_at', 'confirm_send_count', 'unsubscribed_at', 'unsubscribe_source',
  'resend_contact_id', 'resend_synced_at', 'created_at', 'updated_at',
].join(', ');
const SYNC_COLUMNS = 'id, email, status, source, resend_contact_id, resend_synced_at, updated_at';

export function chunked<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * An ILIKE pattern for the admin search box, or null when nothing searchable
 * is left. Characters that would break PostgREST's or=(…) syntax are dropped
 * and the LIKE wildcard "_" is escaped ("%" is dropped).
 */
export function searchPattern(q: string | undefined): string | null {
  const kept = (q ?? '').slice(0, 100).replace(/[^\p{L}\p{M}\p{N}@.+\-' _]/gu, '').trim();
  if (!kept) return null;
  return `%${kept.replace(/[_\\]/g, (c) => `\\${c}`)}%`;
}

function check(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export function createNewsletterDb(supabase: SupabaseClient): NewsletterDb {
  const table = () => supabase.from(SUBSCRIBERS);

  function filtered(query: any, filters: SubscriberFilters) {
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.source) query = query.eq('source', filters.source);
    const pattern = searchPattern(filters.q);
    if (pattern) query = query.or(`email.ilike.${pattern},full_name.ilike.${pattern}`);
    return query;
  }

  async function one(column: string, value: string): Promise<SubscriberRow | null> {
    const { data, error } = await table().select('*').eq(column, value).maybeSingle();
    check(error);
    return (data as SubscriberRow | null) ?? null;
  }

  async function headCount(narrow: (query: any) => any): Promise<number> {
    const { count, error } = await narrow(table().select('id', { count: 'exact', head: true }));
    check(error);
    return count ?? 0;
  }

  async function allPages<T>(page: (from: number, to: number) => any): Promise<T[]> {
    const out: T[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await page(from, from + PAGE - 1);
      check(error);
      out.push(...((data ?? []) as T[]));
      if (!data || data.length < PAGE) return out;
    }
  }

  return {
    findByEmail: (email) => one('email', email),
    findById: (id) => one('id', id),
    findByTokenHash: (hash) => one('confirm_token_hash', hash),

    async insert(row) {
      const { data, error } = await table().insert(row).select('*').single();
      if (error?.code === '23505') throw new DuplicateEmailError();
      check(error);
      return data as SubscriberRow;
    },

    async update(id, patch, ifUpdatedAt) {
      let query = table().update(patch).eq('id', id);
      if (ifUpdatedAt) query = query.eq('updated_at', ifUpdatedAt);
      const { data, error } = await query.select('*').maybeSingle();
      check(error);
      return (data as SubscriberRow | null) ?? null;
    },

    countRecentFromIp: (ip, sinceIso) =>
      headCount((query) => query.eq('signup_ip', ip).gte('confirm_sent_at', sinceIso)),

    async deleteStalePending(beforeIso) {
      const sent = await table().delete().eq('status', 'pending').lt('confirm_sent_at', beforeIso).select('id');
      check(sent.error);
      const neverSent = await table()
        .delete()
        .eq('status', 'pending')
        .is('confirm_sent_at', null)
        .lt('created_at', beforeIso)
        .select('id');
      check(neverSent.error);
      return (sent.data?.length ?? 0) + (neverSent.data?.length ?? 0);
    },

    async list(filters, limit, offset) {
      const { data, error, count } = await filtered(table().select(ADMIN_COLUMNS, { count: 'exact' }), filters)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
      check(error);
      return { rows: (data ?? []) as AdminSubscriber[], total: count ?? 0 };
    },

    listAll: (filters) =>
      allPages<AdminSubscriber>((from, to) =>
        filtered(table().select(ADMIN_COLUMNS), filters).order('created_at', { ascending: true }).range(from, to),
      ),

    async counts() {
      const [pending, subscribed, unsubscribed] = await Promise.all(
        (['pending', 'subscribed', 'unsubscribed'] as const).map((status) =>
          headCount((query) => query.eq('status', status)),
        ),
      );
      return { pending, subscribed, unsubscribed };
    },

    async existingEmails(emails) {
      const found = new Set<string>();
      for (const part of chunked(emails, IN_CHUNK)) {
        const { data, error } = await table().select('email').in('email', part);
        check(error);
        for (const row of data ?? []) found.add((row as { email: string }).email);
      }
      return found;
    },

    async insertImported(rows) {
      if (rows.length === 0) return 0;
      const { data, error } = await table()
        .upsert(rows, { onConflict: 'email', ignoreDuplicates: true })
        .select('id');
      check(error);
      return data?.length ?? 0;
    },

    async erasedHashes(hashes) {
      const found = new Set<string>();
      for (const part of chunked(hashes, IN_CHUNK)) {
        const { data, error } = await supabase.from(ERASED).select('email_sha256').in('email_sha256', part);
        check(error);
        for (const row of data ?? []) found.add((row as { email_sha256: string }).email_sha256);
      }
      return found;
    },

    async unErase(hash) {
      const { error } = await supabase.from(ERASED).delete().eq('email_sha256', hash);
      check(error);
    },

    async erase(id, hash) {
      const remembered = await supabase
        .from(ERASED)
        .upsert({ email_sha256: hash }, { onConflict: 'email_sha256', ignoreDuplicates: true });
      check(remembered.error);
      const removed = await table().delete().eq('id', id);
      check(removed.error);
    },

    syncRows: () => allPages<SyncRow>((from, to) => table().select(SYNC_COLUMNS).order('id').range(from, to)),

    async rowsToPush(limit) {
      const { data, error } = await table()
        .select('*')
        .in('status', ['subscribed', 'unsubscribed'])
        .is('resend_synced_at', null)
        .order('updated_at', { ascending: true })
        .limit(limit);
      check(error);
      return (data ?? []) as SubscriberRow[];
    },

    countToPush: () =>
      headCount((query) => query.in('status', ['subscribed', 'unsubscribed']).is('resend_synced_at', null)),

    async markPulledUnsubscribed(ids, nowIso) {
      let changed = 0;
      for (const part of chunked(ids, IN_CHUNK)) {
        const { data, error } = await table()
          .update({ status: 'unsubscribed', unsubscribed_at: nowIso, unsubscribe_source: 'resend', resend_synced_at: nowIso })
          .in('id', part)
          .eq('status', 'subscribed')
          .not('resend_synced_at', 'is', null)
          .select('id');
        check(error);
        changed += data?.length ?? 0;
      }
      return changed;
    },

    async markNeedsPush(ids) {
      for (const part of chunked(ids, IN_CHUNK)) {
        const { error } = await table().update({ resend_synced_at: null }).in('id', part);
        check(error);
      }
    },

    async audit(entry) {
      try {
        const { error } = await supabase.from('admin_audit_log').insert({
          action: entry.action,
          actor_email: entry.actorEmail,
          resource_type: 'newsletter_subscriber',
          resource_id: entry.resourceId ?? null,
          metadata: entry.metadata ?? {},
          ip_address: entry.ip ?? null,
        });
        if (error) console.error('[newsletter audit]', error.message);
      } catch (err) {
        console.error('[newsletter audit]', err);
      }
    },
  };
}
```

- [ ] **Step 4: Write the admin check and the wiring**

Create `netlify/functions/_shared/admin.mts`:

```ts
// Admin sign-in check for the newsletter functions: the JWT that admin-login
// issues (24-hour expiry), as the other admin functions check it.

import jwt from 'jsonwebtoken';

export interface AdminUser {
  email: string;
}

export function verifyAdminToken(req: Request, secret = process.env.ADMIN_JWT_SECRET): AdminUser | null {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token || !secret) return null;
  try {
    const payload = jwt.verify(token, secret) as { email?: unknown; role?: unknown };
    return payload.role === 'admin' && typeof payload.email === 'string' ? { email: payload.email } : null;
  } catch {
    return null;
  }
}
```

Create `netlify/functions/_shared/newsletter-deps.mts`:

```ts
// Everything the newsletter handlers need from outside, in one object.
// Production builds it from environment variables with liveDeps(); tests
// pass in-memory versions (tests/vitest/functions/newsletter/fakes.ts).

import { createClient } from '@supabase/supabase-js';
import { newsletterImagesBase } from '../../../lib/newsletter/render';
import { verifyAdminToken, type AdminUser } from './admin.mts';
import { createNewsletterDb, type NewsletterDb } from './newsletter-db.mts';
import { createResendClient, type ResendClient } from './resend.mts';

/** The main site. Netlify sets URL for functions at runtime. */
export const SITE_ORIGIN = (process.env.URL || 'https://hopetrustindia.com').replace(/\/+$/, '');
export const REPLY_TO = 'frontoffice@hopetrustindia.com';

export interface NewsletterConfig {
  /** Resend segment the newsletter goes to (spec §4: "Newsletter"). */
  segmentId: string;
  /** "Hope Trust <newsletter@hopetrustindia.com>" */
  fromEmail: string;
  replyTo: string;
  /** Main site origin, without a trailing slash. */
  siteUrl: string;
  /** Public URL of the newsletter-images bucket. */
  imagesBase: string;
}

export interface NewsletterDeps {
  db: NewsletterDb;
  resend: ResendClient;
  config: NewsletterConfig;
  now: () => Date;
  verifyAdmin: (req: Request) => AdminUser | null;
}

const REQUIRED = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'RESEND_API_KEY',
  'RESEND_NEWSLETTER_SEGMENT_ID',
  'NEWSLETTER_FROM_EMAIL',
] as const;

/** The real services, or null (after logging which variables are missing). */
export function liveDeps(env: Record<string, string | undefined> = process.env): NewsletterDeps | null {
  const missing = REQUIRED.filter((name) => !env[name]);
  if (missing.length > 0) {
    console.error(`[newsletter] missing environment variables: ${missing.join(', ')}`);
    return null;
  }
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL as string;
  return {
    db: createNewsletterDb(
      createClient(supabaseUrl, env.SUPABASE_SERVICE_ROLE_KEY as string, { auth: { persistSession: false } }),
    ),
    resend: createResendClient({ apiKey: env.RESEND_API_KEY as string }),
    config: {
      segmentId: env.RESEND_NEWSLETTER_SEGMENT_ID as string,
      fromEmail: env.NEWSLETTER_FROM_EMAIL as string,
      replyTo: REPLY_TO,
      siteUrl: SITE_ORIGIN,
      imagesBase: newsletterImagesBase(supabaseUrl),
    },
    now: () => new Date(),
    verifyAdmin: (req) => verifyAdminToken(req, env.ADMIN_JWT_SECRET),
  };
}
```

- [ ] **Step 5: Write the test fakes**

Create `tests/vitest/functions/newsletter/fakes.ts`:

```ts
// In-memory stand-ins for the newsletter functions' services. They follow the
// real ones' rules (unique emails, guarded updates, Resend's global contacts
// in segments), so handler tests exercise real behaviour without Supabase or
// Resend. Not a test file: vitest only runs *.test.ts.

import type { AdminSubscriber, SubscriberRow, SubscriberStatus } from '@/lib/newsletter/subscriber';
import {
  DuplicateEmailError,
  type AuditEntry,
  type NewSubscriber,
  type NewsletterDb,
  type SubscriberFilters,
} from '@/netlify/functions/_shared/newsletter-db.mts';
import type { NewsletterDeps } from '@/netlify/functions/_shared/newsletter-deps.mts';
import { ResendError, type EmailInput, type ResendClient } from '@/netlify/functions/_shared/resend.mts';

export const SEGMENT = 'segment-newsletter';
export const SITE = 'https://hopetrustindia.com';
export const ADMIN_TOKEN = 'admin-token';
export const ADMIN_EMAIL = 'admin@hopetrustindia.com';
const START = Date.parse('2026-10-14T10:00:00.000Z');

export function createClock(start = START) {
  let ms = start;
  return {
    now: () => new Date(ms),
    advance(by: number) {
      ms += by;
    },
  };
}

const EMPTY: Omit<SubscriberRow, 'id' | 'email' | 'status' | 'source' | 'created_at' | 'updated_at'> = {
  full_name: null,
  consent_at: null,
  consent_note: null,
  imported_by: null,
  import_batch_id: null,
  signup_page: null,
  signup_ip: null,
  signup_user_agent: null,
  signup_notice: null,
  confirm_token_hash: null,
  confirm_token_expires_at: null,
  confirm_sent_at: null,
  confirm_send_count: 0,
  unsubscribed_at: null,
  unsubscribe_source: null,
  resend_contact_id: null,
  resend_synced_at: null,
};

const waiting = (r: SubscriberRow) =>
  (r.status === 'subscribed' || r.status === 'unsubscribed') && r.resend_synced_at === null;

function stripToken(row: SubscriberRow): AdminSubscriber {
  const { confirm_token_hash: _hash, confirm_token_expires_at: _expires, ...rest } = row;
  return rest;
}

export function createMemoryDb(now: () => Date) {
  const rows = new Map<string, SubscriberRow>();
  const erased = new Set<string>();
  const audits: AuditEntry[] = [];
  let lastStamp = 0;
  let ids = 0;

  /** A timestamp that is never repeated, so guarded updates can tell versions apart. */
  const stamp = () => {
    lastStamp = Math.max(now().getTime(), lastStamp + 1);
    return new Date(lastStamp).toISOString();
  };
  const nextId = () => `00000000-0000-4000-8000-${String(++ids).padStart(12, '0')}`;
  const all = () => [...rows.values()];
  const matches = (r: SubscriberRow, f: SubscriberFilters) =>
    (!f.status || r.status === f.status) &&
    (!f.source || r.source === f.source) &&
    (!f.q || `${r.email} ${r.full_name ?? ''}`.toLowerCase().includes(f.q.trim().toLowerCase()));

  function insertRow(row: NewSubscriber): SubscriberRow {
    if (all().some((r) => r.email === row.email)) throw new DuplicateEmailError();
    const created = stamp();
    const full: SubscriberRow = { ...EMPTY, ...row, id: nextId(), created_at: created, updated_at: created };
    rows.set(full.id, full);
    return { ...full };
  }

  const db: NewsletterDb = {
    async findByEmail(email) {
      const r = all().find((x) => x.email === email);
      return r ? { ...r } : null;
    },
    async findById(id) {
      const r = rows.get(id);
      return r ? { ...r } : null;
    },
    async findByTokenHash(hash) {
      const r = all().find((x) => x.confirm_token_hash === hash);
      return r ? { ...r } : null;
    },
    async insert(row) {
      return insertRow(row);
    },
    async update(id, patch, ifUpdatedAt) {
      const r = rows.get(id);
      if (!r || (ifUpdatedAt && r.updated_at !== ifUpdatedAt)) return null;
      const next = { ...r, ...patch, updated_at: stamp() };
      rows.set(id, next);
      return { ...next };
    },
    async countRecentFromIp(ip, sinceIso) {
      return all().filter((r) => r.signup_ip === ip && r.confirm_sent_at !== null && r.confirm_sent_at >= sinceIso).length;
    },
    async deleteStalePending(beforeIso) {
      let deleted = 0;
      for (const r of all()) {
        if (r.status === 'pending' && (r.confirm_sent_at ?? r.created_at) < beforeIso) {
          rows.delete(r.id);
          deleted++;
        }
      }
      return deleted;
    },
    async list(filters, limit, offset) {
      const found = all()
        .filter((r) => matches(r, filters))
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      return { rows: found.slice(offset, offset + limit).map(stripToken), total: found.length };
    },
    async listAll(filters) {
      return all()
        .filter((r) => matches(r, filters))
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map(stripToken);
    },
    async counts() {
      const counts: Record<SubscriberStatus, number> = { pending: 0, subscribed: 0, unsubscribed: 0 };
      for (const r of all()) counts[r.status]++;
      return counts;
    },
    async existingEmails(emails) {
      const have = new Set(all().map((r) => r.email));
      return new Set(emails.filter((e) => have.has(e)));
    },
    async insertImported(newRows) {
      let added = 0;
      for (const row of newRows) {
        try {
          insertRow(row);
          added++;
        } catch (err) {
          if (!(err instanceof DuplicateEmailError)) throw err;
        }
      }
      return added;
    },
    async erasedHashes(hashes) {
      return new Set(hashes.filter((h) => erased.has(h)));
    },
    async unErase(hash) {
      erased.delete(hash);
    },
    async erase(id, hash) {
      erased.add(hash);
      rows.delete(id);
    },
    async syncRows() {
      return all().map(({ id, email, status, source, resend_contact_id, resend_synced_at, updated_at }) => ({
        id,
        email,
        status,
        source,
        resend_contact_id,
        resend_synced_at,
        updated_at,
      }));
    },
    async rowsToPush(limit) {
      return all()
        .filter(waiting)
        .sort((a, b) => a.updated_at.localeCompare(b.updated_at))
        .slice(0, limit)
        .map((r) => ({ ...r }));
    },
    async countToPush() {
      return all().filter(waiting).length;
    },
    async markPulledUnsubscribed(ids, nowIso) {
      let changed = 0;
      for (const id of ids) {
        const r = rows.get(id);
        if (r && r.status === 'subscribed' && r.resend_synced_at !== null) {
          rows.set(id, {
            ...r,
            status: 'unsubscribed',
            unsubscribed_at: nowIso,
            unsubscribe_source: 'resend',
            resend_synced_at: nowIso,
            updated_at: stamp(),
          });
          changed++;
        }
      }
      return changed;
    },
    async markNeedsPush(ids) {
      for (const id of ids) {
        const r = rows.get(id);
        if (r) rows.set(id, { ...r, resend_synced_at: null, updated_at: stamp() });
      }
    },
    async audit(entry) {
      audits.push(entry);
    },
  };

  return {
    db,
    rows,
    erased,
    audits,
    /** Puts a row straight into the table, defaults filled in, for arranging a test. */
    seed(row: Partial<SubscriberRow> & { email: string }): SubscriberRow {
      const created = stamp();
      const full: SubscriberRow = {
        ...EMPTY,
        status: 'subscribed',
        source: 'website',
        id: nextId(),
        created_at: created,
        updated_at: created,
        ...row,
      };
      rows.set(full.id, full);
      return { ...full };
    },
    get(id: string): SubscriberRow | undefined {
      const r = rows.get(id);
      return r ? { ...r } : undefined;
    },
    byEmail(email: string): SubscriberRow | undefined {
      const r = all().find((x) => x.email === email);
      return r ? { ...r } : undefined;
    },
  };
}

export interface FakeContact {
  id: string;
  email: string;
  unsubscribed: boolean;
  segments: Set<string>;
}

export function createFakeResend() {
  const contacts = new Map<string, FakeContact>();
  const sent: EmailInput[] = [];
  const calls: string[] = [];
  const failures: Array<{ method: string; error: Error }> = [];
  let ids = 0;

  const find = (key: string) =>
    contacts.get(key) ?? [...contacts.values()].find((c) => c.email === key.toLowerCase());
  /** Records a call, and throws if a test queued a failure for this method. */
  function step(method: string) {
    calls.push(method);
    const queued = failures.findIndex((f) => f.method === method);
    if (queued >= 0) throw failures.splice(queued, 1)[0].error;
  }
  function add(email: string, opts: { unsubscribed?: boolean; segments?: string[] } = {}): FakeContact {
    const contact = {
      id: `contact-${++ids}`,
      email: email.toLowerCase(),
      unsubscribed: opts.unsubscribed ?? false,
      segments: new Set(opts.segments ?? []),
    };
    contacts.set(contact.id, contact);
    return contact;
  }

  const client: ResendClient = {
    async getContact(key) {
      step('getContact');
      const c = find(key);
      return c ? { id: c.id, email: c.email, unsubscribed: c.unsubscribed } : null;
    },
    async createContact(email, segmentId) {
      step('createContact');
      if (find(email)) throw new ResendError(409, 'validation_error', 'Contact already exists');
      return add(email, { segments: [segmentId] }).id;
    },
    async updateContact(key, patch) {
      step('updateContact');
      const c = find(key);
      if (!c) return false;
      c.unsubscribed = patch.unsubscribed;
      return true;
    },
    async deleteContact(key) {
      step('deleteContact');
      const c = find(key);
      if (!c) return false;
      contacts.delete(c.id);
      return true;
    },
    async addToSegment(contactId, segmentId) {
      step('addToSegment');
      const c = find(contactId);
      if (!c) throw new ResendError(404, 'not_found', 'Contact not found');
      c.segments.add(segmentId);
    },
    async removeFromSegment(contactId, segmentId) {
      step('removeFromSegment');
      find(contactId)?.segments.delete(segmentId);
    },
    async contactSegmentIds(contactId) {
      step('contactSegmentIds');
      return [...(find(contactId)?.segments ?? [])];
    },
    async listSegmentContacts(segmentId, after) {
      step('listSegmentContacts');
      const members = [...contacts.values()].filter((c) => c.segments.has(segmentId));
      const start = after ? members.findIndex((c) => c.id === after) + 1 : 0;
      return {
        contacts: members.slice(start, start + 100).map((c) => ({ id: c.id, email: c.email, unsubscribed: c.unsubscribed })),
        hasMore: start + 100 < members.length,
      };
    },
    async sendEmail(input) {
      step('sendEmail');
      sent.push(input);
      return `email-${sent.length}`;
    },
  };

  return {
    client,
    contacts,
    sent,
    calls,
    add,
    find,
    /** Makes the next call to `method` throw `error`. */
    failNext(method: keyof ResendClient, error: Error = new ResendError(500, 'application_error', 'Resend is down')) {
      failures.push({ method, error });
    },
  };
}

export function makeDeps(overrides: Partial<NewsletterDeps> = {}) {
  const clock = createClock();
  const memory = createMemoryDb(clock.now);
  const resend = createFakeResend();
  const deps: NewsletterDeps = {
    db: memory.db,
    resend: resend.client,
    config: {
      segmentId: SEGMENT,
      fromEmail: 'Hope Trust <newsletter@hopetrustindia.com>',
      replyTo: 'frontoffice@hopetrustindia.com',
      siteUrl: SITE,
      imagesBase: 'https://abc.supabase.co/storage/v1/object/public/newsletter-images',
    },
    now: clock.now,
    verifyAdmin: (req) => (req.headers.get('authorization') === `Bearer ${ADMIN_TOKEN}` ? { email: ADMIN_EMAIL } : null),
    ...overrides,
  };
  return { deps, clock, memory, resend };
}

export function jsonRequest(url: string, method: string, body?: unknown, headers: Record<string, string> = {}): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `npx vitest run tests/vitest/functions/newsletter/wiring.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add netlify/functions/_shared/newsletter-db.mts netlify/functions/_shared/admin.mts netlify/functions/_shared/newsletter-deps.mts tests/vitest/functions/newsletter/fakes.ts tests/vitest/functions/newsletter/wiring.test.ts
git commit -m "feat(newsletter): data access, service wiring and test fakes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 6: Sync with Resend

The sync has three entry points:

- `pushAndRecord` sends one row. The confirm function (Task 8) and admin Unsubscribe (Task 9) call it straight away, and plan 3's send uses it too.
- `runSync` does the full pull, then the push.
- `planPull` is the pure decision step inside the pull.

Supabase is the record of consent: the segment should hold exactly the subscribed rows. The only change that flows the other way is an unsubscribe on Resend's page.

**Files:**
- Create: `netlify/functions/_shared/newsletter-sync.mts`
- Test: `tests/vitest/functions/newsletter/sync.test.ts`

**Interfaces:**
- **Consumes:**
  - `NewsletterDeps` (Task 5);
  - `NewsletterDb` methods: `syncRows`, `markPulledUnsubscribed`, `markNeedsPush`, `rowsToPush`, `countToPush`, `update` (Task 5);
  - `ResendClient`, `ResendContact`, `ResendError` (Task 4);
  - `SubscriberRow` (Task 3).
- **Produces:**
  - `interface PullPlan { markUnsubscribed: string[]; repush: string[]; removeFromSegment: string[] }`
  - `planPull(contacts: ResendContact[], rows: SyncRow[]): PullPlan`
  - `type PushResult = { kind: 'synced'; contactId: string | null } | { kind: 'kept-unsubscribed'; contactId: string }`
  - `pushOne(deps, row): Promise<PushResult>`
  - `pushAndRecord(deps, row): Promise<boolean>`: false when the row changed while it was being pushed
  - `interface SyncReport { unsubscribedInResend; removedFromSegment; pushed; failed; remaining; errors: string[] }`
  - `runSync(deps, { pull: boolean; deadline: number }): Promise<SyncReport>`
  - `SYNC_TIME_BUDGET_MS = 7000`

- [ ] **Step 1: Write the failing tests**

Create `tests/vitest/functions/newsletter/sync.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { ResendError, type ResendClient } from '@/netlify/functions/_shared/resend.mts';
import { planPull, pushAndRecord, runSync } from '@/netlify/functions/_shared/newsletter-sync.mts';
import { SEGMENT, makeDeps } from './fakes';

const SYNCED = '2026-10-01T00:00:00.000Z';
const deadline = (deps: { now: () => Date }) => deps.now().getTime() + 7000;

function row(id: string, email: string, status: 'pending' | 'subscribed' | 'unsubscribed', synced: string | null) {
  return { id, email, status, source: 'website' as const, resend_contact_id: null, resend_synced_at: synced, updated_at: SYNCED };
}

describe('planPull', () => {
  it('marks rows unsubscribed on Resend\'s page, when nothing here is waiting to go to Resend', () => {
    const plan = planPull([{ id: 'c1', email: 'a@example.com', unsubscribed: true }], [row('r1', 'a@example.com', 'subscribed', SYNCED)]);
    expect(plan).toEqual({ markUnsubscribed: ['r1'], repush: [], removeFromSegment: [] });
  });

  it('leaves rows with a waiting change for the push: that change is newer consent', () => {
    const plan = planPull([{ id: 'c1', email: 'a@example.com', unsubscribed: true }], [row('r1', 'a@example.com', 'subscribed', null)]);
    expect(plan.markUnsubscribed).toEqual([]);
  });

  it('repushes our unsubscribe when the contact is subscribed in Resend again', () => {
    const plan = planPull([{ id: 'c1', email: 'a@example.com', unsubscribed: false }], [row('r1', 'a@example.com', 'unsubscribed', SYNCED)]);
    expect(plan.repush).toEqual(['r1']);
  });

  it('takes contacts with no consent on record out of the segment', () => {
    const plan = planPull(
      [
        { id: 'c1', email: 'stranger@example.com', unsubscribed: false },
        { id: 'c2', email: 'pending@example.com', unsubscribed: false },
      ],
      [row('r2', 'pending@example.com', 'pending', null)],
    );
    expect(plan.removeFromSegment).toEqual(['c1', 'c2']);
  });

  it('leaves subscribed rows alone and matches addresses whatever their case', () => {
    const plan = planPull([{ id: 'c1', email: 'Asha@Example.com', unsubscribed: false }], [row('r1', 'asha@example.com', 'subscribed', SYNCED)]);
    expect(plan).toEqual({ markUnsubscribed: [], repush: [], removeFromSegment: [] });
  });
});

describe('runSync: push', () => {
  it('creates a contact in the segment for a new subscriber and remembers its id', async () => {
    const { deps, memory, resend } = makeDeps();
    const r = memory.seed({ email: 'a@example.com' });
    const report = await runSync(deps, { pull: false, deadline: deadline(deps) });
    const contact = resend.find('a@example.com')!;
    expect(contact.segments.has(SEGMENT)).toBe(true);
    expect(memory.get(r.id)).toMatchObject({ resend_contact_id: contact.id, resend_synced_at: deps.now().toISOString() });
    expect(report).toMatchObject({ pushed: 1, failed: 0, remaining: 0 });
  });

  it('sends an unsubscribe', async () => {
    const { deps, memory, resend } = makeDeps();
    const contact = resend.add('a@example.com', { segments: [SEGMENT] });
    const r = memory.seed({ email: 'a@example.com', status: 'unsubscribed', resend_contact_id: contact.id });
    await runSync(deps, { pull: false, deadline: deadline(deps) });
    expect(contact.unsubscribed).toBe(true);
    expect(memory.get(r.id)?.resend_synced_at).not.toBeNull();
  });

  it('counts an unsubscribe as sent when Resend never had the contact', async () => {
    const { deps, memory } = makeDeps();
    const r = memory.seed({ email: 'a@example.com', status: 'unsubscribed' });
    await runSync(deps, { pull: false, deadline: deadline(deps) });
    expect(memory.get(r.id)).toMatchObject({ resend_contact_id: null });
    expect(memory.get(r.id)?.resend_synced_at).not.toBeNull();
  });

  it('adds an existing contact to the segment instead of creating a second one', async () => {
    const { deps, memory, resend } = makeDeps();
    const contact = resend.add('a@example.com');
    memory.seed({ email: 'a@example.com' });
    await runSync(deps, { pull: false, deadline: deadline(deps) });
    expect(resend.contacts.size).toBe(1);
    expect(contact.segments.has(SEGMENT)).toBe(true);
  });

  it('keeps an imported address unsubscribed when it already unsubscribed in Resend', async () => {
    const { deps, memory, resend } = makeDeps();
    const contact = resend.add('a@example.com', { unsubscribed: true });
    const r = memory.seed({ email: 'a@example.com', source: 'import' });
    await runSync(deps, { pull: false, deadline: deadline(deps) });
    expect(contact.unsubscribed).toBe(true);
    expect(memory.get(r.id)).toMatchObject({
      status: 'unsubscribed',
      unsubscribe_source: 'resend',
      source: 'import',
      resend_contact_id: contact.id,
    });
  });

  it('re-subscribes a website row whose contact is unsubscribed: a confirmation is fresh consent', async () => {
    const { deps, memory, resend } = makeDeps();
    const contact = resend.add('a@example.com', { unsubscribed: true, segments: [SEGMENT] });
    memory.seed({ email: 'a@example.com', source: 'website' });
    await runSync(deps, { pull: false, deadline: deadline(deps) });
    expect(contact.unsubscribed).toBe(false);
  });

  it('recreates a contact that was deleted in Resend', async () => {
    const { deps, memory, resend } = makeDeps();
    const r = memory.seed({ email: 'a@example.com', resend_contact_id: 'contact-deleted' });
    await runSync(deps, { pull: false, deadline: deadline(deps) });
    const contact = resend.find('a@example.com')!;
    expect(contact.segments.has(SEGMENT)).toBe(true);
    expect(memory.get(r.id)?.resend_contact_id).toBe(contact.id);
  });

  it('treats "already in the segment" as done', async () => {
    const { deps, memory, resend } = makeDeps();
    const contact = resend.add('a@example.com', { segments: [SEGMENT] });
    const r = memory.seed({ email: 'a@example.com', resend_contact_id: contact.id });
    resend.failNext('addToSegment', new ResendError(422, 'validation_error', 'Contact is already in this segment'));
    const report = await runSync(deps, { pull: false, deadline: deadline(deps) });
    expect(report.failed).toBe(0);
    expect(memory.get(r.id)?.resend_synced_at).not.toBeNull();
  });

  it('one failing row doesn\'t stop the others, and stays queued', async () => {
    const { deps, memory, resend } = makeDeps();
    const bad = memory.seed({ email: 'bad@example.com', updated_at: '2026-10-14T09:00:00.000Z' });
    memory.seed({ email: 'good@example.com', updated_at: '2026-10-14T09:30:00.000Z' });
    resend.failNext('getContact');
    const report = await runSync(deps, { pull: false, deadline: deadline(deps) });
    expect(report).toMatchObject({ pushed: 1, failed: 1, remaining: 1 });
    expect(report.errors[0]).toContain('bad@example.com');
    expect(memory.get(bad.id)?.resend_synced_at).toBeNull();
    expect(resend.find('good@example.com')).toBeDefined();
  });

  it('stops starting rows when the time budget runs out', async () => {
    const { deps, memory, clock } = makeDeps();
    // Every Resend call takes a second of the clock.
    const slow = new Proxy(deps.resend, {
      get(target, prop) {
        const value = (target as unknown as Record<string, unknown>)[prop as string];
        return typeof value === 'function'
          ? async (...args: unknown[]) => {
              clock.advance(1000);
              return (value as (...a: unknown[]) => unknown).apply(target, args);
            }
          : value;
      },
    }) as ResendClient;
    for (let i = 0; i < 5; i++) memory.seed({ email: `p${i}@example.com` });
    const report = await runSync({ ...deps, resend: slow }, { pull: false, deadline: deps.now().getTime() + 3000 });
    expect(report.pushed).toBe(2); // each new contact is a lookup and a create: 2 s
    expect(report.remaining).toBe(3);
  });

  it('does not mark a row synced if it changed while being pushed', async () => {
    const { deps, memory, resend } = makeDeps();
    const r = memory.seed({ email: 'a@example.com' });
    // An admin unsubscribes the person while their contact is being created.
    const racing: ResendClient = {
      ...deps.resend,
      async createContact(email, segmentId) {
        await deps.db.update(r.id, { status: 'unsubscribed', unsubscribe_source: 'admin', resend_synced_at: null });
        return deps.resend.createContact(email, segmentId);
      },
    };
    expect(await pushAndRecord({ ...deps, resend: racing }, memory.get(r.id)!)).toBe(false);
    expect(memory.get(r.id)).toMatchObject({ status: 'unsubscribed', resend_synced_at: null });
    await runSync(deps, { pull: false, deadline: deadline(deps) });
    expect(resend.find('a@example.com')?.unsubscribed).toBe(true);
  });
});

describe('runSync: pull', () => {
  it('copies unsubscribes from every page of a large segment', async () => {
    const { deps, memory, resend } = makeDeps();
    for (let i = 0; i < 150; i++) {
      const contact = resend.add(`p${i}@example.com`, { unsubscribed: true, segments: [SEGMENT] });
      memory.seed({ email: `p${i}@example.com`, resend_contact_id: contact.id, resend_synced_at: SYNCED });
    }
    const report = await runSync(deps, { pull: true, deadline: deadline(deps) });
    expect(report.unsubscribedInResend).toBe(150);
    expect((await deps.db.counts()).unsubscribed).toBe(150);
    expect(memory.byEmail('p149@example.com')).toMatchObject({ unsubscribe_source: 'resend' });
  });

  it('takes a stray contact out of the segment and puts our unsubscribe back', async () => {
    const { deps, memory, resend } = makeDeps();
    const stray = resend.add('stray@example.com', { segments: [SEGMENT] });
    const resubscribed = resend.add('left@example.com', { segments: [SEGMENT] });
    memory.seed({ email: 'left@example.com', status: 'unsubscribed', resend_contact_id: resubscribed.id, resend_synced_at: SYNCED });
    const report = await runSync(deps, { pull: true, deadline: deadline(deps) });
    expect(stray.segments.has(SEGMENT)).toBe(false);
    expect(resubscribed.unsubscribed).toBe(true);
    expect(report.removedFromSegment).toBe(1);
  });

  it('skips reading Resend when pull is false', async () => {
    const { deps, resend } = makeDeps();
    await runSync(deps, { pull: false, deadline: deadline(deps) });
    expect(resend.calls).not.toContain('listSegmentContacts');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/vitest/functions/newsletter/sync.test.ts`
Expected: FAIL. The module doesn't exist.

- [ ] **Step 3: Write the sync**

Create `netlify/functions/_shared/newsletter-sync.mts`:

```ts
// Keeps Resend's "Newsletter" segment in step with newsletter_subscribers
// (spec §9.3). Supabase is the record of consent, so the segment should hold
// exactly the subscribed rows. The one change that flows the other way is an
// unsubscribe made on Resend's own page.
//
// Pull reads every contact in the segment, then:
//   - rows unsubscribed on Resend's page become unsubscribed here, unless the
//     row has a change waiting to go to Resend (that change is newer consent);
//   - contacts subscribed in Resend but unsubscribed here get our unsubscribe again;
//   - contacts with no consent on record (no row, or still pending) leave the segment.
// Push sends rows whose resend_synced_at is null, oldest change first, until
// the time budget runs out, and marks each one synced only if it hasn't
// changed since it was read.

import type { SubscriberRow } from '../../../lib/newsletter/subscriber';
import type { SyncRow } from './newsletter-db.mts';
import type { NewsletterDeps } from './newsletter-deps.mts';
import { ResendError, type ResendClient, type ResendContact } from './resend.mts';

export interface PullPlan {
  /** Row ids unsubscribed on Resend's page. */
  markUnsubscribed: string[];
  /** Row ids unsubscribed here whose contact is subscribed in Resend again. */
  repush: string[];
  /** Contact ids in the segment with no consent on record. */
  removeFromSegment: string[];
}

export type PushResult =
  | { kind: 'synced'; contactId: string | null }
  /** An imported address that had already unsubscribed in Resend: it stays unsubscribed. */
  | { kind: 'kept-unsubscribed'; contactId: string };

export interface SyncReport {
  unsubscribedInResend: number;
  removedFromSegment: number;
  pushed: number;
  failed: number;
  /** Rows still waiting to go to Resend after this call. */
  remaining: number;
  /** The first few failures, for the admin screen. */
  errors: string[];
}

/** How long one sync call may work; Netlify may stop a function at 10 s. */
export const SYNC_TIME_BUDGET_MS = 7000;
const PUSH_BATCH = 200;
/** Don't start a row with less than this left: one row takes up to three requests. */
const MIN_TIME_PER_ROW_MS = 600;
const MAX_ERRORS = 5;

export function planPull(contacts: ResendContact[], rows: SyncRow[]): PullPlan {
  const byEmail = new Map(rows.map((r) => [r.email, r]));
  const plan: PullPlan = { markUnsubscribed: [], repush: [], removeFromSegment: [] };
  for (const contact of contacts) {
    const row = byEmail.get(contact.email.toLowerCase());
    if (contact.unsubscribed) {
      if (row?.status === 'subscribed' && row.resend_synced_at !== null) plan.markUnsubscribed.push(row.id);
      continue;
    }
    if (row?.status === 'subscribed') continue;
    if (row?.status === 'unsubscribed') {
      if (row.resend_synced_at !== null) plan.repush.push(row.id);
      continue;
    }
    plan.removeFromSegment.push(contact.id);
  }
  return plan;
}

async function ensureInSegment(resend: ResendClient, contactId: string, segmentId: string): Promise<void> {
  try {
    await resend.addToSegment(contactId, segmentId);
  } catch (err) {
    // Resend may refuse to add a contact that is already a member: check before failing.
    const refused = err instanceof ResendError && err.status >= 400 && err.status < 500 && ![401, 403, 429].includes(err.status);
    if (refused && (await resend.contactSegmentIds(contactId)).includes(segmentId)) return;
    throw err;
  }
}

/** Sends one row's state to Resend. Throws when Resend fails; the row then stays queued. */
export async function pushOne(deps: NewsletterDeps, row: SubscriberRow): Promise<PushResult> {
  const { resend, config } = deps;

  if (row.status === 'unsubscribed') {
    let found = row.resend_contact_id ? await resend.updateContact(row.resend_contact_id, { unsubscribed: true }) : false;
    if (!found) found = await resend.updateContact(row.email, { unsubscribed: true });
    return { kind: 'synced', contactId: found ? row.resend_contact_id : null };
  }
  if (row.status !== 'subscribed') throw new Error(`A ${row.status} row is never sent to Resend`);

  if (row.resend_contact_id && (await resend.updateContact(row.resend_contact_id, { unsubscribed: false }))) {
    await ensureInSegment(resend, row.resend_contact_id, config.segmentId);
    return { kind: 'synced', contactId: row.resend_contact_id };
  }
  const existing = await resend.getContact(row.email);
  if (!existing) return { kind: 'synced', contactId: await resend.createContact(row.email, config.segmentId) };
  if (existing.unsubscribed && row.source === 'import') return { kind: 'kept-unsubscribed', contactId: existing.id };
  if (existing.unsubscribed) await resend.updateContact(existing.id, { unsubscribed: false });
  await ensureInSegment(resend, existing.id, config.segmentId);
  return { kind: 'synced', contactId: existing.id };
}

/** pushOne, then records the result on the row. Returns false if the row changed meanwhile. */
export async function pushAndRecord(deps: NewsletterDeps, row: SubscriberRow): Promise<boolean> {
  const result = await pushOne(deps, row);
  const now = deps.now().toISOString();
  const patch =
    result.kind === 'synced'
      ? { resend_contact_id: result.contactId, resend_synced_at: now }
      : {
          status: 'unsubscribed' as const,
          unsubscribed_at: now,
          unsubscribe_source: 'resend' as const,
          resend_contact_id: result.contactId,
          resend_synced_at: now,
        };
  return (await deps.db.update(row.id, patch, row.updated_at)) !== null;
}

export async function runSync(deps: NewsletterDeps, opts: { pull: boolean; deadline: number }): Promise<SyncReport> {
  const { db, resend, config } = deps;
  const report: SyncReport = { unsubscribedInResend: 0, removedFromSegment: 0, pushed: 0, failed: 0, remaining: 0, errors: [] };
  const fail = (what: string, err: unknown) => {
    report.failed++;
    if (report.errors.length < MAX_ERRORS) report.errors.push(`${what}: ${err instanceof Error ? err.message : String(err)}`);
  };

  if (opts.pull) {
    const contacts: ResendContact[] = [];
    let after: string | undefined;
    do {
      const page = await resend.listSegmentContacts(config.segmentId, after);
      contacts.push(...page.contacts);
      after = page.hasMore && page.contacts.length > 0 ? page.contacts[page.contacts.length - 1].id : undefined;
    } while (after);

    const plan = planPull(contacts, await db.syncRows());
    report.unsubscribedInResend = await db.markPulledUnsubscribed(plan.markUnsubscribed, deps.now().toISOString());
    await db.markNeedsPush(plan.repush);
    for (const contactId of plan.removeFromSegment) {
      try {
        await resend.removeFromSegment(contactId, config.segmentId);
        report.removedFromSegment++;
      } catch (err) {
        fail(`removing contact ${contactId} from the segment`, err);
      }
    }
  }

  for (const row of await db.rowsToPush(PUSH_BATCH)) {
    if (opts.deadline - deps.now().getTime() < MIN_TIME_PER_ROW_MS) break;
    try {
      await pushAndRecord(deps, row);
      report.pushed++;
    } catch (err) {
      fail(row.email, err);
    }
  }
  report.remaining = await db.countToPush();
  return report;
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run tests/vitest/functions/newsletter/sync.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_shared/newsletter-sync.mts tests/vitest/functions/newsletter/sync.test.ts
git commit -m "feat(newsletter): keep Resend's segment in step with Supabase" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 7: The sign-up function

`POST /api/newsletter-subscribe` saves or refreshes a `pending` row and emails a confirmation link. Every request that gets past validation receives the same answer, whatever the address's status (spec §7.1, §7.2).

**Files:**
- Create: `lib/newsletter/confirm-email.ts`
- Create: `netlify/functions/_shared/http.mts`
- Create: `netlify/functions/_shared/newsletter-signup.mts`
- Create: `netlify/functions/newsletter-subscribe.mts`
- Modify: `netlify.toml`
- Test: `tests/vitest/lib/newsletter/confirm-email.test.ts`
- Test: `tests/vitest/functions/newsletter/subscribe.test.ts`

**Interfaces:**
- **Consumes:**
  - From Task 3: `signupSchema`, `KNOWN_NOTICE_VERSIONS`, `SIGNUP_SUCCESS_MESSAGE`, `LIMITS`, `SubscriberRow`, `newToken`, `hashToken`.
  - From Task 5: `NewsletterDeps`, `DuplicateEmailError`, `SITE_ORIGIN`.
  - From plan 1 (`lib/newsletter/render.ts`): `COLORS`, `FONT`, `esc`.
- **Produces:**
  - From `confirm-email.ts`: `buildConfirmEmail({ confirmUrl, logoUrl }): { subject, html, text }`, plus `CONFIRM_SUBJECT` and `IGNORE_LINE`.
  - From `http.mts`: `corsHeaders(methods)`, `jsonResponse(body, status, methods)`, `preflight(methods)`, `readJsonBody(req, maxBytes)` and `clientIp(req)`.
  - From `newsletter-signup.mts`:
    - `SIGNUP_RULES`, `EXPIRED`;
    - `signupDecision(row, now): 'send' | 'skip'`;
    - `linkOrigin(req, siteUrl): string`;
    - `handleSubscribe(req, deps): Promise<Response>`.

- [ ] **Step 1: Write the failing tests**

Create `tests/vitest/lib/newsletter/confirm-email.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { CONFIRM_SUBJECT, IGNORE_LINE, buildConfirmEmail } from '@/lib/newsletter/confirm-email';

const LINK = 'https://hopetrustindia.com/newsletter/confirm/#t=abc_DEF-123';
const LOGO = 'https://abc.supabase.co/storage/v1/object/public/newsletter-images/static/logo-v1.png';

describe('buildConfirmEmail', () => {
  const email = buildConfirmEmail({ confirmUrl: LINK, logoUrl: LOGO });

  it('uses the subject from the spec', () => {
    expect(email.subject).toBe(CONFIRM_SUBJECT);
    expect(CONFIRM_SUBJECT).toBe('Confirm your Hope Trust newsletter subscription');
  });

  it('links the button and shows the link as text for apps that hide buttons', () => {
    expect(email.html.split(`href="${LINK}"`)).toHaveLength(3);
    expect(email.html).toContain('>Confirm my subscription</a>');
    expect(email.html).toContain(`src="${LOGO}"`);
  });

  it('tells people who did not sign up that they can ignore it', () => {
    expect(email.html).toContain('If you didn&#39;t sign up, ignore this email');
    expect(email.text).toContain(IGNORE_LINE);
  });

  it('has a plain-text version with the link', () => {
    expect(email.text).toContain(LINK);
    expect(email.text).not.toContain('<');
  });

  it('escapes the link', () => {
    const odd = buildConfirmEmail({ confirmUrl: 'https://x.test/?a=1&b="2"', logoUrl: LOGO });
    expect(odd.html).toContain('href="https://x.test/?a=1&amp;b=&quot;2&quot;"');
  });
});
```

Create `tests/vitest/functions/newsletter/subscribe.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { SIGNUP_SUCCESS_MESSAGE } from '@/lib/newsletter/subscriber';
import { hashToken } from '@/netlify/functions/_shared/newsletter-crypto.mts';
import type { NewsletterDeps } from '@/netlify/functions/_shared/newsletter-deps.mts';
import { handleSubscribe, linkOrigin } from '@/netlify/functions/_shared/newsletter-signup.mts';
import { SITE, jsonRequest, makeDeps } from './fakes';

const ENDPOINT = 'https://hopetrustindia.com/api/newsletter-subscribe';
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const OK = { ok: true, message: SIGNUP_SUCCESS_MESSAGE };

function signup(body: Record<string, unknown> = {}, ip = '203.0.113.7', url = ENDPOINT) {
  return jsonRequest(
    url,
    'POST',
    { full_name: 'Asha Rao', email: 'asha@example.com', page: '/blogs/', notice: '2026-10', ...body },
    { 'x-nf-client-connection-ip': ip, 'user-agent': 'Mozilla/5.0 Test' },
  );
}

async function send(deps: NewsletterDeps, req: Request) {
  const res = await handleSubscribe(req, deps);
  return { status: res.status, body: await res.json().catch(() => null) };
}

/** The token in the most recent confirmation email's link. */
function lastToken(sent: Array<{ text?: string }>): string {
  return /#t=([A-Za-z0-9_-]{43})/.exec(sent.at(-1)?.text ?? '')![1];
}

describe('newsletter-subscribe', () => {
  it('answers a CORS preflight, and refuses other methods or a missing setup', async () => {
    const { deps } = makeDeps();
    expect((await handleSubscribe(new Request(ENDPOINT, { method: 'OPTIONS' }), deps)).status).toBe(204);
    expect((await handleSubscribe(new Request(ENDPOINT), deps)).status).toBe(405);
    expect((await handleSubscribe(signup(), null)).status).toBe(500);
  });

  it('refuses a body that is not JSON, or is over 4 KB', async () => {
    const { deps } = makeDeps();
    const notJson = new Request(ENDPOINT, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'hi' });
    expect((await handleSubscribe(notJson, deps)).status).toBe(415);
    expect((await handleSubscribe(signup({ full_name: 'x'.repeat(5000) }), deps)).status).toBe(413);
  });

  it('says which fields need fixing', async () => {
    const { deps } = makeDeps();
    const { status, body } = await send(deps, signup({ full_name: 'A', email: 'nope' }));
    expect(status).toBe(400);
    expect(body.fields).toEqual({ full_name: 'Please enter your full name', email: 'Please enter a valid email address' });
  });

  it('refuses a notice version it does not know', async () => {
    const { deps } = makeDeps();
    expect((await send(deps, signup({ notice: '1999-01' }))).status).toBe(400);
  });

  it('treats a filled honeypot as a bot: same answer, nothing saved or sent', async () => {
    const { deps, memory, resend } = makeDeps();
    expect(await send(deps, signup({ website: 'http://spam.example' }))).toEqual({ status: 200, body: OK });
    expect(memory.rows.size).toBe(0);
    expect(resend.sent).toHaveLength(0);
  });

  it('saves a new address as pending and emails a link whose token is stored only as a hash', async () => {
    const { deps, memory, resend } = makeDeps();
    expect(await send(deps, signup())).toEqual({ status: 200, body: OK });

    const row = memory.byEmail('asha@example.com')!;
    expect(row).toMatchObject({
      status: 'pending',
      source: 'website',
      full_name: 'Asha Rao',
      signup_page: '/blogs/',
      signup_ip: '203.0.113.7',
      signup_user_agent: 'Mozilla/5.0 Test',
      signup_notice: '2026-10',
      confirm_send_count: 1,
      confirm_sent_at: deps.now().toISOString(),
      confirm_token_expires_at: new Date(deps.now().getTime() + 7 * DAY).toISOString(),
      consent_at: null,
    });

    const email = resend.sent[0];
    expect(email).toMatchObject({
      from: 'Hope Trust <newsletter@hopetrustindia.com>',
      to: ['asha@example.com'],
      replyTo: 'frontoffice@hopetrustindia.com',
      subject: 'Confirm your Hope Trust newsletter subscription',
    });
    const token = lastToken(resend.sent);
    expect(email.text).toContain(`${SITE}/newsletter/confirm/#t=${token}`);
    expect(row.confirm_token_hash).toBe(hashToken(token));
    expect(JSON.stringify(row)).not.toContain(token);
  });

  it('stores the address trimmed and lower-cased, and the name exactly as typed', async () => {
    const { deps, memory } = makeDeps();
    await send(deps, signup({ email: '  Asha@Example.COM ', full_name: 'आशा రావు 🌿' }));
    expect(memory.byEmail('asha@example.com')?.full_name).toBe('आशा రావు 🌿');
  });

  it('gives the same answer whatever the address\'s status', async () => {
    const { deps, memory, resend, clock } = makeDeps();
    memory.seed({ email: 'pending@example.com', status: 'pending', confirm_sent_at: new Date(deps.now().getTime() - 60 * MINUTE).toISOString(), confirm_send_count: 1 });
    memory.seed({ email: 'subscribed@example.com', status: 'subscribed' });
    memory.seed({ email: 'unsubscribed@example.com', status: 'unsubscribed' });

    const answers = [];
    for (const [i, email] of ['new@example.com', 'pending@example.com', 'subscribed@example.com', 'unsubscribed@example.com'].entries()) {
      clock.advance(MINUTE);
      answers.push(await send(deps, signup({ email }, `203.0.113.${i}`)));
    }
    for (const answer of answers) expect(answer).toEqual({ status: 200, body: OK });
    expect(resend.sent.map((e) => e.to[0])).toEqual(['new@example.com', 'pending@example.com', 'unsubscribed@example.com']);
  });

  it('keeps an unsubscribed person unsubscribed, with their records, until they confirm', async () => {
    const { deps, memory } = makeDeps();
    const before = memory.seed({
      email: 'asha@example.com',
      status: 'unsubscribed',
      source: 'import',
      consent_at: '2026-01-05T00:00:00.000Z',
      consent_note: 'Clinic intake form, 2025–26',
      unsubscribed_at: '2026-06-01T00:00:00.000Z',
      unsubscribe_source: 'resend',
    });
    await send(deps, signup());
    expect(memory.get(before.id)).toMatchObject({
      status: 'unsubscribed',
      source: 'import',
      consent_at: '2026-01-05T00:00:00.000Z',
      consent_note: 'Clinic intake form, 2025–26',
      unsubscribed_at: '2026-06-01T00:00:00.000Z',
      unsubscribe_source: 'resend',
    });
    expect(memory.get(before.id)?.confirm_token_hash).not.toBeNull();
  });

  it('waits 10 minutes between emails to one address', async () => {
    const { deps, resend, clock, memory } = makeDeps();
    await send(deps, signup());
    clock.advance(5 * MINUTE);
    expect(await send(deps, signup())).toEqual({ status: 200, body: OK });
    expect(resend.sent).toHaveLength(1);
    clock.advance(6 * MINUTE);
    await send(deps, signup());
    expect(resend.sent).toHaveLength(2);
    expect(memory.byEmail('asha@example.com')?.confirm_send_count).toBe(2);
  });

  it('sends at most 3 emails to an address that never confirms, and starts again after 30 days', async () => {
    const { deps, resend, clock, memory } = makeDeps();
    for (let i = 0; i < 4; i++) {
      await send(deps, signup());
      clock.advance(11 * MINUTE);
    }
    expect(resend.sent).toHaveLength(3);
    clock.advance(30 * DAY);
    await send(deps, signup());
    expect(resend.sent).toHaveLength(4);
    expect(memory.byEmail('asha@example.com')?.confirm_send_count).toBe(1);
  });

  it('limits each IP address to 5 addresses per 15 minutes', async () => {
    const { deps, clock } = makeDeps();
    for (let i = 0; i < 5; i++) {
      expect((await send(deps, signup({ email: `p${i}@example.com` }))).status).toBe(200);
    }
    const blocked = await send(deps, signup({ email: 'p5@example.com' }));
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toMatch(/try again/i);
    expect((await send(deps, signup({ email: 'p5@example.com' }, '198.51.100.1'))).status).toBe(200);
    clock.advance(16 * MINUTE);
    expect((await send(deps, signup({ email: 'p6@example.com' }))).status).toBe(200);
  });

  it('deletes sign-ups left unconfirmed for 30 days, but never unsubscribed rows', async () => {
    const { deps, memory } = makeDeps();
    const old = new Date(deps.now().getTime() - 31 * DAY).toISOString();
    const stale = memory.seed({ email: 'stale@example.com', status: 'pending', confirm_sent_at: old });
    const left = memory.seed({ email: 'left@example.com', status: 'unsubscribed', created_at: old, unsubscribed_at: old });
    await send(deps, signup());
    expect(memory.get(stale.id)).toBeUndefined();
    expect(memory.get(left.id)).toBeDefined();
  });

  it('gives a concurrent request for the same address the normal answer', async () => {
    const { deps, memory, resend } = makeDeps();
    memory.seed({ email: 'asha@example.com', status: 'pending' });
    // This request read the table before the other request's row existed.
    const staleRead: NewsletterDeps = { ...deps, db: { ...deps.db, findByEmail: async () => null } };
    expect(await send(staleRead, signup())).toEqual({ status: 200, body: OK });
    expect(resend.sent).toHaveLength(0);
  });

  it('puts the confirmation fields back when the email cannot be sent', async () => {
    const { deps, memory, resend, clock } = makeDeps();
    await send(deps, signup());
    const firstToken = lastToken(resend.sent);
    clock.advance(11 * MINUTE);
    resend.failNext('sendEmail');
    const failed = await send(deps, signup());
    expect(failed.status).toBe(502);
    // The earlier link still works, and the person can try again straight away.
    expect(memory.byEmail('asha@example.com')).toMatchObject({ confirm_token_hash: hashToken(firstToken), confirm_send_count: 1 });
    expect((await send(deps, signup())).status).toBe(200);
    expect(resend.sent).toHaveLength(2);
  });
});

describe('linkOrigin', () => {
  const at = (url: string) => new Request(url, { method: 'POST' });

  it('keeps links on the site the request came from when it is ours', () => {
    expect(linkOrigin(at('https://deploy-preview-31--hopetrust.netlify.app/api/newsletter-subscribe'), SITE)).toBe(
      'https://deploy-preview-31--hopetrust.netlify.app',
    );
    expect(linkOrigin(at('http://localhost:8888/api/newsletter-subscribe'), SITE)).toBe('http://localhost:8888');
    expect(linkOrigin(at('https://hopetrustindia.com/api/newsletter-subscribe'), SITE)).toBe(SITE);
  });

  it('uses the main site for any other host', () => {
    expect(linkOrigin(at('https://evil.example/api/newsletter-subscribe'), SITE)).toBe(SITE);
    expect(linkOrigin(at('http://hopetrust.netlify.app/api/newsletter-subscribe'), SITE)).toBe(SITE);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/vitest/lib/newsletter/confirm-email.test.ts tests/vitest/functions/newsletter/subscribe.test.ts`
Expected: FAIL. The modules don't exist.

- [ ] **Step 3: Write the confirmation email**

Create `lib/newsletter/confirm-email.ts`:

```ts
// The email that asks a new subscriber to confirm (spec §7.3): short, in the
// newsletter's colours, with the link as text as well as a button for email
// apps that hide buttons or block images.

import { COLORS, FONT, esc } from './render';

export interface ConfirmEmailInput {
  /** https://hopetrustindia.com/newsletter/confirm/#t=<token> */
  confirmUrl: string;
  /** The Hope Trust badge in the newsletter-images bucket. */
  logoUrl: string;
}

export const CONFIRM_SUBJECT = 'Confirm your Hope Trust newsletter subscription';
export const IGNORE_LINE = "If you didn't sign up, ignore this email and you won't be added.";

export function buildConfirmEmail({ confirmUrl, logoUrl }: ConfirmEmailInput): { subject: string; html: string; text: string } {
  const url = esc(confirmUrl);
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(CONFIRM_SUBJECT)}</title>
</head>
<body style="margin:0;padding:0;background-color:${COLORS.page};">
<div style="display:none;max-height:0;overflow:hidden;">One click and you're on the list.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLORS.page};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background-color:${COLORS.white};border-radius:16px;">
<tr><td align="center" style="padding:32px 32px 8px 32px;"><img src="${esc(logoUrl)}" width="80" height="81" alt="Hope Trust" style="display:block;border:0;width:80px;height:auto;"></td></tr>
<tr><td style="padding:8px 32px 0 32px;font-family:${FONT};color:${COLORS.text};">
<h1 style="margin:0 0 12px 0;font-size:22px;line-height:1.3;font-weight:600;text-align:center;">Please confirm your subscription</h1>
<p style="margin:0 0 24px 0;font-size:16px;line-height:1.6;">Thank you for signing up for the Hope Trust newsletter. Click the button below to confirm your email address. We'll send you the newsletter about once a month.</p>
</td></tr>
<tr><td align="center" style="padding:0 32px 24px 32px;">
<a href="${url}" style="display:inline-block;background-color:${COLORS.orange};color:${COLORS.white};font-family:${FONT};font-size:16px;font-weight:600;text-decoration:none;padding:14px 28px;border-radius:999px;">Confirm my subscription</a>
</td></tr>
<tr><td style="padding:0 32px 32px 32px;font-family:${FONT};color:${COLORS.muted};font-size:13px;line-height:1.6;">
<p style="margin:0 0 12px 0;">The button works once and expires in 7 days. If it doesn't work, copy this link into your browser:<br><a href="${url}" style="color:${COLORS.muted};word-break:break-all;">${url}</a></p>
<p style="margin:0;">${esc(IGNORE_LINE)}</p>
</td></tr>
</table>
<p style="margin:16px 0 0 0;font-family:${FONT};font-size:12px;color:${COLORS.muted};">Hope Trust · hopetrustindia.com</p>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    'Please confirm your subscription',
    '',
    'Thank you for signing up for the Hope Trust newsletter. Open this link to confirm your email address:',
    confirmUrl,
    '',
    'The link works once and expires in 7 days.',
    '',
    IGNORE_LINE,
    '',
    'Hope Trust · hopetrustindia.com',
  ].join('\n');

  return { subject: CONFIRM_SUBJECT, html, text };
}
```

- [ ] **Step 4: Write the HTTP helpers**

Create `netlify/functions/_shared/http.mts`:

```ts
// JSON, CORS and request helpers for the newsletter functions.

import { SITE_ORIGIN } from './newsletter-deps.mts';

export function corsHeaders(methods: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': SITE_ORIGIN,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': methods,
  };
}

export function jsonResponse(body: unknown, status: number, methods: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(methods), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export function preflight(methods: string): Response {
  return new Response(null, { status: 204, headers: corsHeaders(methods) });
}

export type BodyResult = { ok: true; value: unknown } | { ok: false; status: number; error: string };

/** Reads a JSON body of at most `maxBytes`. */
export async function readJsonBody(req: Request, maxBytes: number): Promise<BodyResult> {
  if (!(req.headers.get('content-type') || '').includes('application/json')) {
    return { ok: false, status: 415, error: 'Content-Type must be application/json' };
  }
  if (Number(req.headers.get('content-length') || '0') > maxBytes) {
    return { ok: false, status: 413, error: 'Request body too large' };
  }
  let text: string;
  try {
    text = await req.text();
  } catch {
    return { ok: false, status: 400, error: 'Could not read the request body' };
  }
  if (new TextEncoder().encode(text).length > maxBytes) {
    return { ok: false, status: 413, error: 'Request body too large' };
  }
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, status: 400, error: 'Invalid JSON body' };
  }
}

/** The visitor's IP: Netlify's own header first, because a visitor can't set it. */
export function clientIp(req: Request): string | null {
  return (
    req.headers.get('x-nf-client-connection-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    null
  );
}
```

- [ ] **Step 5: Write the handler and the function**

Create `netlify/functions/_shared/newsletter-signup.mts`:

```ts
// The public steps of signing up (spec §7.2, §7.3):
//   POST /api/newsletter-subscribe  { full_name, email, page, notice, website }
//   POST /api/newsletter-confirm    { token }   (handleConfirm, added in Task 8)
// Neither answer depends on whether the address is on the list.

import type { z } from 'zod';
import { buildConfirmEmail } from '../../../lib/newsletter/confirm-email';
import {
  KNOWN_NOTICE_VERSIONS,
  LIMITS,
  SIGNUP_SUCCESS_MESSAGE,
  signupSchema,
  type SignupInput,
  type SubscriberRow,
} from '../../../lib/newsletter/subscriber';
import { clientIp, jsonResponse, preflight, readJsonBody } from './http.mts';
import { hashToken, newToken } from './newsletter-crypto.mts';
import { DuplicateEmailError } from './newsletter-db.mts';
import type { NewsletterDeps } from './newsletter-deps.mts';

const METHODS = 'POST, OPTIONS';
const MAX_BODY_BYTES = 4096;
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export const SIGNUP_RULES = {
  /** Different addresses that requests from one IP can trigger confirmation emails for, per window. */
  maxAddressesPerIp: 5,
  ipWindowMs: 15 * MINUTE,
  /** Shortest gap between confirmation emails to one address. */
  resendGapMs: 10 * MINUTE,
  /** Confirmation emails one address can get without confirming, per 30 days. */
  maxSendsPerAddress: 3,
  sendCountWindowMs: 30 * DAY,
  tokenLifetimeMs: 7 * DAY,
  /** Unconfirmed sign-ups are deleted after this long: they never gave consent. */
  pendingLifetimeMs: 30 * DAY,
} as const;

const OK = { ok: true, message: SIGNUP_SUCCESS_MESSAGE };
export const EXPIRED = { error: 'expired', message: 'This link has expired or was already used.' };

const iso = (ms: number) => new Date(ms).toISOString();

/**
 * Whether a sign-up request should send a confirmation email. A skip still
 * gets the normal answer, so nobody learns why.
 */
export function signupDecision(row: SubscriberRow | null, now: Date): 'send' | 'skip' {
  if (!row) return 'send';
  if (row.status === 'subscribed') return 'skip';
  const last = row.confirm_sent_at ? Date.parse(row.confirm_sent_at) : null;
  if (last === null) return 'send';
  const since = now.getTime() - last;
  if (since < SIGNUP_RULES.resendGapMs) return 'skip';
  if (since < SIGNUP_RULES.sendCountWindowMs && row.confirm_send_count >= SIGNUP_RULES.maxSendsPerAddress) return 'skip';
  return 'send';
}

const PREVIEW_HOST = /^([a-z0-9-]+--)?hopetrust\.netlify\.app$/;

/**
 * Origin for the link in the email: the site the request came from when it is
 * ours (production, a deploy preview, or `netlify dev`), else the main site.
 */
export function linkOrigin(req: Request, siteUrl: string): string {
  let url: URL;
  try {
    url = new URL(req.url);
  } catch {
    return siteUrl;
  }
  const host = url.hostname;
  const ours =
    url.origin === siteUrl ||
    (url.protocol === 'https:' && (host === 'hopetrustindia.com' || PREVIEW_HOST.test(host))) ||
    (url.protocol === 'http:' && (host === 'localhost' || host === '127.0.0.1'));
  return ours ? url.origin : siteUrl;
}

function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? 'form');
    if (!(field in out)) out[field] = issue.message;
  }
  return out;
}

function honeypotFilled(value: unknown): boolean {
  const website = (value as { website?: unknown } | null)?.website;
  return typeof website === 'string' && website.trim() !== '';
}

export async function handleSubscribe(req: Request, deps: NewsletterDeps | null): Promise<Response> {
  const reply = (body: unknown, status = 200) => jsonResponse(body, status, METHODS);
  if (req.method === 'OPTIONS') return preflight(METHODS);
  if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
  if (!deps) return reply({ error: 'Server misconfiguration' }, 500);

  const body = await readJsonBody(req, MAX_BODY_BYTES);
  if (!body.ok) return reply({ error: body.error }, body.status);
  if (honeypotFilled(body.value)) return reply(OK);

  const parsed = signupSchema.safeParse(body.value);
  if (!parsed.success) return reply({ error: 'Please check the form.', fields: fieldErrors(parsed.error) }, 400);
  if (!KNOWN_NOTICE_VERSIONS.includes(parsed.data.notice)) {
    return reply({ error: 'Please reload the page and try again.' }, 400);
  }

  try {
    return await subscribe(req, deps, parsed.data, reply);
  } catch (err) {
    console.error('[newsletter-subscribe]', err);
    return reply({ error: 'Something went wrong. Please try again.' }, 500);
  }
}

async function subscribe(
  req: Request,
  deps: NewsletterDeps,
  input: SignupInput,
  reply: (body: unknown, status?: number) => Response,
): Promise<Response> {
  const { db, resend, config } = deps;
  const now = deps.now().getTime();
  const ip = clientIp(req);

  await db
    .deleteStalePending(iso(now - SIGNUP_RULES.pendingLifetimeMs))
    .catch((err) => console.error('[newsletter-subscribe] clean-up', err));

  if (ip && (await db.countRecentFromIp(ip, iso(now - SIGNUP_RULES.ipWindowMs))) >= SIGNUP_RULES.maxAddressesPerIp) {
    return reply({ error: 'Too many sign-ups from your connection. Please try again in a few minutes.' }, 429);
  }

  const existing = await db.findByEmail(input.email);
  if (signupDecision(existing, new Date(now)) === 'skip') return reply(OK);

  const token = newToken();
  const lastSent = existing?.confirm_sent_at ? Date.parse(existing.confirm_sent_at) : null;
  const withinWindow = lastSent !== null && now - lastSent < SIGNUP_RULES.sendCountWindowMs;
  const fields = {
    full_name: input.full_name,
    signup_page: input.page,
    signup_ip: ip,
    signup_user_agent: (req.headers.get('user-agent') || '').slice(0, LIMITS.userAgent) || null,
    signup_notice: input.notice,
    confirm_token_hash: hashToken(token),
    confirm_token_expires_at: iso(now + SIGNUP_RULES.tokenLifetimeMs),
    confirm_sent_at: iso(now),
    confirm_send_count: existing && withinWindow ? existing.confirm_send_count + 1 : 1,
  };

  let row: SubscriberRow | null;
  try {
    row = existing
      ? await db.update(existing.id, fields)
      : await db.insert({ email: input.email, status: 'pending', source: 'website', ...fields });
  } catch (err) {
    if (err instanceof DuplicateEmailError) return reply(OK); // a request for the same address got there first
    throw err;
  }
  if (!row) return reply(OK);

  const email = buildConfirmEmail({
    confirmUrl: `${linkOrigin(req, config.siteUrl)}/newsletter/confirm/#t=${token}`,
    logoUrl: `${config.imagesBase}/static/logo-v1.png`,
  });
  try {
    await resend.sendEmail({ from: config.fromEmail, to: [input.email], replyTo: config.replyTo, ...email });
  } catch (err) {
    console.error('[newsletter-subscribe] confirmation email', err);
    // Put the confirmation fields back: any earlier link keeps working and the
    // person can try again at once.
    await db
      .update(row.id, {
        confirm_token_hash: existing?.confirm_token_hash ?? null,
        confirm_token_expires_at: existing?.confirm_token_expires_at ?? null,
        confirm_sent_at: existing?.confirm_sent_at ?? null,
        confirm_send_count: existing?.confirm_send_count ?? 0,
      })
      .catch(() => null);
    return reply({ error: "We couldn't send the confirmation email. Please try again in a minute." }, 502);
  }
  return reply(OK);
}
```

Create `netlify/functions/newsletter-subscribe.mts`:

```ts
// POST /api/newsletter-subscribe: public newsletter sign-up (spec §7.2).
import { liveDeps } from './_shared/newsletter-deps.mts';
import { handleSubscribe } from './_shared/newsletter-signup.mts';

export default (req: Request) => handleSubscribe(req, liveDeps());
```

In `netlify.toml`, add this block directly after the `/api/admin-programs` redirect, above the `# PAYMENT DISABLED` comment:

```toml
# Newsletter (Netlify Functions)
[[redirects]]
  from = "/api/newsletter-subscribe"
  to = "/.netlify/functions/newsletter-subscribe"
  status = 200
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `npx vitest run tests/vitest/lib/newsletter/confirm-email.test.ts tests/vitest/functions/newsletter/subscribe.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/newsletter/confirm-email.ts netlify/functions/_shared/http.mts netlify/functions/_shared/newsletter-signup.mts netlify/functions/newsletter-subscribe.mts netlify.toml tests/vitest/lib/newsletter/confirm-email.test.ts tests/vitest/functions/newsletter/subscribe.test.ts
git commit -m "feat(newsletter): sign-up function with email confirmation" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The confirm function

`POST /api/newsletter-confirm` takes the token from the link, marks the row `subscribed` with fresh consent evidence, takes the address off the erasure list and tells Resend straight away. If Resend can't be reached, the row stays queued for the next sync (spec §7.3).

**Files:**
- Modify: `netlify/functions/_shared/newsletter-signup.mts`
- Create: `netlify/functions/newsletter-confirm.mts`
- Modify: `netlify.toml`
- Test: `tests/vitest/functions/newsletter/confirm.test.ts`

**Interfaces:**
- **Consumes:**
  - `TOKEN_PATTERN`, `hashToken`, `hashEmail` (Task 3);
  - `pushAndRecord` (Task 6);
  - `EXPIRED`, `jsonResponse`, `preflight`, `readJsonBody` (Task 7).
- **Produces:**
  - `handleConfirm(req, deps): Promise<Response>`, which answers `200 { ok: true }` or `400 EXPIRED`;
  - `consentNote(row): string`.

- [ ] **Step 1: Write the failing tests**

Create `tests/vitest/functions/newsletter/confirm.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { hashEmail } from '@/netlify/functions/_shared/newsletter-crypto.mts';
import type { NewsletterDeps } from '@/netlify/functions/_shared/newsletter-deps.mts';
import { EXPIRED, handleConfirm, handleSubscribe } from '@/netlify/functions/_shared/newsletter-signup.mts';
import { SEGMENT, jsonRequest, makeDeps } from './fakes';

const ENDPOINT = 'https://hopetrustindia.com/api/newsletter-confirm';
const DAY = 24 * 60 * 60_000;

/** Signs up through the real handler and returns the token from the email. */
async function signUp(deps: NewsletterDeps, sent: Array<{ text?: string }>, email = 'asha@example.com') {
  const req = jsonRequest(
    'https://hopetrustindia.com/api/newsletter-subscribe',
    'POST',
    { full_name: 'Asha Rao', email, page: '/blogs/', notice: '2026-10' },
    { 'x-nf-client-connection-ip': '203.0.113.7' },
  );
  expect((await handleSubscribe(req, deps)).status).toBe(200);
  return /#t=([A-Za-z0-9_-]{43})/.exec(sent.at(-1)!.text!)![1];
}

async function confirm(deps: NewsletterDeps, token: unknown) {
  const res = await handleConfirm(jsonRequest(ENDPOINT, 'POST', { token }), deps);
  return { status: res.status, body: await res.json().catch(() => null) };
}

describe('newsletter-confirm', () => {
  it('answers a CORS preflight and refuses other methods', async () => {
    const { deps } = makeDeps();
    expect((await handleConfirm(new Request(ENDPOINT, { method: 'OPTIONS' }), deps)).status).toBe(204);
    expect((await handleConfirm(new Request(ENDPOINT), deps)).status).toBe(405);
  });

  it('confirms a pending sign-up: consent recorded, token gone, contact added in Resend', async () => {
    const { deps, memory, resend, clock } = makeDeps();
    const token = await signUp(deps, resend.sent);
    clock.advance(60_000);

    expect(await confirm(deps, token)).toEqual({ status: 200, body: { ok: true } });

    const row = memory.byEmail('asha@example.com')!;
    expect(row).toMatchObject({
      status: 'subscribed',
      source: 'website',
      consent_at: deps.now().toISOString(),
      confirm_token_hash: null,
      confirm_token_expires_at: null,
      confirm_send_count: 0,
    });
    expect(row.consent_note).toBe('Website sign-up form on /blogs/ (notice 2026-10), confirmed by clicking the emailed link');
    const contact = resend.find('asha@example.com')!;
    expect(contact.segments.has(SEGMENT)).toBe(true);
    expect(row).toMatchObject({ resend_contact_id: contact.id, resend_synced_at: deps.now().toISOString() });
  });

  it('refuses a malformed, unknown or already-used token with the same answer', async () => {
    const { deps, resend } = makeDeps();
    const token = await signUp(deps, resend.sent);
    expect(await confirm(deps, 'x')).toEqual({ status: 400, body: EXPIRED });
    expect(await confirm(deps, 'A'.repeat(43))).toEqual({ status: 400, body: EXPIRED });
    expect((await confirm(deps, token)).status).toBe(200);
    expect(await confirm(deps, token)).toEqual({ status: 400, body: EXPIRED });
  });

  it('refuses a link older than 7 days and leaves the sign-up pending', async () => {
    const { deps, memory, resend, clock } = makeDeps();
    const token = await signUp(deps, resend.sent);
    clock.advance(7 * DAY + 60_000);
    expect(await confirm(deps, token)).toEqual({ status: 400, body: EXPIRED });
    expect(memory.byEmail('asha@example.com')?.status).toBe('pending');
  });

  it('re-subscribes someone who unsubscribed, once they click, here and in Resend', async () => {
    const { deps, memory, resend, clock } = makeDeps();
    const contact = resend.add('asha@example.com', { unsubscribed: true, segments: [SEGMENT] });
    memory.seed({
      email: 'asha@example.com',
      status: 'unsubscribed',
      source: 'import',
      consent_note: 'Clinic intake form, 2025–26',
      unsubscribed_at: '2026-06-01T00:00:00.000Z',
      unsubscribe_source: 'resend',
      resend_contact_id: contact.id,
      resend_synced_at: '2026-06-01T00:00:00.000Z',
    });
    const token = await signUp(deps, resend.sent);
    clock.advance(60_000);

    expect((await confirm(deps, token)).status).toBe(200);
    expect(memory.byEmail('asha@example.com')).toMatchObject({
      status: 'subscribed',
      source: 'website',
      unsubscribed_at: null,
      unsubscribe_source: null,
      consent_note: 'Website sign-up form on /blogs/ (notice 2026-10), confirmed by clicking the emailed link',
    });
    expect(contact.unsubscribed).toBe(false);
  });

  it('takes the address off the erasure list: confirming is fresh consent', async () => {
    const { deps, memory, resend } = makeDeps();
    memory.erased.add(hashEmail('asha@example.com'));
    const token = await signUp(deps, resend.sent);
    await confirm(deps, token);
    expect(memory.erased.has(hashEmail('asha@example.com'))).toBe(false);
  });

  it('still confirms when Resend is down, leaving the row for the next sync', async () => {
    const { deps, memory, resend } = makeDeps();
    const token = await signUp(deps, resend.sent);
    resend.failNext('getContact');
    expect((await confirm(deps, token)).status).toBe(200);
    expect(memory.byEmail('asha@example.com')).toMatchObject({ status: 'subscribed', resend_synced_at: null });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/vitest/functions/newsletter/confirm.test.ts`
Expected: FAIL with "handleConfirm is not a function" or an import error.

- [ ] **Step 3: Add the handler**

In `netlify/functions/_shared/newsletter-signup.mts`, change the import lines:

```ts
import type { z } from 'zod';
```

to:

```ts
import { z } from 'zod';
```

and:

```ts
import { hashToken, newToken } from './newsletter-crypto.mts';
```

to:

```ts
import { TOKEN_PATTERN, hashEmail, hashToken, newToken } from './newsletter-crypto.mts';
```

Below `import type { NewsletterDeps } from './newsletter-deps.mts';`, add:

```ts
import { pushAndRecord } from './newsletter-sync.mts';
```

Then append to the end of the file:

```ts
const confirmSchema = z.object({ token: z.string().regex(TOKEN_PATTERN) });

/** How the consent was given, for the record (spec §1 "Done means" 5). */
export function consentNote(row: SubscriberRow): string {
  return `Website sign-up form on ${row.signup_page || 'an unknown page'} (notice ${row.signup_notice || 'unknown'}), confirmed by clicking the emailed link`;
}

export async function handleConfirm(req: Request, deps: NewsletterDeps | null): Promise<Response> {
  const reply = (body: unknown, status = 200) => jsonResponse(body, status, METHODS);
  if (req.method === 'OPTIONS') return preflight(METHODS);
  if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
  if (!deps) return reply({ error: 'Server misconfiguration' }, 500);

  const body = await readJsonBody(req, MAX_BODY_BYTES);
  if (!body.ok) return reply({ error: body.error }, body.status);
  const parsed = confirmSchema.safeParse(body.value);
  if (!parsed.success) return reply(EXPIRED, 400);

  try {
    const { db } = deps;
    const now = deps.now();
    const row = await db.findByTokenHash(hashToken(parsed.data.token));
    if (!row?.confirm_token_expires_at || Date.parse(row.confirm_token_expires_at) <= now.getTime()) {
      return reply(EXPIRED, 400);
    }

    const confirmed = await db.update(
      row.id,
      {
        status: 'subscribed',
        source: 'website',
        consent_at: now.toISOString(),
        consent_note: consentNote(row),
        unsubscribed_at: null,
        unsubscribe_source: null,
        confirm_token_hash: null,
        confirm_token_expires_at: null,
        confirm_send_count: 0,
        resend_synced_at: null,
      },
      row.updated_at,
    );
    if (!confirmed) return reply(EXPIRED, 400); // the row changed meanwhile, e.g. a second click

    await db.unErase(hashEmail(row.email)).catch((err) => console.error('[newsletter-confirm] erasure list', err));
    // Tell Resend now. If that fails, the row stays queued and the next sync sends it.
    await pushAndRecord(deps, confirmed).catch((err) => console.error('[newsletter-confirm] Resend', err));
    return reply({ ok: true });
  } catch (err) {
    console.error('[newsletter-confirm]', err);
    return reply({ error: 'Something went wrong. Please try again.' }, 500);
  }
}
```

Create `netlify/functions/newsletter-confirm.mts`:

```ts
// POST /api/newsletter-confirm: confirms a sign-up from the emailed link (spec §7.3).
import { liveDeps } from './_shared/newsletter-deps.mts';
import { handleConfirm } from './_shared/newsletter-signup.mts';

export default (req: Request) => handleConfirm(req, liveDeps());
```

In `netlify.toml`, add below the `/api/newsletter-subscribe` redirect:

```toml
[[redirects]]
  from = "/api/newsletter-confirm"
  to = "/.netlify/functions/newsletter-confirm"
  status = 200
```

- [ ] **Step 4: Run the newsletter tests to see them pass**

Run: `npx vitest run tests/vitest/functions/newsletter/ tests/vitest/lib/newsletter/`
Expected: PASS, the subscribe tests included.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_shared/newsletter-signup.mts netlify/functions/newsletter-confirm.mts netlify.toml tests/vitest/functions/newsletter/confirm.test.ts
git commit -m "feat(newsletter): confirm function records consent and tells Resend" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 9: Spreadsheet import rules and the SheetJS upgrade

`lib/newsletter/import.ts` turns a grid of cells into checked, de-duplicated rows. The import dialog (Task 15) uses it to preview a file, and the admin function (Task 10) runs `cleanRows` again on every row it receives. `read-spreadsheet.ts` reads the uploaded file in the browser. The `xlsx` package is upgraded first. The installed 0.18.5 is the last version on npm, and it has known flaws when reading crafted files (CVE-2023-30533, CVE-2024-22363). SheetJS now publishes only on its own CDN, where 0.20.3 is the latest release (checked 14 Oct 2026).

**Files:**
- Modify: `package.json`, `package-lock.json`
- Create: `lib/newsletter/import.ts`
- Create: `lib/newsletter/read-spreadsheet.ts`
- Test: `tests/vitest/lib/newsletter/import.test.ts`
- Test: `tests/vitest/lib/newsletter/read-spreadsheet.test.ts`

**Interfaces:**
- **Consumes:** `isValidEmail`, `normaliseEmail`, `LIMITS` (Task 3).
- **Produces:**
  - Types: `ImportRow { email: string; name: string | null }`, `CleanedRows { rows; invalid; duplicates }`, `Sheet { headers: string[]; rows: string[][] }`.
  - `IMPORT_CHUNK = 200`
  - `extractEmail(cell): string`
  - `splitHeader(grid): Sheet`
  - `guessColumns(sheet): { email: number; name: number | null }`
  - `pickColumns(sheet, emailCol, nameCol)`
  - `cleanRows(input: unknown): CleanedRows`
  - `chunk(items, size?)`
  - `MAX_IMPORT_BYTES`
  - `readSpreadsheet(file: File): Promise<string[][]>`

- [ ] **Step 1: Upgrade SheetJS**

Run: `npm install --save https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`

Expected:
- `package.json` shows `"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"`.
- `node -e "console.log(require('xlsx/package.json').version)"` prints `0.20.3`.

The only other user is `downloadEnrollmentsXlsx` in `lib/enrollments-admin.ts`. It calls `utils.json_to_sheet`, `utils.book_new`, `utils.book_append_sheet` and `writeFile`, which 0.20.3 keeps unchanged. Step 6 runs the whole suite to catch any surprise.

- [ ] **Step 2: Write the failing tests**

Create `tests/vitest/lib/newsletter/import.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { chunk, cleanRows, extractEmail, guessColumns, pickColumns, splitHeader } from '@/lib/newsletter/import';

describe('extractEmail', () => {
  it('takes the address out of "Name <address>" and mailto: links, normalised', () => {
    expect(extractEmail('Asha Rao <Asha@Example.com>')).toBe('asha@example.com');
    expect(extractEmail('mailto:ravi@example.com')).toBe('ravi@example.com');
    expect(extractEmail('  plain@example.com ')).toBe('plain@example.com');
  });
});

describe('splitHeader', () => {
  it('uses the first row as headers and drops empty rows', () => {
    expect(splitHeader([['Email', 'Name'], ['', ''], ['a@example.com', 'Asha'], [null, undefined]])).toEqual({
      headers: ['Email', 'Name'],
      rows: [['a@example.com', 'Asha']],
    });
  });

  it('treats a first row with an address in it as data, naming the columns', () => {
    expect(splitHeader([['a@example.com', 'Asha'], ['b@example.com']])).toEqual({
      headers: ['Column A', 'Column B'],
      rows: [['a@example.com', 'Asha'], ['b@example.com', '']],
    });
  });

  it('copes with an empty sheet', () => {
    expect(splitHeader([])).toEqual({ headers: [], rows: [] });
  });
});

describe('guessColumns', () => {
  it('finds email and name headers', () => {
    expect(guessColumns({ headers: ['Phone', 'Full Name', 'E-mail'], rows: [] })).toEqual({ email: 2, name: 1 });
  });

  it('without an email header, picks the column holding the most addresses', () => {
    const sheet = { headers: ['Column A', 'Column B'], rows: [['Asha', 'a@example.com'], ['Ravi', 'b@example.com']] };
    expect(guessColumns(sheet)).toEqual({ email: 1, name: null });
  });
});

describe('cleanRows', () => {
  it('normalises, validates and de-duplicates, keeping the first row for an address', () => {
    const sheet = splitHeader([
      ['Email', 'Name'],
      [' Asha@Example.com ', 'Asha Rao'],
      ['not an email', 'Nobody'],
      ['asha@example.com', 'Asha again'],
      ['Ravi <ravi@example.com>', '  రవి  '],
      ['meena@example.com', ''],
    ]);
    expect(cleanRows(pickColumns(sheet, 0, 1))).toEqual({
      rows: [
        { email: 'asha@example.com', name: 'Asha Rao' },
        { email: 'ravi@example.com', name: 'రవి' },
        { email: 'meena@example.com', name: null },
      ],
      invalid: 1,
      duplicates: 1,
    });
  });

  it('cuts names at 200 characters without splitting an emoji', () => {
    const long = `${'a'.repeat(199)}🌿🌿`;
    const [row] = cleanRows([{ email: 'a@example.com', name: long }]).rows;
    expect(Array.from(row.name!)).toHaveLength(200);
    expect(row.name!.endsWith('🌿')).toBe(true);
  });

  it('counts anything that is not a row with a string email as invalid', () => {
    expect(cleanRows([{ email: 42 }, null, 'x', { name: 'No email' }])).toEqual({ rows: [], invalid: 4, duplicates: 0 });
    expect(cleanRows('not a list')).toEqual({ rows: [], invalid: 0, duplicates: 0 });
  });
});

describe('chunk', () => {
  it('splits into groups of 200 by default', () => {
    expect(chunk(Array.from({ length: 450 }, (_, i) => i)).map((c) => c.length)).toEqual([200, 200, 50]);
  });
});
```

Create `tests/vitest/lib/newsletter/read-spreadsheet.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { MAX_IMPORT_BYTES, readSpreadsheet } from '@/lib/newsletter/read-spreadsheet';

describe('readSpreadsheet', () => {
  it('reads the first sheet of an .xlsx file as text, skipping blank rows', async () => {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.aoa_to_sheet([['Email', 'Name'], ['asha@example.com', 'Asha Rao'], [], ['ravi@example.com', 'రవి']]),
      'List',
    );
    const bytes = XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    expect(await readSpreadsheet(new File([bytes], 'list.xlsx'))).toEqual([
      ['Email', 'Name'],
      ['asha@example.com', 'Asha Rao'],
      ['ravi@example.com', 'రవి'],
    ]);
  });

  it('reads a UTF-8 CSV, with or without a byte-order mark, keeping Hindi and Telugu names', async () => {
    const csv = '﻿Email,Name\nasha@example.com,आशा\nravi@example.com,రవి\n';
    expect(await readSpreadsheet(new File([csv], 'list.csv', { type: 'text/csv' }))).toEqual([
      ['Email', 'Name'],
      ['asha@example.com', 'आशा'],
      ['ravi@example.com', 'రవి'],
    ]);
  });

  it('refuses files over 5 MB and files that are not .csv or .xlsx', async () => {
    await expect(readSpreadsheet(new File([new Uint8Array(MAX_IMPORT_BYTES + 1)], 'big.csv'))).rejects.toThrow(/5 MB/);
    await expect(readSpreadsheet(new File(['x'], 'list.pdf'))).rejects.toThrow(/\.csv or \.xlsx/);
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `npx vitest run tests/vitest/lib/newsletter/import.test.ts tests/vitest/lib/newsletter/read-spreadsheet.test.ts`
Expected: FAIL. The modules don't exist.

- [ ] **Step 4: Write the modules**

Create `lib/newsletter/import.ts`:

```ts
// Turns an uploaded spreadsheet into newsletter rows (spec §7.4). The admin
// import dialog uses it to preview a file; the subscribers function runs
// cleanRows again on every row it receives.

import { LIMITS, isValidEmail, normaliseEmail } from './subscriber';

export interface ImportRow {
  email: string;
  name: string | null;
}

export interface CleanedRows {
  rows: ImportRow[];
  invalid: number;
  duplicates: number;
}

export interface Sheet {
  headers: string[];
  rows: string[][];
}

/** Rows per request to the subscribers function. */
export const IMPORT_CHUNK = 200;

const cellText = (cell: unknown) => (cell === null || cell === undefined ? '' : String(cell).trim());

function columnLetter(index: number): string {
  let letters = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
  }
  return letters;
}

/** The address in "Name <address>" or "mailto:address", normalised. */
export function extractEmail(cell: string): string {
  const inAngles = /<([^<>]+)>/.exec(cell);
  return normaliseEmail((inAngles ? inAngles[1] : cell).replace(/^\s*mailto:/i, ''));
}

/**
 * Splits a grid into a header row and data rows, dropping empty rows. A first
 * row with an address in it is data, and the columns become "Column A"…
 */
export function splitHeader(grid: unknown[][]): Sheet {
  const cleaned = grid
    .map((row) => (Array.isArray(row) ? row.map(cellText) : []))
    .filter((row) => row.some((cell) => cell !== ''));
  if (cleaned.length === 0) return { headers: [], rows: [] };

  const width = Math.max(...cleaned.map((row) => row.length));
  const pad = (row: string[]) => [...row, ...Array<string>(width - row.length).fill('')];
  const firstIsData = cleaned[0].some((cell) => isValidEmail(extractEmail(cell)));
  if (firstIsData) {
    return { headers: Array.from({ length: width }, (_, i) => `Column ${columnLetter(i)}`), rows: cleaned.map(pad) };
  }
  return {
    headers: pad(cleaned[0]).map((header, i) => header || `Column ${columnLetter(i)}`),
    rows: cleaned.slice(1).map(pad),
  };
}

/** Best guess at the email and name columns. */
export function guessColumns(sheet: Sheet): { email: number; name: number | null } {
  const lower = sheet.headers.map((h) => h.toLowerCase().trim());
  let email = lower.findIndex((h) => /e-?mail/.test(h));
  if (email < 0) {
    // No header says "email": take the column with the most addresses in it.
    let best = -1;
    lower.forEach((_, col) => {
      const hits = sheet.rows.filter((row) => isValidEmail(extractEmail(row[col] ?? ''))).length;
      if (hits > best) {
        best = hits;
        email = col;
      }
    });
  }
  let name = lower.findIndex((h, i) => i !== email && /^(full\s*)?name$/.test(h));
  if (name < 0) name = lower.findIndex((h, i) => i !== email && /name/.test(h));
  return { email: Math.max(email, 0), name: name < 0 ? null : name };
}

/** The chosen columns of each data row. */
export function pickColumns(sheet: Sheet, emailCol: number, nameCol: number | null): Array<{ email: string; name: string }> {
  return sheet.rows.map((row) => ({ email: row[emailCol] ?? '', name: nameCol === null ? '' : row[nameCol] ?? '' }));
}

/** Normalises, validates and de-duplicates rows. The first row for an address wins. */
export function cleanRows(input: unknown): CleanedRows {
  const rows: ImportRow[] = [];
  const seen = new Set<string>();
  let invalid = 0;
  let duplicates = 0;
  for (const item of Array.isArray(input) ? input : []) {
    const fields = (item ?? {}) as { email?: unknown; name?: unknown };
    const email = typeof fields.email === 'string' ? extractEmail(fields.email) : '';
    if (!isValidEmail(email)) {
      invalid++;
      continue;
    }
    if (seen.has(email)) {
      duplicates++;
      continue;
    }
    seen.add(email);
    // Cut by characters, not UTF-16 units, so an emoji is never split in half.
    const name = typeof fields.name === 'string' ? Array.from(fields.name.trim()).slice(0, LIMITS.name).join('') : '';
    rows.push({ email, name: name || null });
  }
  return { rows, invalid, duplicates };
}

export function chunk<T>(items: T[], size = IMPORT_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
```

Create `lib/newsletter/read-spreadsheet.ts`:

```ts
// Reads an uploaded CSV or Excel file into a grid of cell text, in the
// browser. SheetJS loads only when someone imports a file.

/** Files over this are refused before they're read. */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export async function readSpreadsheet(file: File): Promise<string[][]> {
  if (file.size > MAX_IMPORT_BYTES) throw new Error('This file is over 5 MB. Split it into smaller files.');
  const isCsv = /\.csv$/i.test(file.name);
  if (!isCsv && !/\.xlsx$/i.test(file.name)) throw new Error('Choose a .csv or .xlsx file.');

  const XLSX = await import('xlsx');
  const workbook = isCsv
    ? // Read CSV as text: the browser decodes UTF-8, so Hindi and Telugu names survive.
      XLSX.read(await file.text(), { type: 'string', raw: true })
    : XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
  const first = workbook.SheetNames[0];
  if (!first) return [];
  return XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[first], {
    header: 1,
    raw: false,
    defval: '',
    blankrows: false,
  });
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run tests/vitest/lib/newsletter/import.test.ts tests/vitest/lib/newsletter/read-spreadsheet.test.ts`
Expected: PASS.

If the CSV test shows mangled Telugu or Hindi text, the CSV is being read as bytes, not text. Check that the `isCsv` branch passes `await file.text()` with `type: 'string'`.

- [ ] **Step 6: Run the whole suite**

Run: `npx vitest run`
Expected: the 7 known failures only (`Header.test.tsx` 1, `pages/contact.test.tsx` 6), and everything else passes. A new failure that mentions `xlsx` means the upgrade broke something. Show it to the user before going on.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json lib/newsletter/import.ts lib/newsletter/read-spreadsheet.ts tests/vitest/lib/newsletter/import.test.ts tests/vitest/lib/newsletter/read-spreadsheet.test.ts
git commit -m "feat(newsletter): spreadsheet import rules; SheetJS 0.20.3 from its CDN" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: The admin subscribers function

`/api/admin-newsletter-subscribers` serves the Subscribers screen. It lists and counts subscribers, exports them as CSV, imports a chunk, syncs, unsubscribes and deletes (spec §8.2, §11). Every call needs the admin JWT. Imports, exports, unsubscribes and deletes are written to `admin_audit_log`. A delete records the subscriber's id, never their address.

**Files:**
- Create: `netlify/functions/_shared/newsletter-admin.mts`
- Create: `netlify/functions/admin-newsletter-subscribers.mts`
- Modify: `netlify.toml`
- Test: `tests/vitest/functions/newsletter/admin.test.ts`

**Interfaces:**
- **Consumes:**
  - `NewsletterDeps`, `SubscriberFilters`, `AdminUser` (Task 5);
  - `runSync`, `pushAndRecord`, `SYNC_TIME_BUDGET_MS` (Task 6);
  - `cleanRows`, `IMPORT_CHUNK` (Task 9);
  - `hashEmail` (Task 3);
  - `jsonResponse`, `corsHeaders`, `preflight`, `readJsonBody`, `clientIp` (Task 7).
- **Produces:**
  - `handleAdminSubscribers(req, deps): Promise<Response>`
  - `csvCell(value)`, `toCsv(rows)`, `CSV_COLUMNS`
  - The API, used by Task 14:

| Request | Body | Response |
|---|---|---|
| `GET ?q=&status=&source=&limit=&offset=` | — | `{ subscribers: AdminSubscriber[], total, counts: {pending, subscribed, unsubscribed}, needs_push, limit, offset }` |
| `GET ?format=csv&q=&status=&source=` | — | `text/csv` with a BOM |
| `POST ?action=import` | `{ batch_id, statement, attested: true, rows: [{ email, name }] }` (≤ 200 rows) | `{ inserted, skipped_existing, skipped_erased, invalid, duplicates }` |
| `POST ?action=sync` | `{ pull: boolean }` | `SyncReport` |
| `PATCH ?id=` | — | `{ subscriber, resend: 'updated' \| 'queued' }`, or `409` unless the row is `subscribed` |
| `DELETE ?id=` | — | `{ ok: true }`, or `502` (the row is kept) if Resend can't delete the contact |

- [ ] **Step 1: Write the failing tests**

Create `tests/vitest/functions/newsletter/admin.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { handleAdminSubscribers } from '@/netlify/functions/_shared/newsletter-admin.mts';
import { hashEmail } from '@/netlify/functions/_shared/newsletter-crypto.mts';
import type { NewsletterDeps } from '@/netlify/functions/_shared/newsletter-deps.mts';
import { ADMIN_EMAIL, ADMIN_TOKEN, SEGMENT, jsonRequest, makeDeps } from './fakes';

const BASE = 'https://hopetrustindia.com/api/admin-newsletter-subscribers';
const AUTH = { authorization: `Bearer ${ADMIN_TOKEN}` };
const BATCH = '2f1c7c1e-3f5a-4a52-9a0e-6c1f3b9d2a10';
const STATEMENT = 'Clients who ticked the newsletter box on the intake form, 2025–26';

function call(deps: NewsletterDeps, method: string, query = '', body?: unknown) {
  return handleAdminSubscribers(jsonRequest(`${BASE}${query}`, method, body, AUTH), deps);
}

const importBody = (rows: Array<{ email: string; name?: string | null }>) => ({
  batch_id: BATCH,
  statement: STATEMENT,
  attested: true,
  rows,
});

describe('admin-newsletter-subscribers', () => {
  it('needs an admin token', async () => {
    const { deps } = makeDeps();
    expect((await handleAdminSubscribers(new Request(BASE), deps)).status).toBe(401);
    expect((await handleAdminSubscribers(new Request(BASE, { method: 'OPTIONS' }), deps)).status).toBe(204);
    expect((await call(null as unknown as NewsletterDeps, 'GET')).status).toBe(500);
  });

  it('lists subscribers newest first, without the confirmation token, with counts', async () => {
    const { deps, memory, clock } = makeDeps();
    memory.seed({ email: 'old@example.com', status: 'pending', confirm_token_hash: 'f'.repeat(64) });
    clock.advance(1000);
    memory.seed({ email: 'mid@example.com', status: 'subscribed' });
    clock.advance(1000);
    memory.seed({ email: 'new@example.com', status: 'unsubscribed' });

    const res = await call(deps, 'GET');
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.subscribers.map((s: { email: string }) => s.email)).toEqual(['new@example.com', 'mid@example.com', 'old@example.com']);
    expect(body.subscribers[2]).not.toHaveProperty('confirm_token_hash');
    expect(body).toMatchObject({ total: 3, counts: { pending: 1, subscribed: 1, unsubscribed: 1 }, needs_push: 2, limit: 25, offset: 0 });
  });

  it('filters by status, source and search, and caps the page size at 100', async () => {
    const { deps, memory } = makeDeps();
    memory.seed({ email: 'asha@example.com', full_name: 'Asha Rao', source: 'import' });
    memory.seed({ email: 'ravi@example.com', status: 'unsubscribed' });
    const emails = async (query: string) =>
      (await (await call(deps, 'GET', query)).json()).subscribers.map((s: { email: string }) => s.email);
    expect(await emails('?status=unsubscribed')).toEqual(['ravi@example.com']);
    expect(await emails('?source=import')).toEqual(['asha@example.com']);
    expect(await emails('?q=asha%20rao')).toEqual(['asha@example.com']);
    expect(await emails('?status=bogus')).toHaveLength(2);
    expect((await (await call(deps, 'GET', '?limit=500')).json()).limit).toBe(100);
  });

  it('exports a formula-safe CSV that Excel reads as UTF-8', async () => {
    const { deps, memory } = makeDeps();
    memory.seed({ email: 'x@example.com', full_name: '=HYPERLINK("http://x","click")' });
    memory.seed({ email: 'ravi@example.com', full_name: 'రవి' });

    const res = await call(deps, 'GET', '?format=csv');
    const bytes = new Uint8Array(await res.arrayBuffer());
    const text = new TextDecoder().decode(bytes);
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename="newsletter-subscribers-\d{4}-\d{2}-\d{2}\.csv"$/);
    const lines = text.trim().split('\r\n');
    expect(lines[0]).toBe(
      'email,full_name,status,source,consent_at,consent_note,imported_by,import_batch_id,signup_page,signup_ip,signup_user_agent,signup_notice,unsubscribed_at,unsubscribe_source,created_at',
    );
    expect(lines[1]).toContain(`"'=HYPERLINK(""http://x"",""click"")"`);
    expect(lines[2]).toContain('రవి');
    expect(memory.audits).toEqual([expect.objectContaining({ action: 'NEWSLETTER_EXPORT', actorEmail: ADMIN_EMAIL, metadata: expect.objectContaining({ rows: 2 }) })]);
  });

  it('imports new addresses as subscribed, with the consent evidence', async () => {
    const { deps, memory } = makeDeps();
    const res = await call(deps, 'POST', '?action=import', importBody([
      { email: ' Asha@Example.com ', name: 'Asha Rao' },
      { email: 'not-an-email' },
      { email: 'asha@example.com', name: 'Asha again' },
      { email: 'Ravi <ravi@example.com>', name: 'రవి' },
    ]));
    expect(await res.json()).toEqual({ inserted: 2, skipped_existing: 0, skipped_erased: 0, invalid: 1, duplicates: 1 });
    expect(memory.byEmail('asha@example.com')).toMatchObject({
      status: 'subscribed',
      source: 'import',
      full_name: 'Asha Rao',
      consent_at: deps.now().toISOString(),
      consent_note: STATEMENT,
      imported_by: ADMIN_EMAIL,
      import_batch_id: BATCH,
      resend_synced_at: null,
    });
    expect(memory.audits[0]).toMatchObject({ action: 'NEWSLETTER_IMPORT', metadata: expect.objectContaining({ batch_id: BATCH, inserted: 2 }) });
  });

  it('never changes rows that already exist, whatever their status, and skips erased addresses', async () => {
    const { deps, memory } = makeDeps();
    memory.seed({ email: 'left@example.com', status: 'unsubscribed', consent_note: 'Old consent' });
    memory.seed({ email: 'on@example.com', status: 'subscribed' });
    memory.erased.add(hashEmail('gone@example.com'));
    const rows = [{ email: 'left@example.com' }, { email: 'on@example.com' }, { email: 'gone@example.com' }, { email: 'new@example.com' }];

    expect(await (await call(deps, 'POST', '?action=import', importBody(rows))).json()).toEqual({
      inserted: 1, skipped_existing: 2, skipped_erased: 1, invalid: 0, duplicates: 0,
    });
    expect(memory.byEmail('left@example.com')).toMatchObject({ status: 'unsubscribed', consent_note: 'Old consent' });
    expect(memory.byEmail('gone@example.com')).toBeUndefined();

    // The same file again changes nothing.
    expect(await (await call(deps, 'POST', '?action=import', importBody(rows))).json()).toMatchObject({ inserted: 0, skipped_existing: 3 });
  });

  it('refuses an import without a statement, the tick or a batch id, or with too many rows', async () => {
    const { deps } = makeDeps();
    const rows = [{ email: 'a@example.com' }];
    const refused = async (body: unknown) => (await call(deps, 'POST', '?action=import', body)).status;
    expect(await refused({ ...importBody(rows), statement: 'short' })).toBe(400);
    expect(await refused({ ...importBody(rows), attested: false })).toBe(400);
    expect(await refused({ ...importBody(rows), batch_id: 'nope' })).toBe(400);
    expect(await refused(importBody(Array.from({ length: 201 }, (_, i) => ({ email: `p${i}@example.com` }))))).toBe(400);
    const res = await call(deps, 'POST', '?action=import', { ...importBody(rows), attested: false });
    expect((await res.json()).error).toBe('Tick the box to confirm everyone agreed.');
  });

  it('syncs, reading Resend only when asked', async () => {
    const { deps, resend, memory } = makeDeps();
    memory.seed({ email: 'a@example.com' });
    const report = await (await call(deps, 'POST', '?action=sync', { pull: false })).json();
    expect(report).toMatchObject({ pushed: 1, remaining: 0 });
    expect(resend.calls).not.toContain('listSegmentContacts');
    await call(deps, 'POST', '?action=sync', { pull: true });
    expect(resend.calls).toContain('listSegmentContacts');
  });

  it('unsubscribes a subscribed person here and in Resend at once', async () => {
    const { deps, memory, resend } = makeDeps();
    const contact = resend.add('a@example.com', { segments: [SEGMENT] });
    const row = memory.seed({ email: 'a@example.com', resend_contact_id: contact.id, resend_synced_at: '2026-10-01T00:00:00.000Z' });

    const res = await call(deps, 'PATCH', `?id=${row.id}`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.resend).toBe('updated');
    expect(body.subscriber).toMatchObject({ status: 'unsubscribed', unsubscribe_source: 'admin', unsubscribed_at: deps.now().toISOString() });
    expect(body.subscriber).not.toHaveProperty('confirm_token_hash');
    expect(contact.unsubscribed).toBe(true);
    expect(memory.audits[0]).toMatchObject({ action: 'NEWSLETTER_UNSUBSCRIBE', resourceId: row.id });
  });

  it('unsubscribes only subscribed people, by a valid id', async () => {
    const { deps, memory } = makeDeps();
    const pending = memory.seed({ email: 'p@example.com', status: 'pending' });
    expect((await call(deps, 'PATCH', `?id=${pending.id}`)).status).toBe(409);
    expect((await call(deps, 'PATCH', '?id=7d0f6b1c-1111-4222-8333-944455556666')).status).toBe(404);
    expect((await call(deps, 'PATCH', '?id=abc')).status).toBe(400);
  });

  it('deletes a person: the Resend contact first, then the row, keeping only a hash', async () => {
    const { deps, memory, resend } = makeDeps();
    const contact = resend.add('a@example.com', { segments: [SEGMENT] });
    const row = memory.seed({ email: 'a@example.com', resend_contact_id: contact.id });

    expect((await call(deps, 'DELETE', `?id=${row.id}`)).status).toBe(200);
    expect(memory.get(row.id)).toBeUndefined();
    expect(resend.contacts.has(contact.id)).toBe(false);
    expect(memory.erased.has(hashEmail('a@example.com'))).toBe(true);
    expect(memory.audits[0]).toMatchObject({ action: 'NEWSLETTER_DELETE', resourceId: row.id });
    expect(JSON.stringify(memory.audits)).not.toContain('a@example.com');
  });

  it('keeps the row when Resend cannot delete the contact', async () => {
    const { deps, memory, resend } = makeDeps();
    const row = memory.seed({ email: 'a@example.com' });
    resend.failNext('deleteContact');
    const res = await call(deps, 'DELETE', `?id=${row.id}`);
    expect(res.status).toBe(502);
    expect(memory.get(row.id)).toBeDefined();
    expect(memory.erased.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/vitest/functions/newsletter/admin.test.ts`
Expected: FAIL. The module doesn't exist.

- [ ] **Step 3: Write the handler**

Create `netlify/functions/_shared/newsletter-admin.mts`:

```ts
// /api/admin-newsletter-subscribers: the Subscribers screen's API (spec §8.2,
// §11). Admin JWT required. Imports, exports, unsubscribes and deletes go to
// admin_audit_log; a delete records the subscriber id, never the address.

import { z } from 'zod';
import { IMPORT_CHUNK, cleanRows } from '../../../lib/newsletter/import';
import {
  LIMITS,
  SUBSCRIBER_SOURCES,
  SUBSCRIBER_STATUSES,
  type AdminSubscriber,
  type SubscriberRow,
  type SubscriberSource,
  type SubscriberStatus,
} from '../../../lib/newsletter/subscriber';
import type { AdminUser } from './admin.mts';
import { clientIp, corsHeaders, jsonResponse, preflight, readJsonBody } from './http.mts';
import { hashEmail } from './newsletter-crypto.mts';
import type { SubscriberFilters } from './newsletter-db.mts';
import type { NewsletterDeps } from './newsletter-deps.mts';
import { SYNC_TIME_BUDGET_MS, pushAndRecord, runSync } from './newsletter-sync.mts';

const METHODS = 'GET, POST, PATCH, DELETE, OPTIONS';
const MAX_BODY_BYTES = 256 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

export const CSV_COLUMNS = [
  'email', 'full_name', 'status', 'source', 'consent_at', 'consent_note', 'imported_by', 'import_batch_id',
  'signup_page', 'signup_ip', 'signup_user_agent', 'signup_notice', 'unsubscribed_at', 'unsubscribe_source', 'created_at',
] as const;

/**
 * One CSV cell. Text starting with = + - @ (or a tab or carriage return) gets
 * a leading ' so Excel shows it instead of running it as a formula: names
 * come from the public.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** CSV with a UTF-8 byte-order mark, so Excel shows Hindi and Telugu names. */
export function toCsv(rows: AdminSubscriber[]): string {
  const lines = [CSV_COLUMNS.join(',')];
  for (const row of rows) lines.push(CSV_COLUMNS.map((column) => csvCell(row[column])).join(','));
  return `﻿${lines.join('\r\n')}\r\n`;
}

function toAdmin(row: SubscriberRow): AdminSubscriber {
  const { confirm_token_hash: _hash, confirm_token_expires_at: _expires, ...rest } = row;
  return rest;
}

function filtersFrom(params: URLSearchParams): SubscriberFilters {
  const status = params.get('status') ?? '';
  const source = params.get('source') ?? '';
  return {
    q: (params.get('q') ?? '').slice(0, 100),
    status: (SUBSCRIBER_STATUSES as readonly string[]).includes(status) ? (status as SubscriberStatus) : '',
    source: (SUBSCRIBER_SOURCES as readonly string[]).includes(source) ? (source as SubscriberSource) : '',
  };
}

const importSchema = z.object({
  batch_id: z.string().regex(UUID, 'The import is missing its batch id. Reload the page and try again.'),
  statement: z
    .string()
    .trim()
    .min(10, 'Say where and when these people agreed (at least 10 characters).')
    .max(LIMITS.statement, 'Please shorten the statement to 500 characters.'),
  attested: z.literal(true, { errorMap: () => ({ message: 'Tick the box to confirm everyone agreed.' }) }),
  rows: z
    .array(z.object({ email: z.string().max(1000), name: z.string().max(1000).nullable().optional() }))
    .min(1, 'There are no rows to import.')
    .max(IMPORT_CHUNK, `Send at most ${IMPORT_CHUNK} rows at a time.`),
});

interface Ctx {
  req: Request;
  deps: NewsletterDeps;
  admin: AdminUser;
  params: URLSearchParams;
  reply: (body: unknown, status?: number) => Response;
}

export async function handleAdminSubscribers(req: Request, deps: NewsletterDeps | null): Promise<Response> {
  const reply = (body: unknown, status = 200) => jsonResponse(body, status, METHODS);
  if (req.method === 'OPTIONS') return preflight(METHODS);
  if (!deps) return reply({ error: 'Server misconfiguration' }, 500);
  const admin = deps.verifyAdmin(req);
  if (!admin) return reply({ error: 'Unauthorized' }, 401);

  const params = new URL(req.url).searchParams;
  const ctx: Ctx = { req, deps, admin, params, reply };
  try {
    if (req.method === 'GET') return params.get('format') === 'csv' ? await exportCsv(ctx) : await list(ctx);
    if (req.method === 'POST' && params.get('action') === 'import') return await importRows(ctx);
    if (req.method === 'POST' && params.get('action') === 'sync') return await sync(ctx);
    if (req.method === 'PATCH') return await unsubscribe(ctx);
    if (req.method === 'DELETE') return await erase(ctx);
    return reply({ error: 'Method not allowed' }, 405);
  } catch (err) {
    console.error('[admin-newsletter-subscribers]', err);
    return reply({ error: 'Something went wrong. Please try again.' }, 500);
  }
}

async function list({ deps, params, reply }: Ctx): Promise<Response> {
  const limit = Math.min(Math.max(parseInt(params.get('limit') ?? '', 10) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const offset = Math.max(parseInt(params.get('offset') ?? '', 10) || 0, 0);
  const [{ rows, total }, counts, needsPush] = await Promise.all([
    deps.db.list(filtersFrom(params), limit, offset),
    deps.db.counts(),
    deps.db.countToPush(),
  ]);
  return reply({ subscribers: rows, total, counts, needs_push: needsPush, limit, offset });
}

async function exportCsv({ req, deps, admin, params }: Ctx): Promise<Response> {
  const filters = filtersFrom(params);
  const rows = await deps.db.listAll(filters);
  await deps.db.audit({
    action: 'NEWSLETTER_EXPORT',
    actorEmail: admin.email,
    metadata: { rows: rows.length, ...filters },
    ip: clientIp(req),
  });
  return new Response(toCsv(rows), {
    status: 200,
    headers: {
      ...corsHeaders(METHODS),
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="newsletter-subscribers-${deps.now().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}

async function importRows({ req, deps, admin, reply }: Ctx): Promise<Response> {
  const body = await readJsonBody(req, MAX_BODY_BYTES);
  if (!body.ok) return reply({ error: body.error }, body.status);
  const parsed = importSchema.safeParse(body.value);
  if (!parsed.success) return reply({ error: parsed.error.issues[0]?.message ?? 'Invalid import' }, 400);
  const { batch_id, statement, rows } = parsed.data;

  const cleaned = cleanRows(rows);
  const existing = await deps.db.existingEmails(cleaned.rows.map((r) => r.email));
  const fresh = cleaned.rows.filter((r) => !existing.has(r.email));
  const hashes = new Map(fresh.map((r) => [r.email, hashEmail(r.email)]));
  const erased = await deps.db.erasedHashes([...hashes.values()]);
  const allowed = fresh.filter((r) => !erased.has(hashes.get(r.email) as string));

  const now = deps.now().toISOString();
  const inserted = await deps.db.insertImported(
    allowed.map((r) => ({
      email: r.email,
      full_name: r.name,
      status: 'subscribed' as const,
      source: 'import' as const,
      consent_at: now,
      consent_note: statement,
      imported_by: admin.email,
      import_batch_id: batch_id,
    })),
  );
  const result = {
    inserted,
    // Rows that another import added in the meantime count as already there.
    skipped_existing: existing.size + (allowed.length - inserted),
    skipped_erased: fresh.length - allowed.length,
    invalid: cleaned.invalid,
    duplicates: cleaned.duplicates,
  };
  await deps.db.audit({
    action: 'NEWSLETTER_IMPORT',
    actorEmail: admin.email,
    metadata: { batch_id, ...result },
    ip: clientIp(req),
  });
  return reply(result);
}

async function sync({ req, deps, reply }: Ctx): Promise<Response> {
  const body = await readJsonBody(req, MAX_BODY_BYTES);
  const pull = !(body.ok && (body.value as { pull?: unknown } | null)?.pull === false);
  try {
    return reply(await runSync(deps, { pull, deadline: deps.now().getTime() + SYNC_TIME_BUDGET_MS }));
  } catch (err) {
    console.error('[admin-newsletter-subscribers] sync', err);
    return reply({ error: `Couldn't reach Resend: ${err instanceof Error ? err.message : 'unknown error'}` }, 502);
  }
}

async function unsubscribe({ req, deps, admin, params, reply }: Ctx): Promise<Response> {
  const id = params.get('id') ?? '';
  if (!UUID.test(id)) return reply({ error: 'A valid id is required' }, 400);
  const row = await deps.db.findById(id);
  if (!row) return reply({ error: 'Subscriber not found' }, 404);
  if (row.status !== 'subscribed') return reply({ error: 'Only subscribed people can be unsubscribed.' }, 409);

  const updated = await deps.db.update(
    id,
    { status: 'unsubscribed', unsubscribed_at: deps.now().toISOString(), unsubscribe_source: 'admin', resend_synced_at: null },
    row.updated_at,
  );
  if (!updated) return reply({ error: 'This subscriber just changed. Refresh and try again.' }, 409);
  await deps.db.audit({ action: 'NEWSLETTER_UNSUBSCRIBE', actorEmail: admin.email, resourceId: id, ip: clientIp(req) });

  // Tell Resend now. If that fails, the row stays queued for the next sync.
  const sent = await pushAndRecord(deps, updated).catch((err) => {
    console.error('[admin-newsletter-subscribers] Resend', err);
    return false;
  });
  const latest = (await deps.db.findById(id)) ?? updated;
  return reply({ subscriber: toAdmin(latest), resend: sent ? 'updated' : 'queued' });
}

async function erase({ req, deps, admin, params, reply }: Ctx): Promise<Response> {
  const id = params.get('id') ?? '';
  if (!UUID.test(id)) return reply({ error: 'A valid id is required' }, 400);
  const row = await deps.db.findById(id);
  if (!row) return reply({ error: 'Subscriber not found' }, 404);

  // Resend first: if this fails the row stays, so the delete can be retried
  // and the person never sits in the segment with no row behind them.
  try {
    const removed = row.resend_contact_id ? await deps.resend.deleteContact(row.resend_contact_id) : false;
    if (!removed) await deps.resend.deleteContact(row.email);
  } catch (err) {
    console.error('[admin-newsletter-subscribers] Resend delete', err);
    return reply({ error: "Couldn't remove this person from Resend, so nothing was deleted. Try again in a minute." }, 502);
  }

  await deps.db.erase(id, hashEmail(row.email));
  await deps.db.audit({
    action: 'NEWSLETTER_DELETE',
    actorEmail: admin.email,
    resourceId: id,
    metadata: { status: row.status, source: row.source },
    ip: clientIp(req),
  });
  return reply({ ok: true });
}
```

Create `netlify/functions/admin-newsletter-subscribers.mts`:

```ts
// /api/admin-newsletter-subscribers: list, export, import, sync, unsubscribe
// and delete newsletter subscribers (spec §8.2, §11). Admin JWT required.
import { liveDeps } from './_shared/newsletter-deps.mts';
import { handleAdminSubscribers } from './_shared/newsletter-admin.mts';

export default (req: Request) => handleAdminSubscribers(req, liveDeps());
```

In `netlify.toml`, add below the `/api/newsletter-confirm` redirect:

```toml
[[redirects]]
  from = "/api/admin-newsletter-subscribers"
  to = "/.netlify/functions/admin-newsletter-subscribers"
  status = 200
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run tests/vitest/functions/newsletter/`
Expected: PASS.

- [ ] **Step 5: Check that Netlify bundles all three functions**

Plan 1 checked this for one test function. The new functions import more (`zod`, `jsonwebtoken`, `@supabase/supabase-js` and `lib/newsletter/*`), so check the real ones:

```bash
OUT="$(mktemp -d)"
npx netlify functions:build --src netlify/functions --functions "$OUT" 2>&1 | tail -5
ls "$OUT" | grep -E "newsletter"
rm -rf "$OUT"
```

Expected:
- the build finishes without errors;
- three artifacts are listed: `admin-newsletter-subscribers`, `newsletter-confirm` and `newsletter-subscribe` (as `.zip` files or folders);
- there is no `_shared` artifact.

- [ ] **Step 6: Commit**

```bash
git add netlify/functions/_shared/newsletter-admin.mts netlify/functions/admin-newsletter-subscribers.mts netlify.toml tests/vitest/functions/newsletter/admin.test.ts
git commit -m "feat(newsletter): admin subscribers API: list, export, import, sync, unsubscribe, delete" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 11: The sign-up form, in three places

The old form wrote straight to Supabase with the public key and asked for a phone number. It told people "You're already subscribed!", which revealed whether an address was on a mental-health mailing list. The new form posts to `/api/newsletter-subscribe` and shows everyone the same message. It goes in three places (spec §7.1):

- **Footer:** a button on every page that opens the form in a dialog.
- **Blog listing:** the call-out removed in August, back with corrected copy. The old copy promised "weekly" articles.
- **Homepage card:** `LargeRectangleSection`, switched back on with the spec's sentence. Hope Trust can change the sentence.

**Files:**
- Rewrite: `components/NewsletterForm.tsx`
- Create: `components/NewsletterDialogButton.tsx`
- Modify: `components/Footer.tsx`, `components/BlogListClient.tsx`, `components/LargeRectangleSection.tsx`, `app/page.tsx`
- Test: `tests/vitest/components/NewsletterForm.test.tsx`
- Test: `tests/vitest/components/NewsletterDialogButton.test.tsx`
- Test: `tests/vitest/components/LargeRectangleSection.test.tsx`
- Modify test: `tests/vitest/components/Footer.test.tsx`
- Create: `tests/e2e/newsletter.spec.ts`

**Interfaces:**
- **Consumes:**
  - From Task 3: `SIGNUP_NOTICE`, `SIGNUP_SUCCESS_MESSAGE`, `nameSchema`, `emailSchema`.
  - The endpoint `POST /api/newsletter-subscribe` (Task 7). It answers 200 `{ ok, message }`, 400 `{ error, fields }`, or 429/5xx `{ error }`.
- **Produces:**
  - `<NewsletterForm variant="inline" | "card" dark? className? />`
  - `<NewsletterDialogButton className? />`

- [ ] **Step 1: Write the failing component tests**

Create `tests/vitest/components/NewsletterForm.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SIGNUP_NOTICE, SIGNUP_SUCCESS_MESSAGE } from '@/lib/newsletter/subscriber';
import NewsletterForm from '@/components/NewsletterForm';

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string } & Record<string, unknown>) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

const fetchMock = vi.fn();
const reply = (status: number, body: unknown) => ({ ok: status < 300, status, json: async () => body });

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

async function fillAndSubmit(name = 'Asha Rao', email = 'asha@example.com') {
  const user = userEvent.setup();
  if (name) await user.type(screen.getByLabelText('Full name'), name);
  if (email) await user.type(screen.getByLabelText('Email address'), email);
  await user.click(screen.getByRole('button', { name: 'Subscribe' }));
}

describe('NewsletterForm', () => {
  it('checks the fields before sending anything', async () => {
    render(<NewsletterForm />);
    await fillAndSubmit('', '');
    expect(screen.getByText('Please enter your full name')).toBeInTheDocument();
    expect(screen.getByText('Please enter your email address')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the name, email, page and notice version, then asks the person to check their inbox', async () => {
    fetchMock.mockResolvedValue(reply(200, { ok: true, message: SIGNUP_SUCCESS_MESSAGE }));
    render(<NewsletterForm variant="inline" />);
    await fillAndSubmit();

    expect(await screen.findByRole('status')).toHaveTextContent(SIGNUP_SUCCESS_MESSAGE);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/newsletter-subscribe');
    expect(JSON.parse(init.body)).toEqual({
      full_name: 'Asha Rao',
      email: 'asha@example.com',
      website: '',
      page: '/',
      notice: SIGNUP_NOTICE.version,
    });
  });

  it('shows the field errors the server sends back', async () => {
    fetchMock.mockResolvedValue(reply(400, { error: 'Please check the form.', fields: { email: 'Please enter a valid email address' } }));
    render(<NewsletterForm />);
    await fillAndSubmit();
    expect(await screen.findByText('Please enter a valid email address')).toBeInTheDocument();
  });

  it('shows the server\'s message when it refuses, such as too many sign-ups', async () => {
    fetchMock.mockResolvedValue(reply(429, { error: 'Too many sign-ups from your connection. Please try again in a few minutes.' }));
    render(<NewsletterForm />);
    await fillAndSubmit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many sign-ups from your connection.');
  });

  it('says so when the server cannot be reached', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    render(<NewsletterForm />);
    await fillAndSubmit();
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't reach/i);
  });

  it('shows the notice, with a link to the privacy policy', () => {
    render(<NewsletterForm />);
    expect(screen.getByText(SIGNUP_NOTICE.text, { exact: false })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Privacy policy' })).toHaveAttribute('href', '/privacy-policy/#newsletter');
  });

  it('keeps the bot trap away from people and screen readers', () => {
    const { container } = render(<NewsletterForm />);
    const trap = container.querySelector('input[name="website"]') as HTMLInputElement;
    expect(trap.tabIndex).toBe(-1);
    expect(trap.closest('[aria-hidden="true"]')).not.toBeNull();
  });
});
```

Create `tests/vitest/components/NewsletterDialogButton.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NewsletterDialogButton from '@/components/NewsletterDialogButton';

vi.mock('motion/react', () => ({
  motion: {
    div: ({
      children,
      initial: _initial,
      animate: _animate,
      exit: _exit,
      transition: _transition,
      ...props
    }: Record<string, unknown> & { children?: React.ReactNode }) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string } & Record<string, unknown>) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

describe('NewsletterDialogButton', () => {
  it('opens the sign-up form in a dialog and puts focus in the first field', async () => {
    render(<NewsletterDialogButton />);
    await userEvent.click(screen.getByRole('button', { name: 'Subscribe to our newsletter' }));
    expect(screen.getByRole('dialog', { name: 'Subscribe to our newsletter' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Full name')).toHaveFocus());
  });

  it('closes on Escape and gives focus back to the button', async () => {
    render(<NewsletterDialogButton />);
    const button = screen.getByRole('button', { name: 'Subscribe to our newsletter' });
    await userEvent.click(button);
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(button).toHaveFocus();
  });

  it('closes when the backdrop is clicked, but not when the form is', async () => {
    render(<NewsletterDialogButton />);
    await userEvent.click(screen.getByRole('button', { name: 'Subscribe to our newsletter' }));
    fireEvent.mouseDown(screen.getByLabelText('Full name'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByTestId('newsletter-backdrop'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
```

Create `tests/vitest/components/LargeRectangleSection.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import LargeRectangleSection from '@/components/LargeRectangleSection';

vi.mock('next/font/google', () => ({
  Bricolage_Grotesque: () => ({ className: 'mock-font' }),
  Roboto_Flex: () => ({ className: 'mock-font' }),
}));
vi.mock('next/image', () => ({ default: ({ alt }: { alt: string }) => <img alt={alt} /> }));
vi.mock('@/lib/assets', () => ({ getAssetUrl: (path: string) => `/mock/${path}` }));
vi.mock('@/components/VariableProximity', () => ({ default: ({ label }: { label: string }) => <span>{label}</span> }));
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string } & Record<string, unknown>) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

describe('LargeRectangleSection (homepage newsletter card)', () => {
  it('describes the monthly newsletter and carries the sign-up form', () => {
    render(<LargeRectangleSection />);
    expect(screen.getByText('A monthly letter from our team, with ideas you can use between sessions.')).toBeInTheDocument();
    expect(screen.queryByText(/Connect with others, share experiences/)).toBeNull();
    expect(screen.getByLabelText('Email address')).toBeInTheDocument();
  });
});
```

In `tests/vitest/components/Footer.test.tsx`, add inside `describe('Footer', …)`:

```tsx
  it('offers the newsletter sign-up', () => {
    render(<Footer />);
    expect(screen.getByRole('button', { name: 'Subscribe to our newsletter' })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/vitest/components/NewsletterForm.test.tsx tests/vitest/components/NewsletterDialogButton.test.tsx tests/vitest/components/LargeRectangleSection.test.tsx tests/vitest/components/Footer.test.tsx`
Expected: FAIL. There's no dialog component, the old form has no labels, and the homepage card still has the old sentence and no form.

- [ ] **Step 3: Rewrite the form**

Replace the whole of `components/NewsletterForm.tsx` with:

```tsx
'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { SIGNUP_NOTICE, SIGNUP_SUCCESS_MESSAGE, emailSchema, nameSchema } from '@/lib/newsletter/subscriber';

type Field = 'full_name' | 'email';
type Errors = Partial<Record<Field, string>>;

interface NewsletterFormProps {
  /** inline: one row (blog listing, homepage card). card: stacked (footer dialog, confirm page). */
  variant?: 'inline' | 'card';
  className?: string;
  /** Light text, for dark backgrounds. */
  dark?: boolean;
}

function check(values: { full_name: string; email: string }): Errors {
  const errors: Errors = {};
  const name = nameSchema.safeParse(values.full_name);
  if (!name.success) errors.full_name = name.error.issues[0].message;
  const email = emailSchema.safeParse(values.email);
  if (!email.success) errors.email = email.error.issues[0].message;
  return errors;
}

/**
 * Newsletter sign-up (spec §7.1). Everyone who gets past validation sees the
 * same message, so the form never shows whether an address is on the list.
 */
export default function NewsletterForm({ variant = 'card', className = '', dark = false }: NewsletterFormProps) {
  const id = useId();
  const [values, setValues] = useState({ full_name: '', email: '', website: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  const update = (field: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setValues((current) => ({ ...current, [field]: e.target.value }));
    if (field !== 'website') setErrors((current) => ({ ...current, [field]: undefined }));
  };

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError('');
    const found = check(values);
    setErrors(found);
    if (found.full_name || found.email) return;

    setSending(true);
    try {
      const res = await fetch('/api/newsletter-subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: values.full_name,
          email: values.email,
          website: values.website,
          page: window.location.pathname,
          notice: SIGNUP_NOTICE.version,
        }),
      });
      if (res.ok) {
        setDone(true);
        return;
      }
      const body = await res.json().catch(() => ({}));
      if (res.status === 400 && body.fields) {
        setErrors(body.fields);
        return;
      }
      setFormError(body.error || 'Something went wrong. Please try again.');
    } catch {
      setFormError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  const text = dark ? 'text-white' : 'text-[#00373E]';
  const muted = dark ? 'text-white/70' : 'text-[#00373E]/70';

  if (done) {
    return (
      <div role="status" className={`flex items-start gap-3 ${className}`}>
        <CheckCircle2 aria-hidden="true" className={`mt-0.5 h-5 w-5 flex-shrink-0 ${dark ? 'text-emerald-300' : 'text-emerald-600'}`} />
        <div>
          <p className={`text-sm font-semibold ${text}`}>{SIGNUP_SUCCESS_MESSAGE}</p>
          <p className={`mt-1 text-xs ${muted}`}>If it isn&apos;t there in a few minutes, look in your spam or promotions folder.</p>
        </div>
      </div>
    );
  }

  const input = `w-full rounded-full border text-sm outline-none transition focus:border-[#ED7428] focus:ring-1 focus:ring-[#ED7428] ${
    dark ? 'border-white/20 bg-white/10 text-white placeholder:text-white/50' : 'border-gray-200 bg-white text-gray-800 placeholder:text-gray-400'
  } ${variant === 'inline' ? 'px-4 py-2.5' : 'px-5 py-3'}`;
  const errorText = `ml-4 mt-1 text-xs ${dark ? 'text-red-200' : 'text-red-600'}`;

  return (
    <form onSubmit={handleSubmit} noValidate className={`relative w-full ${className}`}>
      <div className={variant === 'inline' ? 'flex flex-col gap-2 sm:flex-row' : 'space-y-3'}>
        <div className="flex-1">
          <label htmlFor={`${id}-name`} className="sr-only">Full name</label>
          <input
            id={`${id}-name`}
            name="full_name"
            type="text"
            autoComplete="name"
            placeholder="Full name"
            value={values.full_name}
            onChange={update('full_name')}
            aria-invalid={errors.full_name ? true : undefined}
            aria-describedby={errors.full_name ? `${id}-name-error` : undefined}
            className={input}
          />
          {errors.full_name && <p id={`${id}-name-error`} className={errorText}>{errors.full_name}</p>}
        </div>
        <div className="flex-1">
          <label htmlFor={`${id}-email`} className="sr-only">Email address</label>
          <input
            id={`${id}-email`}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="Email address"
            value={values.email}
            onChange={update('email')}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? `${id}-email-error` : undefined}
            className={input}
          />
          {errors.email && <p id={`${id}-email-error`} className={errorText}>{errors.email}</p>}
        </div>
        {/* Bot trap: hidden from people and screen readers, so only bots fill it in. */}
        <div aria-hidden="true" className="absolute -left-[9999px] top-0 h-px w-px overflow-hidden">
          <label htmlFor={`${id}-website`}>Leave this empty</label>
          <input id={`${id}-website`} name="website" type="text" tabIndex={-1} autoComplete="off" value={values.website} onChange={update('website')} />
        </div>
        <button
          type="submit"
          disabled={sending}
          className={`flex-shrink-0 rounded-full bg-[#ED7428] text-sm font-semibold text-white shadow-md transition-colors hover:bg-[#d4631f] disabled:opacity-60 ${
            variant === 'inline' ? 'px-6 py-2.5' : 'w-full px-6 py-3'
          }`}
        >
          {sending ? <Loader2 className="mx-auto h-4 w-4 animate-spin" aria-label="Sending" /> : 'Subscribe'}
        </button>
      </div>
      {formError && (
        <p role="alert" className={`mt-2 text-sm ${dark ? 'text-red-200' : 'text-red-600'}`}>
          {formError}
        </p>
      )}
      <p className={`mt-3 text-xs leading-relaxed ${muted}`}>
        {SIGNUP_NOTICE.text}{' '}
        <Link href="/privacy-policy/#newsletter" className="underline underline-offset-2 hover:text-[#ED7428]">
          Privacy policy
        </Link>
      </p>
    </form>
  );
}
```

- [ ] **Step 4: Write the footer dialog**

Create `components/NewsletterDialogButton.tsx`:

```tsx
'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import NewsletterForm from '@/components/NewsletterForm';

/** The footer's "Subscribe to our newsletter" button and its dialog (spec §7.1). */
export default function NewsletterDialogButton({ className = '' }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);

  // Focus the first field on open; hand focus back to the button on close.
  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      const timer = setTimeout(
        () => dialogRef.current?.querySelector<HTMLInputElement>('input:not([tabindex="-1"])')?.focus(),
        50,
      );
      return () => clearTimeout(timer);
    }
    if (wasOpen.current) buttonRef.current?.focus();
  }, [open]);

  // While open: no page scrolling behind the dialog, and Escape closes it.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <>
      <button ref={buttonRef} type="button" onClick={() => setOpen(true)} className={className}>
        Subscribe to our newsletter
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            data-testid="newsletter-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
            onMouseDown={(e: React.MouseEvent) => {
              if (e.target === e.currentTarget) setOpen(false);
            }}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 0.61, 0.36, 1] }}
              className="relative w-full max-w-[460px] rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
            >
              <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="p-6 sm:p-8">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="absolute right-4 top-4 rounded-full p-2 text-[#00373E]/60 transition hover:bg-[#00373E]/5 hover:text-[#00373E]"
                >
                  <X className="h-5 w-5" />
                </button>
                <h2 id={titleId} className="pr-10 text-xl font-semibold text-[#00373E]">
                  Subscribe to our newsletter
                </h2>
                <p className="mb-5 mt-2 text-sm text-[#00373E]/70">
                  A monthly letter from our team, with ideas you can use between sessions.
                </p>
                <NewsletterForm variant="card" />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
```

- [ ] **Step 5: Switch the three placements on**

In `components/Footer.tsx`:

1. Add `import NewsletterDialogButton from "@/components/NewsletterDialogButton";` below the `getAssetUrl` import.
2. Replace the commented-out block. It starts at `{/* NEWSLETTER DISABLED — uncomment when newsletter is enabled` and ends at `*/}`, and wraps the `<Link href="/contact" …>Subscribe to our newsletter</Link>`. Put in its place:

```tsx
            <NewsletterDialogButton
              className={`${headingFont.className} inline-flex items-center justify-center rounded-full bg-[#00373E] px-8 py-3 text-sm sm:text-base font-semibold text-white shadow-md transition-all duration-200 hover:bg-[#024a53] hover:-translate-y-0.5 hover:shadow-lg`}
            />
```

In `components/BlogListClient.tsx`:

1. Replace the two lines:

```tsx
// NEWSLETTER DISABLED — uncomment when newsletter is enabled
// import NewsletterForm from '@/components/NewsletterForm';
```

with:

```tsx
import NewsletterForm from '@/components/NewsletterForm';
```

2. Insert this block directly above the line `      {/* Category filters + Grid */}`:

```tsx
      {/* Newsletter sign-up */}
      <FadeInSection delay={150}>
        <section className="w-full bg-[#00373E]">
          <div className="mx-auto flex w-full max-w-[1225px] flex-col items-center gap-4 px-4 py-10 text-center sm:gap-6 sm:px-8 sm:py-14 lg:px-12">
            <h2 className={`${headingFont.className} text-xl font-bold text-white sm:text-2xl lg:text-3xl`}>
              Stay updated with our latest insights
            </h2>
            <p className="max-w-lg text-xs text-white/60 sm:text-sm">
              A monthly letter from our team on mental health, therapy and recovery, straight to your inbox.
            </p>
            <div className="w-full max-w-2xl text-left">
              <NewsletterForm variant="inline" dark />
            </div>
          </div>
        </section>
      </FadeInSection>

```

In `components/LargeRectangleSection.tsx`:

1. Replace:

```tsx
// NEWSLETTER DISABLED — uncomment when newsletter is enabled
// import NewsletterForm from './NewsletterForm';
```

with:

```tsx
import NewsletterForm from './NewsletterForm';
```

2. Replace the sentence:

```tsx
              Connect with others, share experiences, and find encouragement in
              a safe, supportive space.
```

with:

```tsx
              A monthly letter from our team, with ideas you can use between sessions.
```

3. Replace the commented-out form block. It starts at `{/* NEWSLETTER DISABLED — uncomment when newsletter is enabled` and ends at `*/}`. Put in its place:

```tsx
            <div
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
              className="mt-2 max-w-full lg:max-w-[520px]"
            >
              <NewsletterForm variant="inline" dark={isHovered} />
            </div>
```

In `app/page.tsx`:

1. Replace:

```tsx
// NEWSLETTER DISABLED — uncomment when newsletter is enabled
// const LargeRectangleSection = dynamic(
//   () => import('@/components/LargeRectangleSection')
// );
```

with:

```tsx
const LargeRectangleSection = dynamic(
  () => import('@/components/LargeRectangleSection')
);
```

2. Replace:

```tsx
        {/* NEWSLETTER DISABLED — uncomment when newsletter is enabled
        <LargeRectangleSection />
        */}
```

with:

```tsx
        <LargeRectangleSection />
```

- [ ] **Step 6: Run the component tests and the type check**

Run: `npx vitest run tests/vitest/components/`
Expected: PASS, apart from the known `Header.test.tsx` failure ("renders navigation links").

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 7: Write the end-to-end test**

Create `tests/e2e/newsletter.spec.ts`:

```ts
import { test, expect, type Page } from '@playwright/test';

// The /api routes are Netlify functions, which `next dev` doesn't serve, so
// every API call here is answered by the test.
const OK = { ok: true, message: 'Check your inbox to confirm your subscription.' };

async function answerSignups(page: Page) {
  const bodies: Array<Record<string, unknown>> = [];
  await page.route('**/api/newsletter-subscribe', async (route) => {
    bodies.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(OK) });
  });
  return bodies;
}

test.describe('Newsletter sign-up', () => {
  test('from the footer dialog', async ({ page }) => {
    const bodies = await answerSignups(page);
    await page.goto('/contact/');
    await page.getByRole('button', { name: 'Subscribe to our newsletter' }).click();
    const dialog = page.getByRole('dialog', { name: 'Subscribe to our newsletter' });
    await dialog.getByLabel('Full name').fill('Asha Rao');
    await dialog.getByLabel('Email address').fill('asha@example.com');
    await dialog.getByRole('button', { name: 'Subscribe' }).click();
    await expect(dialog.getByText(OK.message)).toBeVisible();
    expect(bodies[0]).toMatchObject({ full_name: 'Asha Rao', email: 'asha@example.com', page: '/contact/', notice: '2026-10' });
  });

  test('from the blog listing', async ({ page }) => {
    const bodies = await answerSignups(page);
    await page.goto('/blogs/');
    await page.getByLabel('Full name').fill('Asha Rao');
    await page.getByLabel('Email address').fill('asha@example.com');
    await page.getByRole('button', { name: 'Subscribe', exact: true }).click();
    await expect(page.getByText(OK.message)).toBeVisible();
    expect(bodies[0]).toMatchObject({ page: '/blogs/' });
  });

  test('from the homepage card', async ({ page }) => {
    const bodies = await answerSignups(page);
    await page.goto('/');
    await page.getByText('A monthly letter from our team, with ideas you can use between sessions.').scrollIntoViewIfNeeded();
    await page.getByLabel('Full name').fill('Asha Rao');
    await page.getByLabel('Email address').fill('asha@example.com');
    await page.getByRole('button', { name: 'Subscribe', exact: true }).click();
    await expect(page.getByText(OK.message)).toBeVisible();
    expect(bodies[0]).toMatchObject({ page: '/' });
  });
});
```

- [ ] **Step 8: Run it against the dev server**

1. Start `npm run dev` in the background, unless the user already has it running on port 3000. Don't run `next build` while it runs.
2. Wait until `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/` prints `200`.
3. Run: `E2E_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/newsletter.spec.ts --project=chromium`

Expected: 3 passed.

If Playwright says the browser is missing, run `npx playwright install chromium` and run the tests again. Leave the dev server running for Task 12.

- [ ] **Step 9: Commit**

```bash
git add components/NewsletterForm.tsx components/NewsletterDialogButton.tsx components/Footer.tsx components/BlogListClient.tsx components/LargeRectangleSection.tsx app/page.tsx tests/vitest/components/NewsletterForm.test.tsx tests/vitest/components/NewsletterDialogButton.test.tsx tests/vitest/components/LargeRectangleSection.test.tsx tests/vitest/components/Footer.test.tsx tests/e2e/newsletter.spec.ts
git commit -m "feat(newsletter): sign-up form in the footer, blog listing and homepage" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: The confirm page

`/newsletter/confirm/#t=<token>` asks for a click rather than confirming on load (spec §7.3). Corporate email scanners open links automatically, and a scanner must not be able to subscribe someone. The token is in the URL fragment, so it never reaches a server or Google Analytics. The page removes it from the address bar once it has been used. The page is `noindex` and stays out of the sitemap.

**Files:**
- Create: `components/NewsletterConfirm.tsx`
- Create: `app/newsletter/confirm/layout.tsx`
- Create: `app/newsletter/confirm/page.tsx`
- Modify: `scripts/generate-sitemap.mjs`
- Test: `tests/vitest/components/NewsletterConfirm.test.tsx`
- Modify test: `tests/e2e/newsletter.spec.ts`

**Interfaces:**
- **Consumes:**
  - `POST /api/newsletter-confirm` (Task 8), which answers 200 `{ ok: true }` or 400 `{ error: 'expired' }`;
  - `NewsletterForm` (Task 11).
- **Produces:** the route `/newsletter/confirm/`.

- [ ] **Step 1: Write the failing tests**

Create `tests/vitest/components/NewsletterConfirm.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NewsletterConfirm from '@/components/NewsletterConfirm';

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string } & Record<string, unknown>) => (
    <a href={href} {...props}>{children}</a>
  ),
}));
vi.mock('@/components/NewsletterForm', () => ({ default: () => <div data-testid="signup-form" /> }));

const TOKEN = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJ0123456';
const fetchMock = vi.fn();
const reply = (status: number, body: unknown) => ({ ok: status < 300, status, json: async () => body });

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  window.history.replaceState(null, '', `/newsletter/confirm/#t=${TOKEN}`);
});

describe('NewsletterConfirm', () => {
  it('waits for a click before confirming', async () => {
    render(<NewsletterConfirm />);
    expect(await screen.findByRole('button', { name: 'Confirm my subscription' })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('confirms with the token from the link, then takes the token out of the address bar', async () => {
    fetchMock.mockResolvedValue(reply(200, { ok: true }));
    render(<NewsletterConfirm />);
    await userEvent.click(await screen.findByRole('button', { name: 'Confirm my subscription' }));

    expect(await screen.findByRole('heading', { name: "You're subscribed" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/newsletter-confirm', expect.objectContaining({ method: 'POST' }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ token: TOKEN });
    expect(window.location.hash).toBe('');
  });

  it('offers the form again when the link has expired', async () => {
    fetchMock.mockResolvedValue(reply(400, { error: 'expired', message: 'This link has expired or was already used.' }));
    render(<NewsletterConfirm />);
    await userEvent.click(await screen.findByRole('button', { name: 'Confirm my subscription' }));
    expect(await screen.findByRole('heading', { name: 'This link has expired' })).toBeInTheDocument();
    expect(screen.getByTestId('signup-form')).toBeInTheDocument();
  });

  it('says when the link is incomplete', async () => {
    window.history.replaceState(null, '', '/newsletter/confirm/');
    render(<NewsletterConfirm />);
    expect(await screen.findByRole('heading', { name: 'This link is incomplete' })).toBeInTheDocument();
    expect(screen.getByTestId('signup-form')).toBeInTheDocument();
  });

  it('lets the person try again after an error', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(reply(200, { ok: true }));
    render(<NewsletterConfirm />);
    await userEvent.click(await screen.findByRole('button', { name: 'Confirm my subscription' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: "You're subscribed" })).toBeInTheDocument();
  });
});
```

Add to `tests/e2e/newsletter.spec.ts`:

```ts
test.describe('Confirm page', () => {
  const TOKEN = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJ0123456';

  test('confirms with the token from the emailed link', async ({ page }) => {
    let sent: unknown;
    await page.route('**/api/newsletter-confirm', async (route) => {
      sent = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    });
    await page.goto(`/newsletter/confirm/#t=${TOKEN}`);
    await page.getByRole('button', { name: 'Confirm my subscription' }).click();
    await expect(page.getByRole('heading', { name: "You're subscribed" })).toBeVisible();
    expect(sent).toEqual({ token: TOKEN });
    await expect(page).toHaveURL(/\/newsletter\/confirm\/$/);
  });

  test('offers the form again when the link has expired', async ({ page }) => {
    await page.route('**/api/newsletter-confirm', (route) =>
      route.fulfill({ status: 400, contentType: 'application/json', body: '{"error":"expired"}' }),
    );
    await page.goto(`/newsletter/confirm/#t=${TOKEN}`);
    await page.getByRole('button', { name: 'Confirm my subscription' }).click();
    await expect(page.getByRole('heading', { name: 'This link has expired' })).toBeVisible();
    await expect(page.getByLabel('Email address')).toBeVisible();
  });

  test('is kept out of search results', async ({ page }) => {
    await page.goto('/newsletter/confirm/');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });
});
```

- [ ] **Step 2: Run the unit tests to see them fail**

Run: `npx vitest run tests/vitest/components/NewsletterConfirm.test.tsx`
Expected: FAIL. The component doesn't exist.

- [ ] **Step 3: Write the component and the page**

Create `components/NewsletterConfirm.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Loader2 } from 'lucide-react';
import NewsletterForm from '@/components/NewsletterForm';

type State = 'loading' | 'ready' | 'confirming' | 'done' | 'expired' | 'missing' | 'error';

const TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** The token from the link's #t=…, or null. */
function tokenFromLink(): string | null {
  const match = /(?:^#|&)t=([^&]+)/.exec(window.location.hash);
  const token = match ? decodeURIComponent(match[1]) : null;
  return token && TOKEN.test(token) ? token : null;
}

/** Takes the used token out of the address bar. */
function forgetToken() {
  if (window.location.hash) window.history.replaceState(null, '', window.location.pathname + window.location.search);
}

/**
 * Confirms a newsletter sign-up (spec §7.3). It waits for a click, because
 * corporate email scanners open links automatically.
 */
export default function NewsletterConfirm() {
  const [state, setState] = useState<State>('loading');
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const found = tokenFromLink();
    setToken(found);
    setState(found ? 'ready' : 'missing');
  }, []);

  async function confirm() {
    if (!token) return;
    setState('confirming');
    try {
      const res = await fetch('/api/newsletter-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (res.ok) {
        forgetToken();
        setState('done');
      } else if (res.status === 400) {
        forgetToken();
        setState('expired');
      } else {
        setState('error');
      }
    } catch {
      setState('error');
    }
  }

  const heading = 'text-2xl font-bold text-[#00373E] sm:text-3xl';
  const body = 'mt-3 text-base leading-relaxed text-[#00373E]/80';
  const button =
    'mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-[#ED7428] px-8 py-3 text-sm font-semibold text-white shadow-md transition-colors hover:bg-[#d4631f] disabled:opacity-60';

  return (
    <div aria-live="polite">
      {state === 'loading' && <Loader2 className="mx-auto h-6 w-6 animate-spin text-[#ED7428]" aria-label="Loading" />}

      {(state === 'ready' || state === 'confirming') && (
        <>
          <h1 className={heading}>Confirm your subscription</h1>
          <p className={body}>Click the button to start getting the Hope Trust newsletter, about once a month.</p>
          <button type="button" onClick={confirm} disabled={state === 'confirming'} className={button}>
            {state === 'confirming' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Confirm my subscription
          </button>
        </>
      )}

      {state === 'done' && (
        <>
          <CheckCircle2 className="mb-4 h-10 w-10 text-emerald-600" aria-hidden="true" />
          <h1 className={heading}>You&apos;re subscribed</h1>
          <p className={body}>
            Thank you. The next Hope Trust newsletter will come to your inbox. Every issue has an Unsubscribe button at
            the bottom.
          </p>
          <Link href="/blogs/" className={button}>
            Read our latest articles
          </Link>
        </>
      )}

      {(state === 'expired' || state === 'missing') && (
        <>
          <h1 className={heading}>{state === 'expired' ? 'This link has expired' : 'This link is incomplete'}</h1>
          <p className={body}>
            {state === 'expired'
              ? "Confirmation links work once and last 7 days. Sign up again and we'll send you a new one."
              : "Open the link in the confirmation email again, or sign up below and we'll send you a new one."}
          </p>
          <div className="mt-6">
            <NewsletterForm variant="card" />
          </div>
        </>
      )}

      {state === 'error' && (
        <>
          <h1 className={heading}>Something went wrong</h1>
          <p className={body}>We couldn&apos;t confirm your subscription just now. Please try again.</p>
          <button type="button" onClick={confirm} className={button}>
            Try again
          </button>
        </>
      )}
    </div>
  );
}
```

Create `app/newsletter/confirm/layout.tsx`:

```tsx
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Confirm your subscription',
  description: 'Confirm your subscription to the Hope Trust newsletter.',
  robots: { index: false, follow: false },
  alternates: { canonical: '/newsletter/confirm/' },
};

export default function NewsletterConfirmLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
```

Create `app/newsletter/confirm/page.tsx`:

```tsx
import dynamic from 'next/dynamic';
import { Bricolage_Grotesque } from 'next/font/google';
import Header from '@/components/Header';
import NewsletterConfirm from '@/components/NewsletterConfirm';

const Footer = dynamic(() => import('@/components/Footer'));

const bodyFont = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

// A simple branded page, not a landing page (spec §7.3).
export default function NewsletterConfirmPage() {
  return (
    <>
      <Header />
      <main className={`${bodyFont.className} min-h-screen bg-[#F7F5EF]`}>
        <section className="mx-auto max-w-xl px-4 pb-20 pt-32 sm:px-8 sm:pt-36">
          <div className="rounded-3xl bg-white p-6 shadow-sm sm:p-10">
            <NewsletterConfirm />
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
```

In `scripts/generate-sitemap.mjs`, add `'newsletter'` to the `UNLISTED` set:

```js
  const UNLISTED = new Set([
    '_next', 'blogs', 'therapists', 'blog-images', 'arel-ops', 'enrollment-success', '404', 'newsletter',
  ]);
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run tests/vitest/components/NewsletterConfirm.test.tsx`
Expected: PASS.

Then, with the dev server from Task 11 still running:
`E2E_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/newsletter.spec.ts --project=chromium`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add components/NewsletterConfirm.tsx app/newsletter/confirm/layout.tsx app/newsletter/confirm/page.tsx scripts/generate-sitemap.mjs tests/vitest/components/NewsletterConfirm.test.tsx tests/e2e/newsletter.spec.ts
git commit -m "feat(newsletter): confirm page that waits for a click" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: The privacy policy's newsletter section

The form's notice links to `/privacy-policy/#newsletter`. The current policy is mostly terms of use and doesn't mention the newsletter, email, Resend or how to withdraw consent. India's DPDP Act expects people to know what is collected, why, and how to withdraw consent.

The wording below is a draft. Hope Trust must approve it before the forms go live (Task 18). If they rewrite it, change only the text and keep the facts true to what the code does.

**Files:**
- Modify: `app/privacy-policy/page.tsx`
- Test: `tests/vitest/pages/privacy-policy.test.tsx`

**Interfaces:**
- **Consumes:** none.
- **Produces:** the anchor `#newsletter` on `/privacy-policy/`.

- [ ] **Step 1: Write the failing test**

Create `tests/vitest/pages/privacy-policy.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import PrivacyPolicyPage from '@/app/privacy-policy/page';

vi.mock('next/font/google', () => ({ Bricolage_Grotesque: () => ({ className: 'mock-font' }) }));
vi.mock('@/lib/assets', () => ({ getAssetUrl: (path: string) => `/mock/${path}` }));
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string } & Record<string, unknown>) => (
    <a href={href} {...props}>{children}</a>
  ),
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/privacy-policy/' }));

describe('privacy policy', () => {
  // The sign-up form's notice links here (spec §7.1).
  it('has a newsletter section that says what is kept, who sends it and how to leave', () => {
    const { container } = render(<PrivacyPolicyPage />);
    const section = container.querySelector('#newsletter');
    expect(section).not.toBeNull();
    const text = section!.textContent ?? '';
    expect(text).toMatch(/name and email address/);
    expect(text).toMatch(/IP address/);
    expect(text).toMatch(/Resend/);
    expect(text).toMatch(/unsubscribe at any time/i);
    expect(text).toMatch(/30 days/);
    expect(section!.querySelector('a[href="mailto:frontoffice@hopetrustindia.com"]')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/vitest/pages/privacy-policy.test.tsx`
Expected: FAIL. There's no `#newsletter` section yet.

- [ ] **Step 3: Add the section**

In `app/privacy-policy/page.tsx`, replace:

```tsx
              </ul>
            </div>
          </div>
        </section>
```

with:

```tsx
              </ul>
            </div>

            <div id="newsletter" className="scroll-mt-32">
              <h2
                className={`${headingFont.className} text-xl sm:text-2xl font-bold text-[#00373E] mb-4`}
              >
                Our newsletter
              </h2>
              <div className={`${bodyFont.className} space-y-4 text-[#00373E]/80 text-base sm:text-lg`}>
                <p>
                  If you sign up for the Hope Trust newsletter, we keep your name and email address and a record
                  of how you agreed: when you confirmed by clicking the link we emailed you, the page you signed
                  up on, your IP address and browser at the time, and which version of the sign-up notice you saw.
                  If we add you from a list you agreed to be on, such as a form at our clinic, we keep a note of
                  where and when you agreed instead.
                </p>
                <p>
                  We use these details only to send you the newsletter, about once a month, and to show that you
                  asked for it. Our email service, Resend, which is based in the United States, sends the
                  newsletter for us and stores your email address for that purpose.
                </p>
                <p>
                  You can unsubscribe at any time with the link at the bottom of every newsletter, or by replying
                  to it or calling us. If you don&apos;t confirm your sign-up, we delete your details after 30
                  days. If you unsubscribe, we keep a record of that, so you aren&apos;t added back by mistake. To
                  have your details deleted completely, write to{' '}
                  <a href="mailto:frontoffice@hopetrustindia.com" className="text-[#ED7428] hover:underline">
                    frontoffice@hopetrustindia.com
                  </a>
                  . After that we keep only a scrambled fingerprint of your address (a one-way hash), so an old
                  list can&apos;t add you back.
                </p>
              </div>
            </div>
          </div>
        </section>
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run tests/vitest/pages/privacy-policy.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/privacy-policy/page.tsx tests/vitest/pages/privacy-policy.test.tsx
git commit -m "feat(newsletter): privacy policy section for the newsletter (draft for Hope Trust to approve)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 14: The admin client

This is a typed `fetch` client for `/api/admin-newsletter-subscribers`, built the same way as `lib/enrollments-admin.ts`. It adds `syncUntilDone`, which calls sync until nothing is left. It stops early if a call makes no progress, so one address Resend keeps rejecting can't keep the screen busy forever.

**Files:**
- Create: `lib/newsletter-admin.ts`
- Test: `tests/vitest/lib/newsletter-admin.test.ts`

**Interfaces:**
- **Consumes:**
  - the API in Task 10;
  - `AdminSubscriber`, `SubscriberStatus`, `SubscriberSource` (Task 3);
  - `ImportRow` (Task 9).
- **Produces:**
  - `class UnauthorizedError`
  - Types: `SubscriberQuery`, `SubscriberList`, `ImportChunk`, `ImportResult`, `SyncResult`
  - `fetchSubscribers(token, query?)`
  - `importSubscribers(token, chunk)`
  - `syncSubscribers(token, pull)`
  - `unsubscribeSubscriber(token, id)`
  - `deleteSubscriber(token, id)`
  - `downloadSubscribersCsv(token, query?)`
  - `syncUntilDone(token, onProgress?, maxCalls = 100): Promise<SyncResult>`

- [ ] **Step 1: Write the failing tests**

Create `tests/vitest/lib/newsletter-admin.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  UnauthorizedError,
  deleteSubscriber,
  downloadSubscribersCsv,
  fetchSubscribers,
  importSubscribers,
  syncUntilDone,
  unsubscribeSubscriber,
} from '@/lib/newsletter-admin';

const fetchMock = vi.fn();
const reply = (status: number, body: unknown, headers: Record<string, string> = {}) => ({
  ok: status < 300,
  status,
  json: async () => body,
  blob: async () => new Blob(['email\r\n']),
  headers: new Headers(headers),
});
const sync = (over: Record<string, unknown>) => ({
  unsubscribedInResend: 0, removedFromSegment: 0, pushed: 0, failed: 0, remaining: 0, errors: [], ...over,
});

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('newsletter admin client', () => {
  it('lists subscribers, sending the filters and the token', async () => {
    fetchMock.mockResolvedValue(reply(200, { subscribers: [], total: 0 }));
    await fetchSubscribers('t', { q: 'asha rao', status: 'subscribed', source: '', limit: 25, offset: 50 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/admin-newsletter-subscribers?q=asha+rao&status=subscribed&limit=25&offset=50');
    expect(init.headers.Authorization).toBe('Bearer t');
    expect(init.cache).toBe('no-store');
  });

  it('throws UnauthorizedError on 401, and the server\'s message on other errors', async () => {
    fetchMock.mockResolvedValueOnce(reply(401, { error: 'Unauthorized' }));
    await expect(fetchSubscribers('t')).rejects.toBeInstanceOf(UnauthorizedError);
    fetchMock.mockResolvedValueOnce(reply(409, { error: 'Only subscribed people can be unsubscribed.' }));
    await expect(unsubscribeSubscriber('t', 'a')).rejects.toThrow('Only subscribed people can be unsubscribed.');
  });

  it('posts an import chunk as JSON', async () => {
    fetchMock.mockResolvedValue(reply(200, { inserted: 1 }));
    const chunk = { batch_id: 'b', statement: 'Intake form 2025–26', attested: true as const, rows: [{ email: 'a@example.com', name: null }] };
    await importSubscribers('t', chunk);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/admin-newsletter-subscribers?action=import');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual(chunk);
  });

  it('unsubscribes and deletes by id', async () => {
    fetchMock.mockResolvedValue(reply(200, { subscriber: { id: 'a' }, ok: true }));
    await unsubscribeSubscriber('t', 'a');
    await deleteSubscriber('t', 'a');
    expect(fetchMock.mock.calls.map(([url, init]) => `${init.method} ${url}`)).toEqual([
      'PATCH /api/admin-newsletter-subscribers?id=a',
      'DELETE /api/admin-newsletter-subscribers?id=a',
    ]);
  });

  it('downloads the CSV for the current filters', async () => {
    Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:x'), configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
    const downloads: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push(this.download);
    });
    fetchMock.mockResolvedValue(
      reply(200, null, { 'content-disposition': 'attachment; filename="newsletter-subscribers-2026-10-14.csv"' }),
    );
    await downloadSubscribersCsv('t', { status: 'subscribed' });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/admin-newsletter-subscribers?status=subscribed&format=csv');
    expect(downloads).toEqual(['newsletter-subscribers-2026-10-14.csv']);
    click.mockRestore();
  });
});

describe('syncUntilDone', () => {
  it('keeps calling until everything is sent, reading Resend only on the first call', async () => {
    fetchMock
      .mockResolvedValueOnce(reply(200, sync({ pushed: 40, remaining: 60, unsubscribedInResend: 2 })))
      .mockResolvedValueOnce(reply(200, sync({ pushed: 40, remaining: 20 })))
      .mockResolvedValueOnce(reply(200, sync({ pushed: 20, remaining: 0 })));
    const progress: number[] = [];
    const result = await syncUntilDone('t', (p) => progress.push(p.remaining));
    expect(fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body).pull)).toEqual([true, false, false]);
    expect(result).toMatchObject({ pushed: 100, remaining: 0, unsubscribedInResend: 2 });
    expect(progress).toEqual([60, 20, 0]);
  });

  it('stops when a call makes no progress, and passes on the errors', async () => {
    fetchMock.mockResolvedValue(reply(200, sync({ pushed: 0, failed: 1, remaining: 3, errors: ['x@example.com: Invalid email'] })));
    const result = await syncUntilDone('t');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ remaining: 3, errors: ['x@example.com: Invalid email'] });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/vitest/lib/newsletter-admin.test.ts`
Expected: FAIL. The module doesn't exist.

- [ ] **Step 3: Write the client**

Create `lib/newsletter-admin.ts`:

```ts
// =============================================================================
// Admin client for /api/admin-newsletter-subscribers (spec §8.2, §11).
// Used by the Newsletter tab in the admin dashboard.
// =============================================================================

import type { ImportRow } from '@/lib/newsletter/import';
import type { AdminSubscriber, SubscriberSource, SubscriberStatus } from '@/lib/newsletter/subscriber';

export class UnauthorizedError extends Error {
  constructor() {
    super('Session expired. Please log in again.');
    this.name = 'UnauthorizedError';
  }
}

export interface SubscriberQuery {
  q?: string;
  status?: SubscriberStatus | '';
  source?: SubscriberSource | '';
  limit?: number;
  offset?: number;
}

export interface SubscriberList {
  subscribers: AdminSubscriber[];
  total: number;
  counts: Record<SubscriberStatus, number>;
  /** Changes not yet in Resend. */
  needs_push: number;
  limit: number;
  offset: number;
}

export interface ImportChunk {
  batch_id: string;
  statement: string;
  attested: true;
  rows: ImportRow[];
}

export interface ImportResult {
  inserted: number;
  skipped_existing: number;
  skipped_erased: number;
  invalid: number;
  duplicates: number;
}

export interface SyncResult {
  unsubscribedInResend: number;
  removedFromSegment: number;
  pushed: number;
  failed: number;
  remaining: number;
  errors: string[];
}

function queryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  return search.toString();
}

async function call<T>(token: string, query: string, init: RequestInit = {}): Promise<T> {
  // The literal path ends at "?", so tests/vitest/config/api-redirects.test.ts
  // can check that netlify.toml routes it.
  const res = await fetch(`/api/admin-newsletter-subscribers?${query}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    cache: 'no-store',
  });
  if (res.status === 401) throw new UnauthorizedError();
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body as T;
}

export function fetchSubscribers(token: string, query: SubscriberQuery = {}): Promise<SubscriberList> {
  return call(
    token,
    queryString({ q: query.q, status: query.status, source: query.source, limit: query.limit, offset: query.offset }),
  );
}

export function importSubscribers(token: string, chunk: ImportChunk): Promise<ImportResult> {
  return call(token, 'action=import', { method: 'POST', body: JSON.stringify(chunk) });
}

export function syncSubscribers(token: string, pull: boolean): Promise<SyncResult> {
  return call(token, 'action=sync', { method: 'POST', body: JSON.stringify({ pull }) });
}

export async function unsubscribeSubscriber(token: string, id: string): Promise<AdminSubscriber> {
  const body = await call<{ subscriber: AdminSubscriber }>(token, queryString({ id }), { method: 'PATCH' });
  return body.subscriber;
}

export async function deleteSubscriber(token: string, id: string): Promise<void> {
  await call(token, queryString({ id }), { method: 'DELETE' });
}

/** Downloads the CSV export for the current filters. */
export async function downloadSubscribersCsv(token: string, query: SubscriberQuery = {}): Promise<void> {
  const res = await fetch(
    `/api/admin-newsletter-subscribers?${queryString({ q: query.q, status: query.status, source: query.source, format: 'csv' })}`,
    { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' },
  );
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Export failed');
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download =
    /filename="([^"]+)"/.exec(res.headers.get('content-disposition') || '')?.[1] ||
    `newsletter-subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Calls sync until nothing is left to send, or until a call sends nothing:
 * a row Resend keeps refusing, whose error is in the result. Reads Resend's
 * unsubscribes on the first call only. Returns the totals.
 */
export async function syncUntilDone(
  token: string,
  onProgress?: (totals: SyncResult) => void,
  maxCalls = 100,
): Promise<SyncResult> {
  let totals: SyncResult = { unsubscribedInResend: 0, removedFromSegment: 0, pushed: 0, failed: 0, remaining: 0, errors: [] };
  for (let n = 0; n < maxCalls; n++) {
    const r = await syncSubscribers(token, n === 0);
    totals = {
      unsubscribedInResend: totals.unsubscribedInResend + r.unsubscribedInResend,
      removedFromSegment: totals.removedFromSegment + r.removedFromSegment,
      pushed: totals.pushed + r.pushed,
      failed: totals.failed + r.failed,
      remaining: r.remaining,
      errors: [...totals.errors, ...r.errors].slice(0, 5),
    };
    onProgress?.(totals);
    if (r.remaining === 0 || r.pushed === 0) break;
  }
  return totals;
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run tests/vitest/lib/newsletter-admin.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/newsletter-admin.ts tests/vitest/lib/newsletter-admin.test.ts
git commit -m "feat(newsletter): admin client for the subscribers API" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: The Newsletter tab: subscribers and import

This adds a Newsletter tab to `/arel-ops`. In this plan it holds the Subscribers screen (spec §8.2):

- counts by status, and how many changes are waiting for Resend;
- search, and filters by status and source;
- per row: Unsubscribe (subscribed people only) and Delete, each after a confirmation;
- a toolbar with Sync with Resend, Import and Export CSV.

The Import dialog reads the file in the browser and previews it. It requires the consent statement and the tick, then sends chunks of 200 and syncs, with a progress bar for both steps (spec §7.4). Plan 3 adds the Issues screen inside `NewsletterTab`.

**Files:**
- Create: `components/admin/newsletter/NewsletterTab.tsx`
- Create: `components/admin/newsletter/SubscribersScreen.tsx`
- Create: `components/admin/newsletter/ImportDialog.tsx`
- Modify: `app/arel-ops/page.tsx`
- Test: `tests/vitest/components/admin/SubscribersScreen.test.tsx`
- Test: `tests/vitest/components/admin/ImportDialog.test.tsx`
- Modify test: `tests/e2e/newsletter.spec.ts`

**Interfaces:**
- **Consumes:**
  - everything Task 14 produces;
  - `splitHeader`, `guessColumns`, `pickColumns`, `cleanRows`, `chunk`, `IMPORT_CHUNK`, `Sheet` (Task 9);
  - `readSpreadsheet` (Task 9);
  - `AdminSubscriber`, `SubscriberStatus`, `SubscriberSource` (Task 3).
- **Produces:**
  - `<NewsletterTab token onUnauthorized />`
  - `<SubscribersScreen token onUnauthorized />`
  - `<ImportDialog token onClose onFinished onUnauthorized />`
  - `syncSummary(result)`
  - `formatDate(iso)`

- [ ] **Step 1: Write the failing tests**

Create `tests/vitest/components/admin/ImportDialog.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ImportDialog from '@/components/admin/newsletter/ImportDialog';
import { UnauthorizedError } from '@/lib/newsletter-admin';

const mocks = vi.hoisted(() => ({ readSpreadsheet: vi.fn(), importSubscribers: vi.fn(), syncUntilDone: vi.fn() }));

vi.mock('@/lib/newsletter/read-spreadsheet', () => ({ readSpreadsheet: mocks.readSpreadsheet }));
vi.mock('@/lib/newsletter-admin', () => {
  class UnauthorizedError extends Error {}
  return { UnauthorizedError, importSubscribers: mocks.importSubscribers, syncUntilDone: mocks.syncUntilDone };
});

const GRID = [
  ['Name', 'E-mail'],
  ['Asha', 'asha@example.com'],
  ['Ravi', 'RAVI@example.com'],
  ['Bad', 'nope'],
  ['Asha again', 'Asha@Example.com'],
];
const MANY = [['Email'], ...Array.from({ length: 450 }, (_, i) => [`p${i}@example.com`])];
const SYNCED = { unsubscribedInResend: 0, removedFromSegment: 0, pushed: 450, failed: 0, remaining: 0, errors: [] };

beforeEach(() => {
  mocks.readSpreadsheet.mockReset();
  mocks.importSubscribers.mockReset();
  mocks.syncUntilDone.mockReset();
  mocks.importSubscribers.mockImplementation(async (_token: string, chunk: { rows: unknown[] }) => ({
    inserted: chunk.rows.length, skipped_existing: 0, skipped_erased: 0, invalid: 0, duplicates: 0,
  }));
  mocks.syncUntilDone.mockResolvedValue(SYNCED);
});

function setup() {
  const props = { token: 't', onClose: vi.fn(), onFinished: vi.fn(), onUnauthorized: vi.fn() };
  render(<ImportDialog {...props} />);
  return props;
}

async function upload(grid: unknown[][]) {
  mocks.readSpreadsheet.mockResolvedValue(grid);
  await userEvent.upload(screen.getByLabelText('Spreadsheet file'), new File(['x'], 'list.csv', { type: 'text/csv' }));
}

async function agree() {
  await userEvent.type(
    screen.getByLabelText('Where and when did these people agree?'),
    'Clients who ticked the box on the intake form, 2025–26',
  );
  await userEvent.click(screen.getByLabelText('Everyone on this list agreed to receive the Hope Trust newsletter.'));
}

describe('ImportDialog', () => {
  it('previews the file and guesses the columns', async () => {
    setup();
    await upload(GRID);
    expect(await screen.findByTestId('import-preview')).toHaveTextContent(
      '2 addresses to import · 1 not valid · 1 repeated in the file',
    );
    expect(screen.getByLabelText('Email column')).toHaveValue('1');
    expect(screen.getByLabelText('Name column')).toHaveValue('0');
  });

  it('needs the statement and the tick before it imports', async () => {
    setup();
    await upload(GRID);
    const button = await screen.findByRole('button', { name: 'Import 2 addresses' });
    expect(button).toBeDisabled();
    await agree();
    expect(button).toBeEnabled();
  });

  it('imports in chunks of 200 under one batch id, then sends them to Resend', async () => {
    const props = setup();
    await upload(MANY);
    await agree();
    await userEvent.click(screen.getByRole('button', { name: 'Import 450 addresses' }));

    expect(await screen.findByText('Import finished')).toBeInTheDocument();
    const chunks = mocks.importSubscribers.mock.calls.map(([, chunk]) => chunk);
    expect(chunks.map((c) => c.rows.length)).toEqual([200, 200, 50]);
    expect(new Set(chunks.map((c) => c.batch_id)).size).toBe(1);
    expect(chunks[0]).toMatchObject({ attested: true, statement: 'Clients who ticked the box on the intake form, 2025–26' });
    expect(screen.getByText('Added').nextElementSibling).toHaveTextContent('450');
    expect(mocks.syncUntilDone).toHaveBeenCalled();
    expect(props.onFinished).toHaveBeenCalled();
  });

  it('shows what got in when a chunk fails', async () => {
    mocks.importSubscribers
      .mockImplementationOnce(async () => ({ inserted: 200, skipped_existing: 0, skipped_erased: 0, invalid: 0, duplicates: 0 }))
      .mockRejectedValueOnce(new Error('Something went wrong. Please try again.'));
    setup();
    await upload(MANY);
    await agree();
    await userEvent.click(screen.getByRole('button', { name: 'Import 450 addresses' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Please try again.');
    expect(screen.getByText('Added').nextElementSibling).toHaveTextContent('200');
    expect(mocks.syncUntilDone).not.toHaveBeenCalled();
  });

  it('sends an expired session back to the login', async () => {
    mocks.importSubscribers.mockRejectedValue(new UnauthorizedError());
    const props = setup();
    await upload(GRID);
    await agree();
    await userEvent.click(screen.getByRole('button', { name: 'Import 2 addresses' }));
    await vi.waitFor(() => expect(props.onUnauthorized).toHaveBeenCalled());
  });

  it('says when the file cannot be read', async () => {
    mocks.readSpreadsheet.mockRejectedValue(new Error('Choose a .csv or .xlsx file.'));
    setup();
    await userEvent.upload(screen.getByLabelText('Spreadsheet file'), new File(['x'], 'list.csv', { type: 'text/csv' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a .csv or .xlsx file.');
  });
});
```

Create `tests/vitest/components/admin/SubscribersScreen.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SubscribersScreen from '@/components/admin/newsletter/SubscribersScreen';
import { UnauthorizedError } from '@/lib/newsletter-admin';
import type { AdminSubscriber } from '@/lib/newsletter/subscriber';

const mocks = vi.hoisted(() => ({
  fetchSubscribers: vi.fn(),
  unsubscribeSubscriber: vi.fn(),
  deleteSubscriber: vi.fn(),
  downloadSubscribersCsv: vi.fn(),
  syncUntilDone: vi.fn(),
}));

vi.mock('@/lib/newsletter-admin', () => {
  class UnauthorizedError extends Error {}
  return { UnauthorizedError, ...mocks };
});
vi.mock('@/components/admin/newsletter/ImportDialog', () => ({
  default: () => <div role="dialog" aria-label="Import subscribers" />,
}));

function subscriber(over: Partial<AdminSubscriber>): AdminSubscriber {
  return {
    id: 'a', email: 'asha@example.com', full_name: 'Asha Rao', status: 'subscribed', source: 'website',
    consent_at: '2026-10-10T06:30:00.000Z', consent_note: null, imported_by: null, import_batch_id: null,
    signup_page: '/blogs/', signup_ip: null, signup_user_agent: null, signup_notice: '2026-10',
    confirm_sent_at: null, confirm_send_count: 0, unsubscribed_at: null, unsubscribe_source: null,
    resend_contact_id: null, resend_synced_at: null,
    created_at: '2026-10-10T06:00:00.000Z', updated_at: '2026-10-10T06:30:00.000Z',
    ...over,
  };
}

const LIST = {
  subscribers: [
    subscriber({}),
    subscriber({ id: 'b', email: 'ravi@example.com', full_name: 'Ravi', status: 'pending', consent_at: null }),
  ],
  total: 2,
  counts: { pending: 1, subscribed: 1, unsubscribed: 0 },
  needs_push: 1,
  limit: 25,
  offset: 0,
};

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.fetchSubscribers.mockResolvedValue(LIST);
});

function setup() {
  const onUnauthorized = vi.fn();
  render(<SubscribersScreen token="t" onUnauthorized={onUnauthorized} />);
  return { onUnauthorized };
}

describe('SubscribersScreen', () => {
  it('lists subscribers with their status, and the counts', async () => {
    setup();
    const list = await screen.findByRole('list');
    expect(within(list).getByText('asha@example.com')).toBeInTheDocument();
    expect(within(list).getByText('Subscribed')).toBeInTheDocument();
    expect(within(list).getByText('Not confirmed yet')).toBeInTheDocument();
    expect(screen.getByText(/1 subscribed · 1 not confirmed yet · 0 unsubscribed · 1 change waiting for Resend/)).toBeInTheDocument();
  });

  it('offers Unsubscribe only to subscribed people', async () => {
    setup();
    await screen.findByRole('list');
    expect(screen.getByRole('button', { name: 'Unsubscribe asha@example.com' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unsubscribe ravi@example.com' })).toBeNull();
  });

  it('unsubscribes after asking, then reloads', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mocks.unsubscribeSubscriber.mockResolvedValue(subscriber({ status: 'unsubscribed' }));
    setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Unsubscribe asha@example.com' }));
    expect(mocks.unsubscribeSubscriber).toHaveBeenCalledWith('t', 'a');
    expect(await screen.findByText('asha@example.com is unsubscribed.')).toBeInTheDocument();
    expect(mocks.fetchSubscribers).toHaveBeenCalledTimes(2);
  });

  it('does nothing when the admin cancels', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Delete asha@example.com' }));
    expect(mocks.deleteSubscriber).not.toHaveBeenCalled();
  });

  it('deletes after asking', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mocks.deleteSubscriber.mockResolvedValue(undefined);
    setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Delete ravi@example.com' }));
    expect(mocks.deleteSubscriber).toHaveBeenCalledWith('t', 'b');
    expect(await screen.findByText('ravi@example.com was deleted.')).toBeInTheDocument();
  });

  it('syncs until Resend is up to date and says what happened', async () => {
    mocks.syncUntilDone.mockResolvedValue({ unsubscribedInResend: 1, removedFromSegment: 0, pushed: 3, failed: 0, remaining: 0, errors: [] });
    setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Sync with Resend' }));
    expect(await screen.findByText('Sent 3 changes to Resend; 1 unsubscribed from an email.')).toBeInTheDocument();
  });

  it('opens the import dialog', async () => {
    setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Import' }));
    expect(screen.getByRole('dialog', { name: 'Import subscribers' })).toBeInTheDocument();
  });

  it('sends an expired session back to the login', async () => {
    mocks.fetchSubscribers.mockRejectedValue(new UnauthorizedError());
    const { onUnauthorized } = setup();
    await vi.waitFor(() => expect(onUnauthorized).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/vitest/components/admin/`
Expected: FAIL. The components don't exist.

- [ ] **Step 3: Write the import dialog**

Create `components/admin/newsletter/ImportDialog.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, X } from 'lucide-react';
import { IMPORT_CHUNK, chunk, cleanRows, guessColumns, pickColumns, splitHeader, type Sheet } from '@/lib/newsletter/import';
import { readSpreadsheet } from '@/lib/newsletter/read-spreadsheet';
import { UnauthorizedError, importSubscribers, syncUntilDone, type ImportResult, type SyncResult } from '@/lib/newsletter-admin';

type Step = 'choose' | 'review' | 'working' | 'done';

export interface ImportDialogProps {
  token: string;
  onClose: () => void;
  /** Called once rows may have been added, so the list reloads. */
  onFinished: () => void;
  onUnauthorized: () => void;
}

const field =
  'w-full rounded-xl border border-gray-200 bg-[#F7F6F4]/50 px-3 py-2.5 text-sm outline-none transition focus:border-[#ED7428] focus:bg-white focus:ring-2 focus:ring-[#ED7428]/20';
const label = 'mb-1 block text-xs font-semibold text-[#00373E]';
const secondary =
  'rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-[#00373E] transition hover:bg-gray-50 disabled:opacity-40';
const primary =
  'rounded-xl bg-[#ED7428] px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#ED7428]/20 transition hover:bg-[#d4651f] disabled:cursor-not-allowed disabled:opacity-50';

/** Import subscribers from a spreadsheet (spec §7.4). */
export default function ImportDialog({ token, onClose, onFinished, onUnauthorized }: ImportDialogProps) {
  const [step, setStep] = useState<Step>('choose');
  const [fileName, setFileName] = useState('');
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [emailCol, setEmailCol] = useState(0);
  const [nameCol, setNameCol] = useState<number | null>(null);
  const [statement, setStatement] = useState('');
  const [attested, setAttested] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  /** 0–1 for the progress bar: first the import chunks, then the sync. */
  const [progressValue, setProgressValue] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [sync, setSync] = useState<SyncResult | null>(null);

  const preview = sheet ? cleanRows(pickColumns(sheet, emailCol, nameCol)) : null;
  const ready = !!preview && preview.rows.length > 0 && statement.trim().length >= 10 && attested;
  const count = (n: number) => `${n} ${n === 1 ? 'address' : 'addresses'}`;

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError('');
    try {
      const parsed = splitHeader(await readSpreadsheet(file));
      if (parsed.rows.length === 0) {
        setError('That file has no rows to import.');
        return;
      }
      const guess = guessColumns(parsed);
      setSheet(parsed);
      setEmailCol(guess.email);
      setNameCol(guess.name);
      setFileName(file.name);
      setStep('review');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that file.');
    }
  }

  async function handleImport() {
    if (!preview || !ready) return;
    setStep('working');
    setError('');
    const batchId = crypto.randomUUID();
    const totals: ImportResult = {
      inserted: 0,
      skipped_existing: 0,
      skipped_erased: 0,
      invalid: preview.invalid,
      duplicates: preview.duplicates,
    };
    try {
      const parts = chunk(preview.rows, IMPORT_CHUNK);
      // A plain loop: the app compiles to ES5, where for…of over .entries() doesn't type-check.
      for (let i = 0; i < parts.length; i++) {
        const rows = parts[i];
        setProgress(`Importing ${Math.min((i + 1) * IMPORT_CHUNK, preview.rows.length)} of ${preview.rows.length}…`);
        setProgressValue(i / parts.length);
        const r = await importSubscribers(token, { batch_id: batchId, statement: statement.trim(), attested: true, rows });
        totals.inserted += r.inserted;
        totals.skipped_existing += r.skipped_existing;
        totals.skipped_erased += r.skipped_erased;
        // The server checks every row again; add anything it caught that the preview didn't.
        totals.invalid += r.invalid;
        totals.duplicates += r.duplicates;
      }
      setResult({ ...totals });
      setProgress('Sending the new subscribers to Resend…');
      setProgressValue(0);
      setSync(
        await syncUntilDone(token, (p) => {
          setProgress(`Sending to Resend: ${p.remaining} left…`);
          setProgressValue(p.pushed + p.remaining > 0 ? p.pushed / (p.pushed + p.remaining) : 1);
        }),
      );
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        onUnauthorized();
        return;
      }
      setError(e instanceof Error ? e.message : 'Import failed');
      setResult({ ...totals });
    }
    setStep('done');
    onFinished();
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="nl-import-title"
        className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl sm:p-8"
      >
        <button
          type="button"
          onClick={onClose}
          disabled={step === 'working'}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-full p-2 text-gray-500 transition hover:bg-gray-100 disabled:opacity-40"
        >
          <X className="h-5 w-5" />
        </button>
        <h2 id="nl-import-title" className="pr-10 text-xl font-semibold text-[#00373E]">
          Import subscribers
        </h2>

        {error && (
          <div role="alert" className="mt-4 flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {step === 'choose' && (
          <div className="mt-4 space-y-4 text-sm text-gray-600">
            <p>
              Upload a CSV or Excel (.xlsx) file with one person per row. Only add people who agreed to receive the
              Hope Trust newsletter.
            </p>
            <p>
              Addresses already on the list are skipped, whatever their status, so an import never re-subscribes
              someone who unsubscribed. People who were deleted are skipped too.
            </p>
            <label className="block">
              <span className={label}>Spreadsheet file</span>
              <input type="file" accept=".csv,.xlsx" onChange={(e) => handleFile(e.target.files?.[0])} className="block w-full text-sm" />
            </label>
          </div>
        )}

        {step === 'review' && sheet && preview && (
          <div className="mt-4 space-y-5 text-sm">
            <p className="text-gray-600">
              {fileName}: {sheet.rows.length} {sheet.rows.length === 1 ? 'row' : 'rows'}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className={label}>Email column</span>
                <select value={emailCol} onChange={(e) => setEmailCol(Number(e.target.value))} className={field}>
                  {sheet.headers.map((header, i) => (
                    <option key={i} value={i}>{header}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={label}>Name column</span>
                <select
                  value={nameCol ?? ''}
                  onChange={(e) => setNameCol(e.target.value === '' ? null : Number(e.target.value))}
                  className={field}
                >
                  <option value="">No name column</option>
                  {sheet.headers.map((header, i) => (
                    <option key={i} value={i}>{header}</option>
                  ))}
                </select>
              </label>
            </div>
            <p data-testid="import-preview" className="rounded-xl bg-[#F7F6F4] px-4 py-3 text-[#00373E]">
              <strong>{preview.rows.length}</strong> {preview.rows.length === 1 ? 'address' : 'addresses'} to import
              {preview.invalid > 0 && <> · {preview.invalid} not valid</>}
              {preview.duplicates > 0 && <> · {preview.duplicates} repeated in the file</>}
            </p>
            {preview.rows.length > 0 && (
              <ul aria-label="First rows" className="space-y-1 text-xs text-gray-500">
                {preview.rows.slice(0, 5).map((row) => (
                  <li key={row.email}>
                    {row.email}
                    {row.name ? ` · ${row.name}` : ''}
                  </li>
                ))}
              </ul>
            )}
            <label className="block">
              <span className={label}>Where and when did these people agree?</span>
              <textarea
                value={statement}
                onChange={(e) => setStatement(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="For example: clients who ticked the newsletter box on the intake form, 2025–26"
                className={field}
              />
            </label>
            <label className="flex items-start gap-2 text-[#00373E]">
              <input
                type="checkbox"
                checked={attested}
                onChange={(e) => setAttested(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[#ED7428]"
              />
              <span>Everyone on this list agreed to receive the Hope Trust newsletter.</span>
            </label>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setSheet(null);
                  setStep('choose');
                }}
                className={secondary}
              >
                Choose another file
              </button>
              <button type="button" onClick={handleImport} disabled={!ready} className={primary}>
                Import {count(preview.rows.length)}
              </button>
            </div>
          </div>
        )}

        {step === 'working' && (
          <div className="flex flex-col items-center py-10 text-sm text-gray-600">
            <Loader2 className="mb-3 h-6 w-6 animate-spin text-[#ED7428]" />
            <progress value={progressValue} max={1} aria-label="Import progress" className="mb-3 h-2 w-full max-w-sm accent-[#ED7428]" />
            <p role="status">{progress}</p>
          </div>
        )}

        {step === 'done' && result && (
          <div className="mt-4 space-y-4 text-sm">
            {!error && (
              <p className="flex items-center gap-2 font-semibold text-emerald-700">
                <CheckCircle2 className="h-5 w-5" />
                Import finished
              </p>
            )}
            <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-[#00373E]">
              <dt>Added</dt>
              <dd className="text-right font-semibold">{result.inserted}</dd>
              <dt>Already on the list, skipped</dt>
              <dd className="text-right">{result.skipped_existing}</dd>
              <dt>Deleted earlier, skipped</dt>
              <dd className="text-right">{result.skipped_erased}</dd>
              <dt>Not valid</dt>
              <dd className="text-right">{result.invalid}</dd>
              <dt>Repeated in the file</dt>
              <dd className="text-right">{result.duplicates}</dd>
              {sync && (
                <>
                  <dt>Sent to Resend</dt>
                  <dd className="text-right">{sync.pushed}</dd>
                </>
              )}
            </dl>
            {sync && sync.remaining > 0 && (
              <p className="text-amber-700">
                {sync.remaining} still waiting for Resend. Use &quot;Sync with Resend&quot; to finish.
                {sync.errors.length > 0 ? ` (${sync.errors.join('; ')})` : ''}
              </p>
            )}
            <div className="flex justify-end">
              <button type="button" onClick={onClose} className={secondary}>
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write the subscribers screen and the tab**

Create `components/admin/newsletter/SubscribersScreen.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  UserMinus,
} from 'lucide-react';
import {
  UnauthorizedError,
  deleteSubscriber,
  downloadSubscribersCsv,
  fetchSubscribers,
  syncUntilDone,
  unsubscribeSubscriber,
  type SubscriberList,
  type SyncResult,
} from '@/lib/newsletter-admin';
import type { AdminSubscriber, SubscriberSource, SubscriberStatus } from '@/lib/newsletter/subscriber';
import ImportDialog from './ImportDialog';

const PAGE_SIZE = 25;

const STATUS_META: Record<SubscriberStatus, { label: string; className: string }> = {
  subscribed: { label: 'Subscribed', className: 'bg-emerald-100 text-emerald-800' },
  pending: { label: 'Not confirmed yet', className: 'bg-amber-100 text-amber-800' },
  unsubscribed: { label: 'Unsubscribed', className: 'bg-gray-100 text-gray-700' },
};
const SOURCE_LABEL: Record<SubscriberSource, string> = { website: 'Website', import: 'Imported' };

const field =
  'w-full rounded-xl border border-gray-200 bg-[#F7F6F4]/50 px-3 py-2.5 text-sm outline-none transition focus:border-[#ED7428] focus:bg-white focus:ring-2 focus:ring-[#ED7428]/20';
const filterLabel = 'mb-1 block text-[11px] font-semibold uppercase tracking-wider text-gray-500';
const barButton =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 px-3 py-2 text-xs font-medium text-white/80 transition hover:bg-white/10 hover:text-white disabled:opacity-60 sm:px-4 sm:text-sm';
const rowButton =
  'inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold transition hover:bg-gray-50 disabled:opacity-40';

export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

/** One sentence about a finished sync, for the screen. */
export function syncSummary(r: SyncResult): string {
  const parts: string[] = [];
  if (r.pushed) parts.push(`sent ${r.pushed} change${r.pushed === 1 ? '' : 's'} to Resend`);
  if (r.unsubscribedInResend) parts.push(`${r.unsubscribedInResend} unsubscribed from an email`);
  if (r.removedFromSegment) parts.push(`${r.removedFromSegment} with no consent on record taken out of Resend's list`);
  if (r.remaining) parts.push(`${r.remaining} still waiting`);
  if (parts.length === 0) return 'Resend is up to date.';
  const text = parts.join('; ');
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

function detail(s: AdminSubscriber): string {
  if (s.status === 'unsubscribed') {
    const how = s.unsubscribe_source === 'admin' ? 'by staff' : s.unsubscribe_source === 'resend' ? 'from an email' : '';
    return ['unsubscribed', how, s.unsubscribed_at ? formatDate(s.unsubscribed_at) : ''].filter(Boolean).join(' ');
  }
  return s.consent_at ? `agreed ${formatDate(s.consent_at)}` : `signed up ${formatDate(s.created_at)}`;
}

export interface SubscribersScreenProps {
  token: string;
  onUnauthorized: () => void;
}

/** The Subscribers screen of the Newsletter tab (spec §8.2). */
export default function SubscribersScreen({ token, onUnauthorized }: SubscribersScreenProps) {
  const [status, setStatus] = useState<SubscriberStatus | ''>('');
  const [source, setSource] = useState<SubscriberSource | ''>('');
  const [searchInput, setSearchInput] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [data, setData] = useState<SubscriberList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [syncLabel, setSyncLabel] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  // Search as the admin types, without a request on every key.
  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(searchInput.trim());
      setPage(0);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const query = useMemo(() => ({ q, status, source, limit: PAGE_SIZE, offset: page * PAGE_SIZE }), [q, status, source, page]);

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
      setData(await fetchSubscribers(token, query));
    } catch (e) {
      fail(e, 'Failed to load subscribers');
    } finally {
      setLoading(false);
    }
  }, [token, query, fail]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSync() {
    setSyncLabel('Syncing…');
    setError('');
    setNotice('');
    try {
      const result = await syncUntilDone(token, (p) => setSyncLabel(`Syncing… ${p.remaining} left`));
      setNotice(syncSummary(result));
      if (result.errors.length > 0) setError(`Some changes didn't reach Resend: ${result.errors.join('; ')}`);
      await load();
    } catch (e) {
      fail(e, 'Sync failed');
    } finally {
      setSyncLabel(null);
    }
  }

  async function act(s: AdminSubscriber, question: string, run: () => Promise<unknown>, done: string, fallback: string) {
    if (!window.confirm(question)) return;
    setBusyId(s.id);
    setError('');
    setNotice('');
    try {
      await run();
      setNotice(done);
      await load();
    } catch (e) {
      fail(e, fallback);
    } finally {
      setBusyId(null);
    }
  }

  const handleUnsubscribe = (s: AdminSubscriber) =>
    act(
      s,
      `Unsubscribe ${s.email}? They won't get any more newsletters unless they sign up again on the website.`,
      () => unsubscribeSubscriber(token, s.id),
      `${s.email} is unsubscribed.`,
      'Unsubscribe failed',
    );

  const handleDelete = (s: AdminSubscriber) =>
    act(
      s,
      `Delete ${s.email} for good? Their details and consent record are removed here and in Resend. An import can't add them back; only signing up again on the website can.`,
      () => deleteSubscriber(token, s.id),
      `${s.email} was deleted.`,
      'Delete failed',
    );

  async function handleExport() {
    setExporting(true);
    setError('');
    try {
      await downloadSubscribersCsv(token, { q, status, source });
    } catch (e) {
      fail(e, 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rows = data?.subscribers ?? [];

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 rounded-2xl bg-gradient-to-r from-[#00373E] to-[#024a53] p-4 shadow-sm sm:p-5 lg:flex-row lg:items-center lg:gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-white sm:text-lg">Newsletter subscribers</h2>
          <p className="text-xs text-white/60 sm:text-sm">
            {data
              ? `${data.counts.subscribed} subscribed · ${data.counts.pending} not confirmed yet · ${data.counts.unsubscribed} unsubscribed`
              : 'Loading…'}
            {data && data.needs_push > 0
              ? ` · ${data.needs_push} change${data.needs_push === 1 ? '' : 's'} waiting for Resend`
              : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={handleSync} disabled={syncLabel !== null} className={barButton}>
            <RefreshCw className={`h-4 w-4 ${syncLabel ? 'animate-spin' : ''}`} />
            {syncLabel ?? 'Sync with Resend'}
          </button>
          <button type="button" onClick={() => setImportOpen(true)} className={barButton}>
            <Upload className="h-4 w-4" />
            Import
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting || total === 0}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#ED7428] px-3 py-2 text-xs font-semibold text-white shadow-lg shadow-[#ED7428]/20 transition hover:bg-[#d4651f] disabled:opacity-60 sm:px-4 sm:text-sm"
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Export CSV
          </button>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-3 rounded-2xl bg-white p-4 shadow-sm sm:grid-cols-4">
        <div className="sm:col-span-2">
          <label htmlFor="nl-search" className={filterLabel}>Search</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              id="nl-search"
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Name or email…"
              className={`${field} pl-9`}
            />
          </div>
        </div>
        <div>
          <label htmlFor="nl-status" className={filterLabel}>Status</label>
          <select
            id="nl-status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as SubscriberStatus | '');
              setPage(0);
            }}
            className={field}
          >
            <option value="">All statuses</option>
            <option value="subscribed">Subscribed</option>
            <option value="pending">Not confirmed yet</option>
            <option value="unsubscribed">Unsubscribed</option>
          </select>
        </div>
        <div>
          <label htmlFor="nl-source" className={filterLabel}>Source</label>
          <select
            id="nl-source"
            value={source}
            onChange={(e) => {
              setSource(e.target.value as SubscriberSource | '');
              setPage(0);
            }}
            className={field}
          >
            <option value="">All sources</option>
            <option value="website">Website</option>
            <option value="import">Imported</option>
          </select>
        </div>
      </div>

      {notice && (
        <div role="status" className="mb-4 flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          {notice}
        </div>
      )}
      {error && (
        <div role="alert" className="mb-4 flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
        {loading && !data ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-[#ED7428]" />
            <p className="mt-3 text-sm text-gray-400">Loading subscribers…</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-lg font-semibold text-[#00373E]">No subscribers found</p>
            <p className="mt-1 text-sm text-gray-400">Website sign-ups and imports appear here.</p>
          </div>
        ) : (
          <>
            <ul className="divide-y divide-gray-100">
              {rows.map((s) => (
                <li key={s.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:px-5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-[#00373E]">{s.full_name || '—'}</p>
                    <p className="truncate text-xs text-gray-500">{s.email}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 sm:w-80">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${STATUS_META[s.status].className}`}>
                      {STATUS_META[s.status].label}
                    </span>
                    <span>{SOURCE_LABEL[s.source]}</span>
                    <span>· {detail(s)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {s.status === 'subscribed' && (
                      <button
                        type="button"
                        onClick={() => handleUnsubscribe(s)}
                        disabled={busyId === s.id}
                        aria-label={`Unsubscribe ${s.email}`}
                        className={`${rowButton} text-[#00373E]`}
                      >
                        <UserMinus className="h-3.5 w-3.5" />
                        Unsubscribe
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDelete(s)}
                      disabled={busyId === s.id}
                      aria-label={`Delete ${s.email}`}
                      className={`${rowButton} text-red-600`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            <div className="flex flex-col items-center justify-between gap-3 border-t border-gray-100 px-4 py-3 text-sm text-gray-600 sm:flex-row">
              <span className="text-xs sm:text-sm">
                Showing <strong>{page * PAGE_SIZE + 1}</strong>–<strong>{Math.min((page + 1) * PAGE_SIZE, total)}</strong> of{' '}
                <strong>{total}</strong>
              </span>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className={`${rowButton} text-[#00373E]`}>
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Prev
                </button>
                <span className="px-2 text-xs">
                  Page {page + 1} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className={`${rowButton} text-[#00373E]`}
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {importOpen && (
        <ImportDialog token={token} onClose={() => setImportOpen(false)} onFinished={load} onUnauthorized={onUnauthorized} />
      )}
    </div>
  );
}
```

Create `components/admin/newsletter/NewsletterTab.tsx`:

```tsx
'use client';

import SubscribersScreen from './SubscribersScreen';

export interface NewsletterTabProps {
  token: string;
  onUnauthorized: () => void;
}

/** The Newsletter tab in /arel-ops. Plan 3 adds the Issues screen next to Subscribers. */
export default function NewsletterTab({ token, onUnauthorized }: NewsletterTabProps) {
  return <SubscribersScreen token={token} onUnauthorized={onUnauthorized} />;
}
```

- [ ] **Step 5: Add the tab to /arel-ops**

In `app/arel-ops/page.tsx`:

1. In the `lucide-react` import line, add `Newspaper` after `GraduationCap`.
2. Below the two `// PAYMENT DISABLED … // import EnrollmentsTab …` comment lines, add:

```tsx
import NewsletterTab from '@/components/admin/newsletter/NewsletterTab';
```

3. Change:

```tsx
  const [activeTab, setActiveTab] = useState<'addiction' | 'training'>('addiction');
```

to:

```tsx
  const [activeTab, setActiveTab] = useState<'addiction' | 'training' | 'newsletter'>('addiction');
```

4. Directly after the Training tab button, which ends:

```tsx
            <span className="hidden sm:inline">Training Programs ({trainingPrograms.length})</span>
          </button>
```

add:

```tsx
          <button
            onClick={() => setActiveTab('newsletter')}
            className={`inline-flex flex-shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2.5 text-xs font-semibold transition-all sm:flex-1 sm:gap-2 sm:px-4 sm:py-3 sm:text-sm ${
              activeTab === 'newsletter'
                ? 'bg-[#00373E] text-white shadow-lg'
                : 'text-gray-500 hover:bg-gray-100 hover:text-[#00373E]'
            }`}
          >
            <Newspaper className="h-4 w-4" />
            Newsletter
          </button>
```

5. Directly above the commented-out block that starts `{/* PAYMENT DISABLED — uncomment when Razorpay is integrated` and contains `{activeTab === 'enrollments' && (`, add:

```tsx
        {/* ── Newsletter Tab ── */}
        {activeTab === 'newsletter' && <NewsletterTab token={token} onUnauthorized={onLogout} />}

```

- [ ] **Step 6: Run the component tests and the type check**

Run: `npx vitest run tests/vitest/components/admin/`
Expected: PASS.

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 7: Add the end-to-end test and run it**

Add to `tests/e2e/newsletter.spec.ts`:

```ts
test.describe('Admin newsletter tab', () => {
  test('lists subscribers from the API', async ({ page }) => {
    // The dashboard only reads the token's expiry; the mocked API accepts anything.
    const payload = Buffer.from(
      JSON.stringify({ email: 'admin@example.com', role: 'admin', exp: Math.floor(Date.now() / 1000) + 3600 }),
    ).toString('base64');
    await page.addInitScript((token) => {
      sessionStorage.setItem('admin_token', token);
      sessionStorage.setItem('admin_email', 'admin@example.com');
    }, `e30.${payload}.signature`);
    await page.route('**/api/admin-newsletter-subscribers**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          subscribers: [
            {
              id: 'a', email: 'asha@example.com', full_name: 'Asha Rao', status: 'subscribed', source: 'website',
              consent_at: '2026-10-10T06:30:00.000Z', created_at: '2026-10-10T06:00:00.000Z',
              unsubscribed_at: null, unsubscribe_source: null,
            },
          ],
          total: 1,
          counts: { pending: 0, subscribed: 1, unsubscribed: 0 },
          needs_push: 0,
          limit: 25,
          offset: 0,
        }),
      }),
    );
    await page.goto('/arel-ops/');
    await page.getByRole('button', { name: 'Newsletter' }).click();
    await expect(page.getByRole('heading', { name: 'Newsletter subscribers' })).toBeVisible();
    await expect(page.getByText('asha@example.com')).toBeVisible();
  });
});
```

Run with the dev server running: `E2E_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/newsletter.spec.ts --project=chromium`
Expected: 7 passed. The dashboard may also show "Failed to load programs", because `next dev` doesn't serve `/api/admin-programs`. That's expected, and the test ignores it.

- [ ] **Step 8: Commit**

```bash
git add components/admin/newsletter app/arel-ops/page.tsx tests/vitest/components/admin tests/e2e/newsletter.spec.ts
git commit -m "feat(newsletter): Newsletter tab in /arel-ops: subscribers, import, export, sync" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 16: Remove the old function and update the docs

**Files:**
- Delete: `supabase/functions/send-newsletter/`
- Modify: `.env.example`
- Modify: `docs/superpowers/specs/2026-10-13-newsletter-design.md`

**Interfaces:**
- **Consumes:** the decisions listed at the top of this plan.
- **Produces:** a spec that matches the code. Plan 3 is written from it.

- [ ] **Step 1: Delete the old Supabase function**

`supabase/functions/send-newsletter/` was never deployed: the Supabase MCP `list_edge_functions` returned none on 14 Oct 2026. It reads columns that no longer exist. Spec §14 phase 2 removes it.

Run: `git rm -r supabase/functions/send-newsletter`

`docs/claude.md` and `docs/session.md` still mention it. Plan 3's clean-up rewrites the newsletter parts of `docs/claude.md` (spec §14 phase 4), so leave both files alone here.

- [ ] **Step 2: Document the new variable**

In `.env.example`, replace:

```
# ── Resend (for newsletter + enrollment emails, server-side only) ────────────
RESEND_API_KEY
# "From" address used by enrollment confirmation + newsletter emails
# Must be a verified Resend domain. Format: "Hope Trust <frontoffice@hopetrustindia.com>"
NEWSLETTER_FROM_EMAIL=
```

with:

```
# ── Resend (for newsletter + enrollment emails, server-side only) ────────────
# Must be a Full access key: the newsletter manages Resend contacts and segments.
RESEND_API_KEY
# "From" address for the newsletter, its confirmation emails and enrollment emails.
# Must be on the verified domain: "Hope Trust <newsletter@hopetrustindia.com>"
NEWSLETTER_FROM_EMAIL=
# ID of the "Newsletter" segment in Resend (Audience → Segments)
RESEND_NEWSLETTER_SEGMENT_ID=
```

- [ ] **Step 3: Write the decisions into the spec**

Make these replacements in `docs/superpowers/specs/2026-10-13-newsletter-design.md`.

§4, item 4. After the line `- New: \`RESEND_API_KEY\`, \`RESEND_NEWSLETTER_SEGMENT_ID\`, …`, add:

```markdown
   - `RESEND_API_KEY` must be a **Full access** key. The sync manages contacts and segments, and a Sending access key can't.
```

§5. After the units table, add:

```markdown
**As built in plan 2:**

- The handlers are in `netlify/functions/_shared/newsletter-signup.mts`, `newsletter-admin.mts` and `newsletter-sync.mts`.
- Their services (database, Resend, settings, clock, admin check) are passed in through `newsletter-deps.mts`, so tests use in-memory versions.
- The JSON and CORS helpers are in `http.mts`, and the audit-log write is in `newsletter-db.mts`. `admin.mts` keeps only the JWT check.
```

§7.2, step 3. Replace:

```markdown
3. **Rate limit**, using the same counting pattern as `create-order`. These limits stop the form being used to flood someone's inbox.
   - At most 5 confirmation emails per IP address per 15 minutes.
   - Per email address: at least 10 minutes between confirmation emails, and at most 3 while the address is pending.
```

with:

```markdown
3. **Rate limit.** These limits stop the form being used to flood someone's inbox.
   - **Per IP address:** confirmation emails for at most 5 addresses per 15 minutes. Over that, the form says to try again later (429). This limit describes the requester, not the address.
   - **Per email address:** at least 10 minutes between confirmation emails, and at most 3 before the address confirms, counted over 30 days. Over these limits the answer is the normal success message and nothing is sent. A different answer would show that the address had signed up recently.
```

§7.3. Replace:

```markdown
- **The link** is `https://hopetrustindia.com/newsletter/confirm/?t=<token>`.
```

with:

```markdown
- **The link** is `https://hopetrustindia.com/newsletter/confirm/#t=<token>`. The token is in the URL fragment, which browsers never send to a server, so it stays out of server logs and Google Analytics.
```

In the same section, replace:

```markdown
    1. sets the row to `subscribed`, with `consent_at` set to now, and clears `unsubscribed_at` and `unsubscribe_source`;
```

with:

```markdown
    1. sets the row to `subscribed` with `source = 'website'`, `consent_at` set to now and a `consent_note` naming the page and notice version, and clears `unsubscribed_at` and `unsubscribe_source`;
```

§7.5. Replace:

```markdown
Delete removes the row and the Resend contact. The audit log records the subscriber ID, not the email address.
```

with:

```markdown
Delete removes the Resend contact first, then the row. If Resend fails, the row stays: the delete can be retried, and nobody is left in the segment with no row behind them. The audit log records the subscriber ID, not the email address.
```

§9.3. Replace:

```markdown
1. **Pull.** List the contacts in the Newsletter segment, 100 per page. Any contact unsubscribed in Resend but `subscribed` in Supabase becomes `unsubscribed`, with `unsubscribe_source = 'resend'`.
2. **Push.** Take rows where `resend_synced_at is null`, about 40 per call. Resend allows 10 requests a second, and Netlify functions time out after about 10 seconds. For each row:
   - **Subscribed:** create the contact in the segment. If it already exists, update it to `unsubscribed: false` and make sure it's in the segment. Resend's docs confirm create, update and delete by email; the exact call for adding an existing contact to a segment gets checked in phase 2.
   - **Unsubscribed:** update it to `unsubscribed: true`.
   - Then set `resend_synced_at`.
```

with:

```markdown
1. **Pull.** List the contacts in the Newsletter segment, 100 per page.
   - **Unsubscribed in Resend, `subscribed` here:** the row becomes `unsubscribed`, with `unsubscribe_source = 'resend'`. The exception is a row with a change still waiting to go to Resend: that change is newer consent, such as a confirmation, so the row is left alone.
   - **Subscribed in Resend, `unsubscribed` here:** the unsubscribe is pushed again.
   - **In the segment with no consent on record** (no row, or a pending one): the contact is removed from the segment.
2. **Push.** Take rows where `resend_synced_at is null`, oldest change first, for about 7 seconds per call. Resend allows 10 requests a second, and Netlify may stop a function after 10 seconds. For each row:
   - **Subscribed:** look the contact up by email.
     - If there is none, create it straight into the segment.
     - If there is one, set `unsubscribed: false` and add it to the segment (`POST /contacts/{id}/segments/{segment_id}`).
     - The exception is an imported row whose address already unsubscribed in Resend: it stays unsubscribed.
   - **Unsubscribed:** update the contact to `unsubscribed: true`. If Resend has no such contact, there's nothing to do.
   - Only the email address and the subscription state go to Resend, never names.
   - Then set `resend_synced_at`, but only if the row hasn't changed since it was read.
```

§10. Replace:

```markdown
All SQL goes in `Database/newsletter.sql`, alongside the other schema files.
```

with:

```markdown
The tables are in `Database/newsletter.sql` and the image bucket is in `Database/newsletter-storage.sql`. `Database/newsletter.sql` has the exact schema; the blocks below are the design.
```

§10.1. After the line `` `full_name` may be empty only for imported rows; the website form requires it. ``, add:

```markdown

**As built in plan 2:**

- **New column:** `signup_notice` holds the notice version the person saw.
- **`confirm_token_hash` is unique.**
- **`signup_page`, `signup_ip`, `signup_user_agent` and `signup_notice`** describe the latest website sign-up request.
- **`consent_at` and `consent_note`** describe the consent itself. They change only on confirmation or import, so an unconfirmed re-signup never overwrites the record of when and how someone first agreed.
- **`source`** is where the current consent came from.
```

- [ ] **Step 4: Run the whole suite and the type check**

Run: `npx vitest run`
Expected: only the 7 known failures (`Header.test.tsx` 1, `pages/contact.test.tsx` 6). `tests/vitest/config/api-redirects.test.ts` passes: every `/api/…` path the new code fetches is routed in `netlify.toml`.

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors. `next build` runs the same check, so an error here would fail the Netlify deploy.

- [ ] **Step 5: Commit**

```bash
git add -A supabase .env.example docs/superpowers/specs/2026-10-13-newsletter-design.md
git commit -m "chore(newsletter): remove the never-deployed Supabase function; record plan 2 decisions in the spec" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: Check the whole flow with real services

This is spec §14 phase 2's exit: real signups confirm and appear in Resend. It runs locally under `netlify dev`, against the live Supabase database and Resend account. Test rows are deleted at the end. It needs the user: their inbox, their admin login, and the Resend dashboard.

**Files:**
- Create, not committed: `.newsletter-preview/segment.mts`
- Modify: `docs/superpowers/specs/2026-10-13-newsletter-design.md`, appending §17 "Phase 2 results"

**Interfaces:**
- **Consumes:** everything above, and `RESEND_NEWSLETTER_SEGMENT_ID` from Task 1.
- **Produces:** the recorded results.

- [ ] **Step 1: Ask the user**

1. Which inbox to sign up with: theirs, Gmail recommended. Also three plus-addresses on it for the import, such as `name+nl1@gmail.com`. No newsletters are sent in this plan, so those addresses receive nothing.
2. That it's fine to write test rows to the live `newsletter_subscribers` table and create test contacts in Resend. Both are deleted in Step 9.
3. That they can log in to `/arel-ops` and open the Resend dashboard.

- [ ] **Step 2: Check the environment**

Run:

```bash
node --env-file=.env -e "for (const k of ['NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','ADMIN_JWT_SECRET','RESEND_API_KEY','RESEND_NEWSLETTER_SEGMENT_ID','NEWSLETTER_FROM_EMAIL']) console.log(k, process.env[k] ? 'set' : 'MISSING')"
```

Expected: every line says `set`. `NEWSLETTER_FROM_EMAIL` must be `"Hope Trust <newsletter@hopetrustindia.com>"`.

Create `.newsletter-preview/segment.mts`, which lists the Newsletter segment:

```ts
// node --env-file=.env .newsletter-preview/segment.mts
const res = await fetch(
  `https://api.resend.com/contacts?segment_id=${process.env.RESEND_NEWSLETTER_SEGMENT_ID}&limit=100`,
  { headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` } },
);
const body = await res.json();
for (const c of body.data ?? []) console.log(`${c.email}  ${c.unsubscribed ? 'UNSUBSCRIBED' : 'subscribed'}`);
console.log(`(${body.data?.length ?? 0} contacts, more: ${body.has_more ?? false})`);
```

- [ ] **Step 3: Start the site with its functions**

Stop the `npm run dev` from Task 11: `netlify dev` starts its own, and two dev servers in one folder clash. Then run `npx netlify dev` in the background. It serves the site, the functions and the `netlify.toml` redirects on port 8888, using `.env`.

Wait until `curl -s -o /dev/null -w "%{http_code}" http://localhost:8888/` prints `200`.

- [ ] **Step 4: Sign up and confirm**

1. The user opens `http://localhost:8888/blogs/`, signs up with their address, and sees "Check your inbox to confirm your subscription".
2. The email arrives from `Hope Trust <newsletter@hopetrustindia.com>` with the subject "Confirm your Hope Trust newsletter subscription". Its link starts with `http://localhost:8888/newsletter/confirm/#t=`.
3. The user clicks the link, then "Confirm my subscription", and sees "You're subscribed".

Check the row with the MCP tool `execute_sql`, replacing the address:

```sql
select status, source, consent_at is not null as consented, consent_note,
       confirm_token_hash is null as token_cleared, resend_contact_id is not null as in_resend,
       resend_synced_at is not null as synced
from public.newsletter_subscribers where email = '<their address>';
```

Expected: `subscribed`, `website`, `true`, a note naming `/blogs/` and `2026-10`, `true`, `true`, `true`.

Run `node --env-file=.env .newsletter-preview/segment.mts`. Expected: the address is listed as `subscribed`.

- [ ] **Step 5: Import and sync**

1. Make `test-import.csv` with these lines, using the user's three plus-addresses:

```
Email,Name
<address 1>,Asha Test
<address 2>,रवि टेस्ट
<address 3>,Meena Test
```

2. In `/arel-ops` → Newsletter → Import, upload it. The preview should say "3 addresses to import".
3. Enter the statement "Test import by <name>, 14 Oct 2026", tick the box, and import.

Expected: "Added 3", "Sent to Resend 3", the three addresses in the list as Subscribed and Imported, and all three in `segment.mts`.

- [ ] **Step 6: Unsubscribe both ways**

1. Click Unsubscribe on address 1 and confirm. `segment.mts` should show it `UNSUBSCRIBED` at once.
2. In the Resend dashboard (Audience → Contacts), unsubscribe address 2. In `/arel-ops`, press Sync with Resend.

Expected: a message that includes "1 unsubscribed from an email". Address 2 now shows "Unsubscribed · unsubscribed from an email".

- [ ] **Step 7: Sign up again after unsubscribing**

1. Sign up on `http://localhost:8888/` (the homepage card) with address 1.
2. Before confirming, the admin list still shows it Unsubscribed.
3. Confirm through the new email.

Expected: address 1 shows Subscribed with source Website, and `segment.mts` shows it `subscribed`.

- [ ] **Step 8: Export, delete, and re-import**

1. Export CSV, then open the file in Excel or Google Sheets. Expected: the columns match `CSV_COLUMNS`, and "रवि टेस्ट" shows correctly.
2. Delete address 3. Expected: it's gone from the list and from `segment.mts`.
3. Import `test-import.csv` again. Expected: "Already on the list, skipped 2" and "Deleted earlier, skipped 1".

- [ ] **Step 9: Clean up**

1. Delete every remaining test row in `/arel-ops`. Delete also removes the Resend contacts.
2. Check that `segment.mts` lists none of the test addresses.
3. Stop `netlify dev` and delete `test-import.csv`.

Their hashes stay in `newsletter_erased`, so a later import skips these addresses; a website signup still works. If the user wants the addresses importable again, ask first, then run:

```sql
delete from public.newsletter_erased where erased_at > '<when Step 4 started>';
```

- [ ] **Step 10: Record the results in the spec**

Append to `docs/superpowers/specs/2026-10-13-newsletter-design.md`:

```markdown
## 17. Phase 2 results

Recorded <date>, from plan 2 (`docs/superpowers/plans/2026-10-14-newsletter-phase-2-subscribers.md`).

Plan 2 also added:

- A newsletter section in the privacy policy (`/privacy-policy/#newsletter`), which the form's notice links to. Hope Trust approves its wording before the forms go live.
- A UTF-8 byte-order mark at the start of the CSV export.
- Formula-safe CSV cells: a cell starting with `=`, `+`, `-` or `@` gets a leading `'`, so Excel can't run it.

| Check | Result |
|---|---|
| Resend contact calls (plan 2, Task 1) | <statuses that differed from the docs, or "as documented"> |
| Sign-up → confirmation email → confirm page | <pass/fail, with notes> |
| Confirmed row: consent recorded, contact in the Newsletter segment | <…> |
| Import of 3 rows → sync → contacts in Resend | <…> |
| Admin Unsubscribe → contact unsubscribed in Resend at once | <…> |
| Unsubscribe in Resend → Sync → row unsubscribed (source resend) | <…> |
| Sign up again after unsubscribing → subscribed again after confirming | <…> |
| Delete → contact gone, hash kept, re-import skipped | <…> |
| CSV export: columns, Hindi name intact | <…> |
| Netlify bundles the three functions (Task 10, Step 5) | <…> |
```

Fill in each cell with what was actually seen.

- [ ] **Step 11: Commit**

```bash
git add docs/superpowers/specs/2026-10-13-newsletter-design.md
git commit -m "docs(newsletter): record phase 2 checks" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 18: Decide whether signups go live before plan 3

Merging to `main` deploys the site, and the signup forms would go live. People could sign up and confirm, but plan 3 is needed before an issue can be sent to them. The list would start growing early. This is the user's decision, and Hope Trust has to approve two things first.

- [ ] **Step 1: Ask the user**

Present this checklist and ask whether to ship plan 2 now or wait for plan 3:

1. **Hope Trust approved** the privacy policy section (Task 13) and the homepage card's sentence: "A monthly letter from our team, with ideas you can use between sessions."
2. **Netlify environment variables** are set for production, with the Functions scope:
   - `RESEND_API_KEY`, a Full access key;
   - `RESEND_NEWSLETTER_SEGMENT_ID`;
   - `NEWSLETTER_FROM_EMAIL="Hope Trust <newsletter@hopetrustindia.com>"`.

   `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `ADMIN_JWT_SECRET` are already set.
3. **The database changes** were applied in Task 2.

- [ ] **Step 2a: If they say ship**

1. Push the branch and open a pull request to `main` with `gh pr create`. Describe what goes live and list the checks from Task 17. End the description with the attribution line from the session's instructions.
2. Merge only when the user says to.
3. After the deploy, the user signs up on https://hopetrustindia.com with their own address and confirms.
4. Check the row (Task 17, Step 4) and `segment.mts`.
5. Delete that test row in `/arel-ops`, unless the user wants to stay subscribed.

- [ ] **Step 2b: If they say wait**

Leave `feat-newsletter` as it is. Plan 3 continues on it.

---

## After this plan

Before plan 3's first broadcast, someone with Resend access brands the unsubscribe page (spec §4, step 3). Signups don't need it, so this plan doesn't.

Write plan 3 (issues, the editor, test send, send, history, clean-up) from the spec and the §17 results. Plan 3 reuses:

- `NewsletterDeps` and `liveDeps`, adding an `issues` part to the database layer;
- `pushAndRecord` and `runSync`, for the sync before every send (spec §9.1, step 3);
- `ResendClient`, adding broadcast calls;
- `NewsletterTab`, adding the Issues screen next to Subscribers;
- the deferred minors from plan 1's final review, listed in the conversation that wrote this plan:
  - half an emoji in the preview line;
  - the editor's allowed content;
  - a safeguard for the preview script.
