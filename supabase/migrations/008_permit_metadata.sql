-- ============================================================
-- Migration 008: Add permit_metadata JSONB to opportunities
-- ============================================================
-- Stores building-permit-specific fields (valuation, SF, permit
-- number, applicant, dates, work type) without widening the
-- main table schema.  Only rows with source = 'permit' will
-- have a non-null value here.
-- ============================================================

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS permit_metadata JSONB;

-- Partial index — only rows that actually carry permit data
CREATE INDEX IF NOT EXISTS idx_opportunities_permit_source
  ON opportunities(source)
  WHERE source = 'permit';

-- GIN index on the JSONB for queries like
--   permit_metadata->>'permit_number'
CREATE INDEX IF NOT EXISTS idx_opportunities_permit_meta
  ON opportunities USING GIN (permit_metadata)
  WHERE permit_metadata IS NOT NULL;
