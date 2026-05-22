-- ─────────────────────────────────────────────────────────────────
-- 014  Reconcile overlapping score columns
-- ─────────────────────────────────────────────────────────────────
-- Migration 004 added: score_above90, score_70to89, score_below70
--                      official_count, external_count, not_found_count
-- Migration 009 added: score_50_to_89, score_below_50 (different threshold!)
--                      official_source, external_source, not_found
-- Code settled on the 009 names, leaving 004 originals orphaned.
-- This migration drops the duplicates and renames to canonical form:
--   score_90_100, score_70_89, score_below_70
--
-- Rollback (manual — run if needed):
--   ALTER TABLE verification_jobs RENAME COLUMN score_90_100 TO score_above90;
--   ALTER TABLE verification_jobs RENAME COLUMN score_70_89  TO score_70to89;
--   ALTER TABLE verification_jobs RENAME COLUMN score_below_70 TO score_below70;
--   ALTER TABLE verification_jobs ADD COLUMN score_50_to_89 INT DEFAULT 0;
--   ALTER TABLE verification_jobs ADD COLUMN score_below_50 INT DEFAULT 0;
-- ─────────────────────────────────────────────────────────────────

-- 1. Drop columns from migration 009 that are superseded
ALTER TABLE verification_jobs DROP COLUMN IF EXISTS score_50_to_89;
ALTER TABLE verification_jobs DROP COLUMN IF EXISTS score_below_50;

-- 2. Drop orphaned source-count columns from migration 004
--    (replaced by official_source / external_source / not_found from 009)
ALTER TABLE verification_jobs DROP COLUMN IF EXISTS official_count;
ALTER TABLE verification_jobs DROP COLUMN IF EXISTS external_count;
ALTER TABLE verification_jobs DROP COLUMN IF EXISTS not_found_count;

-- 3. Rename migration 004 score columns to cleaner canonical names
--    Uses DO block because PostgreSQL has no RENAME COLUMN IF EXISTS.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'verification_jobs' AND column_name = 'score_above90'
  ) THEN
    ALTER TABLE verification_jobs RENAME COLUMN score_above90 TO score_90_100;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'verification_jobs' AND column_name = 'score_70to89'
  ) THEN
    ALTER TABLE verification_jobs RENAME COLUMN score_70to89 TO score_70_89;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'verification_jobs' AND column_name = 'score_below70'
  ) THEN
    ALTER TABLE verification_jobs RENAME COLUMN score_below70 TO score_below_70;
  END IF;
END
$$;

-- 4. Add check constraint (idempotent via DROP + ADD)
ALTER TABLE verification_jobs
  DROP CONSTRAINT IF EXISTS chk_score_columns_nonneg;
ALTER TABLE verification_jobs
  ADD CONSTRAINT chk_score_columns_nonneg
  CHECK (score_90_100 >= 0 AND score_70_89 >= 0 AND score_below_70 >= 0);
