ALTER TABLE prospects ADD COLUMN owner_portal_token TEXT;
ALTER TABLE prospects ADD COLUMN webhook_url TEXT;
ALTER TABLE prospects ADD COLUMN availability_status TEXT NOT NULL DEFAULT 'open';

CREATE UNIQUE INDEX IF NOT EXISTS idx_prospects_owner_portal_token
  ON prospects (owner_portal_token);

ALTER TABLE quote_requests ADD COLUMN lead_status TEXT NOT NULL DEFAULT 'new';

CREATE TABLE IF NOT EXISTS media_assets (
  key TEXT PRIMARY KEY NOT NULL,
  prospect_id TEXT NOT NULL,
  content_type TEXT NOT NULL,
  data_base64 TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_media_assets_prospect ON media_assets (prospect_id);
