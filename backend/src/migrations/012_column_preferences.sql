CREATE TABLE IF NOT EXISTS column_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  preference_key VARCHAR(255) NOT NULL,
  hidden_columns JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (company_id, preference_key)
);

CREATE INDEX IF NOT EXISTS idx_col_prefs_company
  ON column_preferences(company_id);
