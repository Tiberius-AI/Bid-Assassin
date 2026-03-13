-- ============================================================
-- Migration 010: Cron schedule for fetch-permits-sa
-- ============================================================
-- Runs daily at 12:00 UTC (6:00 AM CT).
-- Uses same pg_cron + pg_net pattern as migration 006.
--
-- BEFORE RUNNING:
-- Replace YOUR_SUPABASE_URL and YOUR_SERVICE_ROLE_KEY with
-- actual values (Settings → API → Project URL / service_role).
-- ============================================================

SELECT cron.unschedule('fetch-permits-sa')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fetch-permits-sa');

SELECT cron.schedule(
  'fetch-permits-sa',
  '0 12 * * *',
  $$
  SELECT net.http_post(
    url     := 'YOUR_SUPABASE_URL/functions/v1/fetch-permits-sa',
    headers := '{"Authorization":"Bearer YOUR_SERVICE_ROLE_KEY","Content-Type":"application/json"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);

-- Seed scrape_metadata for permit tracking
INSERT INTO scrape_metadata (key, value)
VALUES ('last_permit_fetch', (now() - INTERVAL '1 day')::TEXT)
ON CONFLICT (key) DO NOTHING;
