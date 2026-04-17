-- Bridge columns for P2 — mirror the legacy SQLite job_stats field names so the
-- P2 data-layer swap is a pure mechanical replacement, with zero behavior change
-- visible in the UI. Future phases (P4) will reconcile with the newer bucket
-- names already on verification_jobs (score_above90 / score_70to89 / score_below70).

ALTER TABLE verification_jobs
  ADD COLUMN IF NOT EXISTS web_verified      INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS empty_cells       INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS score_50_to_89    INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS score_below_50    INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS official_source   INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS external_source   INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS not_found         INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_phase     VARCHAR(50),
  ADD COLUMN IF NOT EXISTS results_json      JSONB;
