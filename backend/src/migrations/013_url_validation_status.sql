-- Promote url_validation_status to a top-level cache column so queries /
-- audits don't have to peek into the JSONB `result` payload. The per-row
-- value is still also present inside `result` for backwards compatibility
-- with any consumer that reads the full cached object.

ALTER TABLE verification_cache
  ADD COLUMN IF NOT EXISTS url_validation_status VARCHAR(50)
    DEFAULT 'unverified';

-- Backfill existing rows from the JSONB payload where possible; fall back
-- to 'unverified' (the default) for rows cached before the field existed.
UPDATE verification_cache
   SET url_validation_status = COALESCE(
         NULLIF(result->>'urlValidationStatus', ''),
         NULLIF(result->>'url_validation_status', ''),
         'unverified'
       )
 WHERE url_validation_status IS NULL
    OR url_validation_status = 'unverified';
