-- Valid action values (enforced at application layer, not DB):
--   company_created, company_confirmed, confirmation_resent
--   company_login, company_logout, company_login_failed
--   password_changed, password_reset
--   file_uploaded, job_started, job_completed, job_failed
--   excel_downloaded
--   company_deactivated, company_activated
--   super_admin_login, super_admin_logout

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  super_admin_id UUID REFERENCES super_admins(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_company ON audit_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_audit_super_admin ON audit_logs(super_admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
