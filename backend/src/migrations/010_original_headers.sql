ALTER TABLE verification_jobs
  ADD COLUMN IF NOT EXISTS original_headers JSONB DEFAULT NULL;
