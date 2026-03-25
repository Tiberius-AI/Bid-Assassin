-- ============================================================
-- Migration 013: RLS security fixes (Supabase Security Advisor)
-- ============================================================

-- ── 1. naics_trade_map ────────────────────────────────────────
-- Reference/lookup data. Only Edge Functions write to it (via
-- service_role, which bypasses RLS). Authenticated clients may
-- read it for UI display; no client writes ever occur.

ALTER TABLE naics_trade_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read naics_trade_map"
  ON naics_trade_map
  FOR SELECT
  TO authenticated
  USING (true);

-- ── 2. scrape_metadata ────────────────────────────────────────
-- Internal tracking table. Only Edge Functions read/write via
-- service_role (which bypasses RLS). No client access is needed
-- or intended.

ALTER TABLE scrape_metadata ENABLE ROW LEVEL SECURITY;

-- No client-facing policies — service_role still has full access.

-- ── 3. opportunity_matches — remove permissive INSERT policy ──
-- The "System inserts matches" policy (WITH CHECK (true)) was
-- added for the match-opportunities Edge Function, but Edge
-- Functions run as service_role which bypasses RLS entirely.
-- The policy is therefore unnecessary and allows any
-- authenticated user to insert arbitrary rows. Drop it.
-- The two correctly-scoped policies (SELECT and UPDATE for own
-- rows) remain untouched.

DROP POLICY IF EXISTS "System inserts matches" ON opportunity_matches;
