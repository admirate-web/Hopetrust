-- ============================================================
-- UPDATE MS. CHANDNI SINGH — Hope Trust India
-- Run this in: Supabase Dashboard > SQL Editor
-- IDEMPOTENT — safe to re-run at any time.
--
-- Gives her an online "Book Session" link (she previously showed
-- "Call +919000850001 to book") and sets her qualification.
-- ============================================================

UPDATE doctors
SET qualification = 'MPhil Clinical Psychology',
    booking_url   = 'https://meet-my-doctor.firebaseapp.com/#/?uid=50401&eid=48109'
WHERE name = 'Ms. Chandni Singh';
