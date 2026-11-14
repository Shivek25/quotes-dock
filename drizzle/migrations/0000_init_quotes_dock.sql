CREATE TABLE IF NOT EXISTS prospects (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  business_name TEXT NOT NULL,
  niche TEXT NOT NULL DEFAULT 'mobile_detailing',
  city TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'US',
  currency_symbol TEXT NOT NULL DEFAULT '$',
  postal_label TEXT NOT NULL DEFAULT 'Zip Code',
  service_area TEXT NOT NULL,
  phone_display TEXT NOT NULL,
  instagram_handle TEXT NOT NULL,
  rating_score TEXT NOT NULL,
  review_count INTEGER NOT NULL,
  rating_source TEXT NOT NULL,
  tagline TEXT NOT NULL,
  hero_headline TEXT NOT NULL,
  hero_subheadline TEXT NOT NULL,
  turnaround_badge TEXT NOT NULL,
  packages_json TEXT NOT NULL,
  addons_json TEXT NOT NULL,
  gallery_json TEXT NOT NULL,
  trust_points_json TEXT NOT NULL,
  personalization_note TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'preview',
  owner_email TEXT,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_prospects_slug ON prospects (slug);

CREATE TABLE IF NOT EXISTS quote_requests (
  id TEXT PRIMARY KEY NOT NULL,
  prospect_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_postal TEXT NOT NULL,
  vehicle_size TEXT NOT NULL,
  package_id TEXT NOT NULL,
  package_name TEXT NOT NULL,
  condition_level TEXT NOT NULL,
  addons_selected_json TEXT NOT NULL,
  estimated_min INTEGER NOT NULL,
  estimated_max INTEGER NOT NULL,
  preferred_timing TEXT NOT NULL,
  notes TEXT,
  is_preview_test INTEGER NOT NULL DEFAULT 1,
  ip_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_quote_requests_prospect_created ON quote_requests (prospect_id, created_at);
CREATE INDEX IF NOT EXISTS idx_quote_requests_ip_created ON quote_requests (ip_hash, created_at);

CREATE TABLE IF NOT EXISTS outreach_drafts (
  id TEXT PRIMARY KEY NOT NULL,
  prospect_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  channel TEXT NOT NULL,
  recipient_handle TEXT NOT NULL,
  personalization_note TEXT NOT NULL,
  message_body TEXT NOT NULL,
  approval_status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_outreach_drafts_prospect_status ON outreach_drafts (prospect_id, approval_status);
