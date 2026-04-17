-- Super admin table. Seed row is inserted from Node (migrations/run.js) so the
-- bcrypt hash can be computed with the configured password. pgcrypto has no
-- bcrypt function, so we cannot hash in SQL.

CREATE TABLE IF NOT EXISTS super_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_super_admins_email ON super_admins(email);
