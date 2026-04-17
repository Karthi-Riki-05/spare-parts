CREATE TABLE IF NOT EXISTS ai_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES verification_jobs(job_id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  model VARCHAR(100),
  error_type VARCHAR(100),
  error_msg TEXT,
  row_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_errors_job ON ai_errors(job_id);
CREATE INDEX IF NOT EXISTS idx_errors_company ON ai_errors(company_id);
