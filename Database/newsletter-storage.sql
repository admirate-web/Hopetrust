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
