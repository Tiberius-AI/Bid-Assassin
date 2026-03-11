-- ============================================================
-- Migration 006: Cron schedules via pg_cron + pg_net
-- ============================================================
-- BEFORE RUNNING:
-- 1. Enable pg_cron in Supabase Dashboard → Database → Extensions
-- 2. Enable pg_net  in Supabase Dashboard → Database → Extensions
-- 3. Replace YOUR_SUPABASE_URL and YOUR_SERVICE_ROLE_KEY below
--    (Settings → API → Project URL and service_role secret)
-- ============================================================

-- Remove any existing schedules so this is safe to re-run
SELECT cron.unschedule('scrape-sam-gov')        WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'scrape-sam-gov');
SELECT cron.unschedule('send-daily-digest')     WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-daily-digest');
SELECT cron.unschedule('cleanup-stale-opps')    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-stale-opps');

-- ============================================================
-- 1. SAM.gov scraper — every 4 hours
--    Scraper auto-triggers match-opportunities on completion,
--    which auto-triggers notify-hot-alerts + send-web-push.
-- ============================================================
SELECT cron.schedule(
  'scrape-sam-gov',
  '0 */4 * * *',
  $$
  SELECT net.http_post(
    url     := 'YOUR_SUPABASE_URL/functions/v1/scrape-sam-gov',
    headers := '{"Authorization":"Bearer YOUR_SERVICE_ROLE_KEY","Content-Type":"application/json"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);

-- ============================================================
-- 2. Daily digest email — every day at 8:00 AM UTC
-- ============================================================
SELECT cron.schedule(
  'send-daily-digest',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url     := 'YOUR_SUPABASE_URL/functions/v1/send-daily-digest',
    headers := '{"Authorization":"Bearer YOUR_SERVICE_ROLE_KEY","Content-Type":"application/json"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);

-- ============================================================
-- 3. Stale opportunity cleanup — every day at midnight UTC
--    Marks opportunities past their response deadline as inactive.
--    No edge function needed — pure SQL.
-- ============================================================
SELECT cron.schedule(
  'cleanup-stale-opps',
  '0 0 * * *',
  $$
  UPDATE opportunities
  SET    active = false,
         updated_at = now()
  WHERE  active = true
    AND  response_deadline < now();
  $$
);

-- ============================================================
-- Verify schedules were created
-- ============================================================
-- Run this to confirm: SELECT jobname, schedule, command FROM cron.job;
