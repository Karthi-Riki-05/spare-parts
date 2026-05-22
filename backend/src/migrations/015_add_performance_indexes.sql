-- ─────────────────────────────────────────────────────────────────
-- 015  Add missing composite performance indexes
-- ─────────────────────────────────────────────────────────────────
-- Uses CREATE INDEX CONCURRENTLY — run.js detects this keyword and
-- skips the transaction wrapper (CONCURRENTLY cannot run in a tx).
-- IF NOT EXISTS makes each statement idempotent on retry.
--
-- Rollback:
--   DROP INDEX IF EXISTS idx_jobs_company_created;
--   DROP INDEX IF EXISTS idx_jobs_status_created;
--   DROP INDEX IF EXISTS idx_job_results_job_rowtype;
-- ─────────────────────────────────────────────────────────────────

-- Fast company job listing (ORDER BY created_at DESC covered by index)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_company_created
  ON verification_jobs(company_id, created_at DESC);

-- Fast status + age queries (cleanup, admin views)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_status_created
  ON verification_jobs(status, created_at DESC);

-- Fast result-row lookups filtered by row_type (the most common query)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_job_results_job_rowtype
  ON job_results(job_id, row_type);
