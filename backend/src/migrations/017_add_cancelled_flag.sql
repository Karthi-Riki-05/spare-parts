-- Graceful cancel: backend checks this flag after each row batch.
-- Index covers only rows that have actually been cancelled (partial index).
ALTER TABLE verification_jobs ADD COLUMN IF NOT EXISTS cancelled BOOLEAN DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_vj_cancelled ON verification_jobs (job_id) WHERE cancelled = TRUE;
