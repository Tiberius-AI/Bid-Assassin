-- Coach conversation threads
CREATE TABLE coach_conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  coach_type TEXT NOT NULL DEFAULT 'estimator',
  title TEXT,
  proposal_id UUID REFERENCES proposals(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Individual messages within a conversation
CREATE TABLE coach_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID REFERENCES coach_conversations(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  tokens_used JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS policies
ALTER TABLE coach_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only see their own conversations"
  ON coach_conversations FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users can only see messages in their own conversations"
  ON coach_messages FOR ALL
  USING (
    conversation_id IN (
      SELECT id FROM coach_conversations WHERE user_id = auth.uid()
    )
  );

-- Indexes
CREATE INDEX idx_coach_conversations_user ON coach_conversations(user_id, updated_at DESC);
CREATE INDEX idx_coach_messages_conversation ON coach_messages(conversation_id, created_at ASC);

-- Auto-update updated_at on new messages
CREATE OR REPLACE FUNCTION update_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE coach_conversations SET updated_at = NOW() WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_conversation_timestamp
  AFTER INSERT ON coach_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_timestamp();
