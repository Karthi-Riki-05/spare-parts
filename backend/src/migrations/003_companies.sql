CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  confirmed BOOLEAN DEFAULT FALSE,
  confirmation_token UUID UNIQUE,
  confirmation_token_expires_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  password_reset_token UUID UNIQUE,
  password_reset_expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,
  deactivated_at TIMESTAMPTZ,
  deactivation_reason TEXT,
  credits_balance INTEGER DEFAULT 0,
  last_login_at TIMESTAMPTZ,
  created_by UUID REFERENCES super_admins(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_companies_email ON companies(email);
CREATE INDEX IF NOT EXISTS idx_companies_confirmed ON companies(confirmed);
CREATE INDEX IF NOT EXISTS idx_companies_confirmation_token ON companies(confirmation_token);
CREATE INDEX IF NOT EXISTS idx_companies_reset_token ON companies(password_reset_token);
