-- Backfill re_verify_after for rows cached under the pre-2026-04 policy
-- that set re_verify_after = NULL when score >= 90 (meaning "never re-verify").
-- New policy: score >= 90 → re-verify every 180 days.
-- Using (verified_at + 180 days) keeps the re-verify moment anchored to when
-- the row was actually verified, not to the migration run time.

UPDATE verification_cache
SET re_verify_after = verified_at + INTERVAL '180 days'
WHERE re_verify_after IS NULL
  AND score >= 90;
