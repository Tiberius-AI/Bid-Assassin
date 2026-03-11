-- ============================================================
-- Migration 007: Opportunities v2 — Google Places / LinkedIn lead feed
-- ============================================================
-- The original SAM.gov `opportunities` table is renamed to
-- `sam_opportunities` so the new lead-feed table can take its name.
-- All FK constraints in opportunity_matches automatically follow
-- the rename (Postgres tracks by OID, not table name).
-- ============================================================

-- 1. Rename SAM.gov table to free up the name
ALTER TABLE IF EXISTS opportunities RENAME TO sam_opportunities;

-- 2. opportunity_settings — one row per company, stores feed prefs
CREATE TABLE IF NOT EXISTS opportunity_settings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID REFERENCES companies(id) ON DELETE CASCADE,
  trades           TEXT[]  NOT NULL DEFAULT '{}',
  center_lat       DECIMAL(10, 7),
  center_lng       DECIMAL(10, 7),
  radius_miles     INTEGER DEFAULT 50,
  project_size_pref TEXT,                          -- 'small' | 'mid' | 'large' | null
  rotation_index   INTEGER DEFAULT 0,              -- tracks current day in the rotation
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id)
);

-- 3. opportunities — Google Places company cards + LinkedIn person cards
CREATE TABLE IF NOT EXISTS opportunities (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID REFERENCES companies(id) ON DELETE CASCADE,

  -- Card type
  card_type        TEXT NOT NULL CHECK (card_type IN ('company', 'person')),

  -- Source tracking
  source           TEXT NOT NULL DEFAULT 'google',
  source_id        TEXT,                           -- Google place_id, LinkedIn slug, etc.

  -- Company card fields
  business_name    TEXT,
  business_type    TEXT,
  business_category TEXT,
  address          TEXT,
  lat              DECIMAL(10, 7),
  lng              DECIMAL(10, 7),
  distance_miles   DECIMAL(5, 1),
  phone            TEXT,
  website          TEXT,
  google_rating    DECIMAL(2, 1),
  google_reviews   INTEGER,

  -- Person card fields
  person_name      TEXT,
  person_title     TEXT,
  person_company   TEXT,
  linkedin_url     TEXT,
  person_location  TEXT,

  -- AI-generated relevance
  match_score      INTEGER,                        -- 0-100
  match_reason     TEXT,

  -- Status tracking
  status           TEXT DEFAULT 'new' CHECK (
                     status IN ('new','saved','dismissed','reached_out',
                                'responded','proposal_sent','won','lost')
                   ),
  outreach_method  TEXT,
  outreach_date    TIMESTAMPTZ,
  outreach_notes   TEXT,

  -- Metadata
  shown_date       DATE DEFAULT CURRENT_DATE,
  is_new           BOOLEAN DEFAULT true,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

-- 4. outreach_templates — user-customizable message templates
CREATE TABLE IF NOT EXISTS outreach_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID REFERENCES companies(id) ON DELETE CASCADE,
  channel     TEXT NOT NULL CHECK (channel IN ('email','sms','phone','linkedin')),
  name        TEXT NOT NULL DEFAULT 'Default',
  subject     TEXT,
  body        TEXT NOT NULL,
  is_default  BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_opportunities_company   ON opportunities(company_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_status    ON opportunities(status);
CREATE INDEX IF NOT EXISTS idx_opportunities_shown     ON opportunities(shown_date);
CREATE INDEX IF NOT EXISTS idx_opp_settings_company   ON opportunity_settings(company_id);

-- RLS
ALTER TABLE opportunity_settings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunities         ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_templates    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own opportunity_settings"
  ON opportunity_settings FOR ALL
  USING (company_id IN (SELECT id FROM companies WHERE profile_id = auth.uid()));

CREATE POLICY "Users manage own opportunities"
  ON opportunities FOR ALL
  USING (company_id IN (SELECT id FROM companies WHERE profile_id = auth.uid()));

CREATE POLICY "Users manage own outreach_templates"
  ON outreach_templates FOR ALL
  USING (company_id IN (SELECT id FROM companies WHERE profile_id = auth.uid()));
