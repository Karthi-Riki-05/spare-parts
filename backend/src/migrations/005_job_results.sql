CREATE TABLE IF NOT EXISTS job_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES verification_jobs(job_id) ON DELETE CASCADE,
  row_index INTEGER NOT NULL,
  row_data JSONB NOT NULL,
  row_type VARCHAR(50) DEFAULT 'verified',
  original_description TEXT,
  original_supplementary TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (job_id, row_index, row_type)
);

CREATE INDEX IF NOT EXISTS idx_results_job ON job_results(job_id);
CREATE INDEX IF NOT EXISTS idx_results_type ON job_results(job_id, row_type);
