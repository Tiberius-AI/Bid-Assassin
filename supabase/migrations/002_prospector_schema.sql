-- ============================================================
-- Migration 002: The Prospector — SAM.gov Integration Tables
-- ============================================================

-- ============================================
-- RAW OPPORTUNITIES (scraped from SAM.gov)
-- ============================================
CREATE TABLE IF NOT EXISTS opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL DEFAULT 'sam_gov',
  source_id TEXT NOT NULL UNIQUE,           -- SAM.gov noticeId
  title TEXT NOT NULL,
  solicitation_number TEXT,
  department TEXT,
  sub_tier TEXT,
  office TEXT,
  posted_date DATE,
  response_deadline TIMESTAMPTZ,
  naics_code TEXT,
  classification_code TEXT,
  set_aside_type TEXT,                      -- SBA, 8A, HUBZone, SDVOSBC, WOSB, etc.
  set_aside_description TEXT,
  place_of_performance JSONB,               -- { city, state, zip, street_address }
  contacts JSONB,                           -- array of { type, fullName, email, phone, title }
  notice_type TEXT,                         -- solicitation, presolicitation, combined, award
  active BOOLEAN DEFAULT true,
  raw_response JSONB,                       -- full API response for reference
  description_text TEXT,                    -- scraped description (Phase 2)
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_opportunities_naics     ON opportunities(naics_code);
CREATE INDEX IF NOT EXISTS idx_opportunities_state     ON opportunities((place_of_performance->>'state'));
CREATE INDEX IF NOT EXISTS idx_opportunities_deadline  ON opportunities(response_deadline);
CREATE INDEX IF NOT EXISTS idx_opportunities_posted    ON opportunities(posted_date DESC);
CREATE INDEX IF NOT EXISTS idx_opportunities_source_id ON opportunities(source_id);

ALTER TABLE opportunities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read opportunities" ON opportunities
  FOR SELECT USING (auth.role() = 'authenticated');

-- ============================================
-- NAICS TO TRADE MAPPING
-- ============================================
CREATE TABLE IF NOT EXISTS naics_trade_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  naics_code TEXT NOT NULL,
  naics_description TEXT,
  trade TEXT NOT NULL,                      -- matches member profile trade values
  relevance_weight NUMERIC DEFAULT 1.0      -- 1.0 = exact match, 0.5 = partial
);

CREATE INDEX IF NOT EXISTS idx_naics_trade_map_code ON naics_trade_map(naics_code);

-- naics_trade_map is reference data — readable by all authenticated users, managed by admins.
-- No RLS needed for reads; inserts happen via migration/seed only.

-- ============================================
-- MATCHED OPPORTUNITIES (per member)
-- ============================================
CREATE TABLE IF NOT EXISTS opportunity_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES auth.users(id),
  opportunity_id UUID NOT NULL REFERENCES opportunities(id),
  fit_score NUMERIC NOT NULL,               -- 0-100
  score_breakdown JSONB,                    -- { trade: 30, location: 25, size: 20, certification: 15, deadline: 10 }
  status TEXT DEFAULT 'new',               -- new, viewed, interested, passed, proposal_started, proposal_sent
  notified_at TIMESTAMPTZ,
  notification_channel TEXT,               -- email, push, sms
  viewed_at TIMESTAMPTZ,
  action_at TIMESTAMPTZ,                   -- when they clicked interested/pass
  proposal_id UUID,                         -- links to proposals table if they build one
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(member_id, opportunity_id)
);

CREATE INDEX IF NOT EXISTS idx_matches_member ON opportunity_matches(member_id);
CREATE INDEX IF NOT EXISTS idx_matches_status ON opportunity_matches(status);
CREATE INDEX IF NOT EXISTS idx_matches_score  ON opportunity_matches(fit_score DESC);

ALTER TABLE opportunity_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members see own matches" ON opportunity_matches
  FOR SELECT USING (auth.uid() = member_id);

CREATE POLICY "System inserts matches" ON opportunity_matches
  FOR INSERT WITH CHECK (true);  -- Edge function uses service role key, bypasses RLS

CREATE POLICY "Members update own matches" ON opportunity_matches
  FOR UPDATE USING (auth.uid() = member_id);

-- ============================================
-- NOTIFICATION PREFERENCES (per member)
-- ============================================
CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES auth.users(id) UNIQUE,
  email_enabled BOOLEAN DEFAULT true,
  push_enabled BOOLEAN DEFAULT false,
  sms_enabled BOOLEAN DEFAULT false,       -- Phase 2
  phone_number TEXT,                        -- for SMS
  hot_alert_threshold INTEGER DEFAULT 80,  -- score >= this triggers immediate notification
  digest_enabled BOOLEAN DEFAULT true,     -- daily digest email
  digest_time TEXT DEFAULT '08:00',        -- preferred digest delivery time (local)
  weekly_intel_enabled BOOLEAN DEFAULT true,
  min_score_threshold INTEGER DEFAULT 50,  -- don't show matches below this score
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members manage own prefs" ON notification_preferences
  FOR ALL USING (auth.uid() = member_id);
