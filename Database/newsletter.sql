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
