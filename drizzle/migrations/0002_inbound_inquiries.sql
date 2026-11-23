CREATE TABLE IF NOT EXISTS inbound_inquiries (
  id TEXT PRIMARY KEY NOT NULL,
  inquiry_type TEXT NOT NULL DEFAULT 'free_preview_request',
  prospect_id TEXT,
  slug TEXT,
  business_name TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  contact_info TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT 'US',
  plan_tier TEXT NOT NULL DEFAULT 'founding',
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  ip_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_inbound_inquiries_status_created ON inbound_inquiries (status, created_at);
CREATE INDEX IF NOT EXISTS idx_inbound_inquiries_ip_created ON inbound_inquiries (ip_hash, created_at);
