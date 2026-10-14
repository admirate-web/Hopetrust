-- ============================================================
-- RLS POLICIES — Hope Trust India
-- Run this in: Supabase Dashboard > SQL Editor
-- This script is IDEMPOTENT — safe to re-run at any time.
-- ============================================================

-- ------------------------------------------------------------
-- TABLE: contact_submissions
-- Policy: anon can INSERT only. No SELECT / UPDATE / DELETE.
-- ------------------------------------------------------------

ALTER TABLE contact_submissions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first (idempotent)
DROP POLICY IF EXISTS "Allow anonymous inserts"        ON contact_submissions;
DROP POLICY IF EXISTS "anon_insert_contact"            ON contact_submissions;
DROP POLICY IF EXISTS "anon_select_contact"            ON contact_submissions;
DROP POLICY IF EXISTS "Deny anon select"               ON contact_submissions;
DROP POLICY IF EXISTS "Deny anon update"               ON contact_submissions;
DROP POLICY IF EXISTS "Deny anon delete"               ON contact_submissions;

-- INSERT: allowed for anon with data validation
CREATE POLICY "anon_insert_contact" ON contact_submissions
  FOR INSERT
  TO anon
  WITH CHECK (
    full_name  IS NOT NULL AND char_length(trim(full_name))  >= 2  AND char_length(trim(full_name))  <= 200 AND
    email      IS NOT NULL AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'                                        AND
    phone      IS NOT NULL AND char_length(trim(phone))      >= 7  AND char_length(trim(phone))      <= 20  AND
    message    IS NOT NULL AND char_length(trim(message))    >= 5  AND char_length(trim(message))    <= 5000
  );

-- SELECT / UPDATE / DELETE: explicitly blocked for anon
--   (No USING policy = implicit deny, but we add explicit ones for clarity)
CREATE POLICY "Deny anon select" ON contact_submissions
  FOR SELECT TO anon USING (false);

CREATE POLICY "Deny anon update" ON contact_submissions
  FOR UPDATE TO anon USING (false);

CREATE POLICY "Deny anon delete" ON contact_submissions
  FOR DELETE TO anon USING (false);


-- ------------------------------------------------------------
-- TABLE: newsletter_subscribers
-- Moved to Database/newsletter.sql (October 2026). It has no anon policies:
-- sign-ups go through the newsletter-subscribe Netlify function.
-- ------------------------------------------------------------


-- ------------------------------------------------------------
-- TABLE: joinus_applications
-- Policy: anon can INSERT only. No SELECT / UPDATE / DELETE.
-- ------------------------------------------------------------

ALTER TABLE joinus_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anonymous inserts"        ON joinus_applications;
DROP POLICY IF EXISTS "anon_insert_joinus"             ON joinus_applications;
DROP POLICY IF EXISTS "Deny anon select"               ON joinus_applications;
DROP POLICY IF EXISTS "Deny anon update"               ON joinus_applications;
DROP POLICY IF EXISTS "Deny anon delete"               ON joinus_applications;

-- INSERT: allowed for anon with data validation
CREATE POLICY "anon_insert_joinus" ON joinus_applications
  FOR INSERT
  TO anon
  WITH CHECK (
    full_name    IS NOT NULL AND char_length(trim(full_name))    >= 2   AND char_length(trim(full_name))    <= 200  AND
    email        IS NOT NULL AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'                                               AND
    position     IS NOT NULL AND char_length(trim(position))     >= 2   AND char_length(trim(position))     <= 200  AND
    cv_link      IS NOT NULL AND cv_link ~ '^https?://'                                                              AND
    introduction IS NOT NULL AND char_length(trim(introduction)) >= 10  AND char_length(trim(introduction)) <= 5000
  );

-- SELECT / UPDATE / DELETE: explicitly blocked for anon
CREATE POLICY "Deny anon select" ON joinus_applications
  FOR SELECT TO anon USING (false);

CREATE POLICY "Deny anon update" ON joinus_applications
  FOR UPDATE TO anon USING (false);

CREATE POLICY "Deny anon delete" ON joinus_applications
  FOR DELETE TO anon USING (false);


-- ------------------------------------------------------------
-- VERIFICATION QUERY
-- Run this after applying policies to confirm setup.
-- Expected: every table shows relrowsecurity = true; contact_submissions and
--           joinus_applications show 1 insert + 3 denials each, and
--           newsletter_subscribers shows no policies (see newsletter.sql).
-- ------------------------------------------------------------

SELECT
  c.relname                    AS table_name,
  c.relrowsecurity             AS rls_enabled,
  p.policyname,
  p.cmd,
  p.roles,
  p.with_check IS NOT NULL     AS has_with_check,
  p.qual IS NOT NULL           AS has_using
FROM pg_class c
LEFT JOIN pg_policies p ON p.tablename = c.relname
WHERE c.relname IN ('contact_submissions', 'newsletter_subscribers', 'joinus_applications')
ORDER BY c.relname, p.cmd;
