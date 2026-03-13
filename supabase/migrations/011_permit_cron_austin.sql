-- ============================================================
-- Migration 011: Cron schedule for fetch-permits-austin
-- ============================================================
-- Runs daily at 12:30 UTC (6:30 AM CT), offset from SA fetch
-- to avoid concurrent load.
--
-- BEFORE RUNNING:
-- Replace YOUR_SUPABASE_URL and YOUR_SERVICE_ROLE_KEY with
-- actual values (Settings → API → Project URL / service_role).
-- ============================================================

SELECT cron.unschedule('fetch-permits-austin')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fetch-permits-austin');

SELECT cron.schedule(
  'fetch-permits-austin',
  '30 12 * * *',
  $$
  SELECT net.http_post(
    url     := 'YOUR_SUPABASE_URL/functions/v1/fetch-permits-austin',
    headers := '{"Authorization":"Bearer YOUR_SERVICE_ROLE_KEY","Content-Type":"application/json"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);

-- Seed scrape_metadata for Austin permit tracking
INSERT INTO scrape_metadata (key, value)
VALUES ('last_permit_fetch_austin', (now() - INTERVAL '1 day')::TEXT)
ON CONFLICT (key) DO NOTHING;
