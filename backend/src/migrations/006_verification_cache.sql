-- Cache is shared across all companies — parts are public manufacturer data.
-- Cache key is SHA256(manufacturer|item|type) which contains no company data,
-- so zero risk of cross-tenant leakage.

CREATE TABLE IF NOT EXISTS verification_cache (
  sha256_key VARCHAR(64) PRIMARY KEY,
  manufacturer VARCHAR(255),
  item_number VARCHAR(255),
  type_designation VARCHAR(255),
  score INTEGER,
  website_id TEXT,
  source_type VARCHAR(50),
  result JSONB,
  verified_at TIMESTAMPTZ DEFAULT NOW(),
  hit_count INTEGER DEFAULT 1,
  re_verify_after TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cache_manufacturer ON verification_cache(manufacturer);
CREATE INDEX IF NOT EXISTS idx_cache_reverify ON verification_cache(re_verify_after)
  WHERE re_verify_after IS NOT NULL;
