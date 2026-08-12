-- Object bytes moved from R2 to the MEDIA Workers KV namespace.
-- Keep legacy columns during rollout so the previous Worker remains compatible
-- until the new Worker is deployed (and so a rollback can still read keys).
ALTER TABLE media ADD COLUMN storage_key TEXT;
ALTER TABLE media_versions ADD COLUMN storage_key TEXT;
ALTER TABLE upload_sessions ADD COLUMN storage_key TEXT;
ALTER TABLE jobs ADD COLUMN storage_key TEXT;
ALTER TABLE drop_files ADD COLUMN storage_key TEXT;

UPDATE media SET storage_key = r2_key WHERE storage_key IS NULL;
UPDATE media_versions SET storage_key = r2_key WHERE storage_key IS NULL;
UPDATE upload_sessions SET storage_key = r2_key WHERE storage_key IS NULL;
UPDATE jobs SET storage_key = r2_key WHERE storage_key IS NULL;
UPDATE drop_files SET storage_key = r2_key WHERE storage_key IS NULL;
