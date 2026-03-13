-- ============================================================
-- Migration 009: Permit source settings
-- ============================================================
-- Adds user-configurable permit preferences to opportunity_settings.
-- permits_enabled:       toggle the building-permits data source on/off
-- permit_min_valuation:  minimum declared value filter (default $50K)
-- ============================================================

ALTER TABLE opportunity_settings
  ADD COLUMN IF NOT EXISTS permits_enabled      BOOLEAN  NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS permit_min_valuation INTEGER  NOT NULL DEFAULT 50000;
