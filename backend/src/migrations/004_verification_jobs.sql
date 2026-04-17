CREATE TABLE IF NOT EXISTS verification_jobs (
  job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL DEFAULT 'queued',
  phase VARCHAR(50),
  file_name VARCHAR(255),
  job_type VARCHAR(50) DEFAULT 'verify',
  meta JSONB,
  total_rows INTEGER DEFAULT 0,
  processed_rows INTEGER DEFAULT 0,
  failed_rows INTEGER DEFAULT 0,
  score_above90 INTEGER DEFAULT 0,
  score_70to89 INTEGER DEFAULT 0,
  score_below70 INTEGER DEFAULT 0,
  official_count INTEGER DEFAULT 0,
  external_count INTEGER DEFAULT 0,
  not_found_count INTEGER DEFAULT 0,
  detected_language VARCHAR(100),
  language_code VARCHAR(10),
  translation_needed BOOLEAN DEFAULT FALSE,
  excel_downloaded BOOLEAN DEFAULT FALSE,
  excel_downloaded_at TIMESTAMPTZ,
  notify_email VARCHAR(255),
  duration_seconds INTEGER,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_company ON verification_jobs(company_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON verification_jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_created ON verification_jobs(created_at DESC);
