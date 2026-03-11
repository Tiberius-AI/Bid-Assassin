-- ============================================================
-- Migration 005: Push subscriptions for Web Push notifications
-- ============================================================
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL,
  p256dh      TEXT NOT NULL,   -- public key
  auth_key    TEXT NOT NULL,   -- auth secret
  user_agent  TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(member_id, endpoint)
);

CREATE INDEX idx_push_subscriptions_member ON push_subscriptions(member_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Members manage their own subscriptions
CREATE POLICY "Members manage own push subscriptions"
  ON push_subscriptions FOR ALL
  USING (auth.uid() = member_id);

-- Edge functions (service role) can read all subscriptions for sending
-- Service role bypasses RLS automatically — no extra policy needed.
