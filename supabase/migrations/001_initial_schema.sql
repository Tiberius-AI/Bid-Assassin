-- ============================================================
-- Bid Assassin - Initial Database Migration
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- PROFILES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  avatar_url TEXT,
  onboarding_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ============================================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- COMPANIES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID UNIQUE NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  trades TEXT[] DEFAULT '{}',
  certifications TEXT[] DEFAULT '{}',
  license_number TEXT,
  insurance_provider TEXT,
  insurance_policy_number TEXT,
  default_payment_terms TEXT DEFAULT 'Net 30',
  default_warranty_terms TEXT DEFAULT '1 year workmanship warranty',
  proposal_tone TEXT DEFAULT 'professional' CHECK (proposal_tone IN ('professional', 'friendly', 'aggressive')),
  logo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own company"
  ON companies FOR SELECT
  USING (profile_id = auth.uid());

CREATE POLICY "Users can insert own company"
  ON companies FOR INSERT
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "Users can update own company"
  ON companies FOR UPDATE
  USING (profile_id = auth.uid());

-- ============================================================
-- PROPOSALS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS proposals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  proposal_number TEXT,
  client_name TEXT,
  client_email TEXT,
  client_company TEXT,
  project_name TEXT,
  project_address TEXT,
  scope_of_work TEXT,
  exclusions TEXT,
  inclusions TEXT,
  timeline_description TEXT,
  total_amount NUMERIC DEFAULT 0,
  payment_terms TEXT,
  warranty_terms TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'viewed', 'accepted', 'rejected', 'expired')),
  build_mode TEXT DEFAULT 'manual' CHECK (build_mode IN ('manual', 'agent')),
  ai_suggestions JSONB DEFAULT '{}',
  client_research JSONB DEFAULT '{}',
  agent_conversation JSONB DEFAULT '[]',
  intake_answers JSONB DEFAULT '{}',
  pdf_url TEXT,
  sent_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own proposals"
  ON proposals FOR SELECT
  USING (company_id IN (SELECT id FROM companies WHERE profile_id = auth.uid()));

CREATE POLICY "Users can insert own proposals"
  ON proposals FOR INSERT
  WITH CHECK (company_id IN (SELECT id FROM companies WHERE profile_id = auth.uid()));

CREATE POLICY "Users can update own proposals"
  ON proposals FOR UPDATE
  USING (company_id IN (SELECT id FROM companies WHERE profile_id = auth.uid()));

CREATE POLICY "Users can delete own proposals"
  ON proposals FOR DELETE
  USING (company_id IN (SELECT id FROM companies WHERE profile_id = auth.uid()));

-- ============================================================
-- PROPOSAL NUMBER AUTO-GENERATION TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION generate_proposal_number()
RETURNS TRIGGER AS $$
DECLARE
  next_num INTEGER;
  current_year TEXT;
BEGIN
  current_year := EXTRACT(YEAR FROM NOW())::TEXT;
  SELECT COALESCE(MAX(
    CAST(SPLIT_PART(proposal_number, '-', 3) AS INTEGER)
  ), 0) + 1 INTO next_num
  FROM proposals
  WHERE company_id = NEW.company_id
    AND proposal_number LIKE 'BA-' || current_year || '-%';
  NEW.proposal_number := 'BA-' || current_year || '-' || LPAD(next_num::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_proposal_number
  BEFORE INSERT ON proposals
  FOR EACH ROW
  EXECUTE FUNCTION generate_proposal_number();

-- ============================================================
-- PROPOSAL LINE ITEMS TABLE (future use)
-- ============================================================
CREATE TABLE IF NOT EXISTS proposal_line_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  description TEXT,
  quantity NUMERIC DEFAULT 1,
  unit TEXT DEFAULT 'lot',
  unit_price NUMERIC DEFAULT 0,
  total_price NUMERIC DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE proposal_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own proposal line items"
  ON proposal_line_items FOR ALL
  USING (proposal_id IN (
    SELECT p.id FROM proposals p
    JOIN companies c ON p.company_id = c.id
    WHERE c.profile_id = auth.uid()
  ));

-- ============================================================
-- PROJECTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  client_name TEXT,
  client_company TEXT,
  status TEXT DEFAULT 'identified' CHECK (status IN ('identified', 'reviewing', 'bid_submitted', 'won', 'lost')),
  estimated_value NUMERIC DEFAULT 0,
  bid_due_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own projects"
  ON projects FOR SELECT
  USING (company_id IN (SELECT id FROM companies WHERE profile_id = auth.uid()));

CREATE POLICY "Users can insert own projects"
  ON projects FOR INSERT
  WITH CHECK (company_id IN (SELECT id FROM companies WHERE profile_id = auth.uid()));

CREATE POLICY "Users can update own projects"
  ON projects FOR UPDATE
  USING (company_id IN (SELECT id FROM companies WHERE profile_id = auth.uid()));

CREATE POLICY "Users can delete own projects"
  ON projects FOR DELETE
  USING (company_id IN (SELECT id FROM companies WHERE profile_id = auth.uid()));

-- ============================================================
-- CLIENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  company_name TEXT,
  email TEXT,
  phone TEXT,
  type TEXT DEFAULT 'gc' CHECK (type IN ('gc', 'property_manager', 'owner', 'other')),
  relationship_status TEXT DEFAULT 'cold' CHECK (relationship_status IN ('cold', 'warm', 'active', 'preferred')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own clients"
  ON clients FOR SELECT
  USING (company_id IN (SELECT id FROM companies WHERE profile_id = auth.uid()));

CREATE POLICY "Users can insert own clients"
  ON clients FOR INSERT
  WITH CHECK (company_id IN (SELECT id FROM companies WHERE profile_id = auth.uid()));

CREATE POLICY "Users can update own clients"
  ON clients FOR UPDATE
  USING (company_id IN (SELECT id FROM companies WHERE profile_id = auth.uid()));

CREATE POLICY "Users can delete own clients"
  ON clients FOR DELETE
  USING (company_id IN (SELECT id FROM companies WHERE profile_id = auth.uid()));

-- ============================================================
-- FOLLOW-UPS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS follow_ups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  proposal_id UUID REFERENCES proposals(id) ON DELETE SET NULL,
  due_date DATE,
  type TEXT DEFAULT 'email' CHECK (type IN ('email', 'phone', 'text')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'skipped')),
  ai_suggested_message TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE follow_ups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own follow ups"
  ON follow_ups FOR ALL
  USING (company_id IN (SELECT id FROM companies WHERE profile_id = auth.uid()));

-- ============================================================
-- AI COACHING SESSIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_coaching_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  coach_type TEXT DEFAULT 'estimator' CHECK (coach_type IN ('estimator', 'closer', 'prospector', 'gc_whisperer')),
  messages JSONB DEFAULT '[]',
  context JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ai_coaching_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own coaching sessions"
  ON ai_coaching_sessions FOR ALL
  USING (company_id IN (SELECT id FROM companies WHERE profile_id = auth.uid()));

-- ============================================================
-- UPDATED_AT TRIGGER FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to all tables
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_proposals_updated_at BEFORE UPDATE ON proposals FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_follow_ups_updated_at BEFORE UPDATE ON follow_ups FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_coaching_sessions_updated_at BEFORE UPDATE ON ai_coaching_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
