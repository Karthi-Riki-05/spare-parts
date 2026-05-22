-- Stores the pre-AI original text fields (description, manufacturer, etc.) per
-- verified row so the frontend can toggle between English and original language.
ALTER TABLE job_results ADD COLUMN IF NOT EXISTS original_row_data JSONB;
