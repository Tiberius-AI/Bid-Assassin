-- ============================================================
-- Migration 004: Scrape metadata — tracks last successful scrape
-- ============================================================
CREATE TABLE IF NOT EXISTS scrape_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed the initial last_scrape_timestamp so the first run fetches
-- the past 7 days of opportunities.
INSERT INTO scrape_metadata (key, value)
VALUES ('last_scrape_timestamp', (now() - INTERVAL '7 days')::TEXT)
ON CONFLICT (key) DO NOTHING;

-- Edge function uses service role key — no RLS needed.
