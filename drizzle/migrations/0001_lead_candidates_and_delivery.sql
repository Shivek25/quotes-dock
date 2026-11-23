CREATE TABLE IF NOT EXISTS lead_candidates (
  id TEXT PRIMARY KEY NOT NULL,
  dedupe_key TEXT NOT NULL UNIQUE,
  business_name TEXT NOT NULL,
  city TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'US',
  service_area TEXT NOT NULL,
  phone_display TEXT NOT NULL DEFAULT '',
  instagram_handle TEXT NOT NULL,
  website_url TEXT NOT NULL DEFAULT '',
  rating_score TEXT NOT NULL DEFAULT '4.9',
  review_count INTEGER NOT NULL DEFAULT 35,
  fit_score INTEGER NOT NULL DEFAULT 75,
  fit_signals_json TEXT NOT NULL DEFAULT '[]',
  has_instant_quote INTEGER NOT NULL DEFAULT 0,
  personalization_note TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  scouted_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_candidates_dedupe ON lead_candidates (dedupe_key);

ALTER TABLE quote_requests ADD COLUMN delivery_status TEXT NOT NULL DEFAULT 'not_applicable';
ALTER TABLE quote_requests ADD COLUMN delivery_error TEXT;
