# THE ESTIMATOR -- AI Coach Build Spec

> Drop this file into your `docs/` folder. Point Claude Code at it with:
> "Read docs/THE_ESTIMATOR_COACH_SPEC.md and build The Estimator AI coach."

---

## Overview

The Estimator is the first of four AI coaches in Bid Assassin. It reviews scope, catches missing line items, validates pricing against market data, and helps commercial subcontractors put together tighter, more competitive proposals.

**Model:** Claude Sonnet 4.6 (`claude-sonnet-4-6`)
**API routing:** Supabase Edge Function (API key stays server-side)
**UI:** Full-page chat with conversation history sidebar

---

## 1. Supabase Edge Function

### Create: `supabase/functions/ai-coach/index.ts`

This single Edge Function handles all four coaches (future-proof). The `coach_type` field in the request body determines which system prompt to use.

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const COACH_SYSTEM_PROMPTS: Record<string, string> = {
  estimator: `You are The Estimator, an AI coach inside Bid Assassin -- a proposal platform for commercial subcontractors.

Your role: Help subcontractors review scope, catch missing line items, validate pricing, and build tighter proposals. You are an expert commercial estimator with 25+ years of experience across all trades (HVAC, electrical, plumbing, painting, flooring, roofing, fire protection, concrete, steel, drywall, etc.).

PERSONALITY & TONE:
- Direct, no-nonsense, like a veteran estimator who has seen every mistake in the book
- Confident but not arrogant. You explain WHY something matters, not just what to do
- Use construction industry terminology naturally but explain acronyms when first used
- Speak like a mentor in the field, not a corporate consultant
- Keep responses practical and actionable. Contractors do not want theory -- they want "do this, then this"
- Be honest when pricing varies heavily by market. Say "in most Texas metros you would see X, but verify locally"

CORE CAPABILITIES:
1. SCOPE REVIEW: When given project details or line items, identify what is missing, what is vague, and what could cause a change order dispute. Flag scope gaps like "who covers demo?" or "is disposal included?"
2. PRICING VALIDATION: Give ballpark pricing ranges based on trade, project type, and region. Always present as ranges, never single numbers. Caveat with "market conditions vary" but be specific enough to be useful
3. LINE ITEM COACHING: Help structure line items so they are clear, defensible, and professional. Teach the difference between lump sum vs unit pricing and when each makes sense
4. BID STRATEGY: Advise on bid/no-bid decisions, how to price competitively without leaving money on the table, and how to read bid tabulations
5. CHANGE ORDER DEFENSE: Help document scope clearly enough that change orders are justified and defensible

WHEN THE USER SHARES A PROPOSAL:
- If the user gives you permission to pull their proposal data, or if proposal context is injected into the conversation, analyze it thoroughly
- Call out specific line items that are underpriced, overpriced, or missing
- Check for common scope gaps based on the project type
- Suggest language improvements that protect the contractor
- Compare their pricing structure to industry norms for that trade and project type

WHAT YOU DO NOT DO:
- Never give exact prices as if they are definitive. Always use ranges and caveats
- Never advise on legal matters (contracts, liability, liens). Say "talk to a construction attorney for that"
- Never advise on licensing, bonding, or insurance specifics. Say "check with your state licensing board"
- Never trash-talk competitors or other contractors
- Never generate a full proposal. You coach -- the proposal builder handles the output

STARTER PROMPTS (suggest these when conversation begins):
- "Review my scope for missing items"
- "Am I pricing this right for [city/region]?"
- "Help me structure my line items"
- "Should I bid this project or pass?"

If the user asks about anything outside your domain (finding leads, negotiation, GC relationships), briefly acknowledge it and suggest they check out the other coaches: The Prospector (leads), The Closer (negotiation), or The GC Whisperer (relationships).`,
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    // Verify the user is authenticated
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const body = await req.json();
    const {
      coach_type = "estimator",
      messages = [],
      proposal_context = null,  // Optional: injected proposal data
      conversation_id = null,
    } = body;

    // Get the system prompt for this coach
    const systemPrompt = COACH_SYSTEM_PROMPTS[coach_type];
    if (!systemPrompt) {
      return new Response(JSON.stringify({ error: `Unknown coach: ${coach_type}` }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    // Build the full system prompt, optionally injecting proposal context
    let fullSystemPrompt = systemPrompt;
    if (proposal_context) {
      fullSystemPrompt += `\n\nCONTEXT -- The user has shared the following proposal data for review:\n${JSON.stringify(proposal_context, null, 2)}\n\nAnalyze this proposal data when relevant to the conversation. Reference specific line items by name and amount.`;
    }

    // Call Anthropic API
    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        system: fullSystemPrompt,
        messages: messages,
      }),
    });

    const anthropicData = await anthropicResponse.json();

    if (!anthropicResponse.ok) {
      console.error("Anthropic API error:", anthropicData);
      return new Response(JSON.stringify({ error: "AI service error", details: anthropicData }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    // Extract the assistant message text
    const assistantMessage = anthropicData.content
      .filter((block: any) => block.type === "text")
      .map((block: any) => block.text)
      .join("\n");

    // Return the response with usage info (for cost tracking)
    return new Response(
      JSON.stringify({
        message: assistantMessage,
        usage: anthropicData.usage,
        conversation_id,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      }
    );
  } catch (err) {
    console.error("Edge function error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
});
```

### Deploy command:
```bash
supabase functions deploy ai-coach
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```

---

## 2. Database Schema

### New tables for coach conversations:

```sql
-- Coach conversation threads
CREATE TABLE coach_conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  coach_type TEXT NOT NULL DEFAULT 'estimator',
  title TEXT,  -- Auto-generated from first message or user-set
  proposal_id UUID REFERENCES proposals(id) ON DELETE SET NULL,  -- Optional linked proposal
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Individual messages within a conversation
CREATE TABLE coach_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID REFERENCES coach_conversations(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  tokens_used JSONB,  -- { input_tokens, output_tokens } for cost tracking
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

-- Index for fast conversation list loading
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
```

---

## 3. React Hooks

### `src/hooks/useCoachChat.js`

Core hook that manages conversation state, message sending, and persistence.

```javascript
import { useState, useCallback, useRef } from "react";
import { supabase } from "../services/supabase";

export function useCoachChat(coachType = "estimator") {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [conversationId, setConversationId] = useState(null);
  const [proposalContext, setProposalContext] = useState(null);
  const abortRef = useRef(null);

  // Load an existing conversation
  const loadConversation = useCallback(async (convId) => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from("coach_messages")
        .select("*")
        .eq("conversation_id", convId)
        .order("created_at", { ascending: true });

      if (fetchError) throw fetchError;

      setMessages(data.map((m) => ({ role: m.role, content: m.content })));
      setConversationId(convId);

      // Check if this conversation has a linked proposal
      const { data: conv } = await supabase
        .from("coach_conversations")
        .select("proposal_id")
        .eq("id", convId)
        .single();

      if (conv?.proposal_id) {
        await loadProposalContext(conv.proposal_id);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load proposal data to inject as context
  const loadProposalContext = useCallback(async (proposalId) => {
    const { data, error: fetchError } = await supabase
      .from("proposals")
      .select("*, line_items(*)")
      .eq("id", proposalId)
      .single();

    if (!fetchError && data) {
      setProposalContext({
        project_name: data.project_name,
        client_name: data.client_name,
        trade: data.trade,
        project_type: data.project_type,
        total_amount: data.total_amount,
        line_items: data.line_items?.map((li) => ({
          description: li.description,
          quantity: li.quantity,
          unit: li.unit,
          unit_price: li.unit_price,
          total: li.total,
        })),
      });

      // Link the proposal to the conversation if not already linked
      if (conversationId) {
        await supabase
          .from("coach_conversations")
          .update({ proposal_id: proposalId })
          .eq("id", conversationId);
      }
    }
  }, [conversationId]);

  // Send a message
  const sendMessage = useCallback(
    async (userMessage) => {
      if (!userMessage.trim()) return;

      setError(null);
      const newMessages = [...messages, { role: "user", content: userMessage }];
      setMessages(newMessages);
      setLoading(true);

      try {
        // Create conversation if this is the first message
        let convId = conversationId;
        if (!convId) {
          const { data: { user } } = await supabase.auth.getUser();
          const { data: newConv, error: convError } = await supabase
            .from("coach_conversations")
            .insert({
              user_id: user.id,
              coach_type: coachType,
              title: userMessage.slice(0, 80),
            })
            .select()
            .single();

          if (convError) throw convError;
          convId = newConv.id;
          setConversationId(convId);
        }

        // Save user message to DB
        await supabase.from("coach_messages").insert({
          conversation_id: convId,
          role: "user",
          content: userMessage,
        });

        // Call the Edge Function
        const { data: { session } } = await supabase.auth.getSession();

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-coach`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              coach_type: coachType,
              messages: newMessages,
              proposal_context: proposalContext,
              conversation_id: convId,
            }),
          }
        );

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || "Failed to get response");
        }

        const data = await response.json();

        // Add assistant message to state
        const updatedMessages = [
          ...newMessages,
          { role: "assistant", content: data.message },
        ];
        setMessages(updatedMessages);

        // Save assistant message to DB with usage info
        await supabase.from("coach_messages").insert({
          conversation_id: convId,
          role: "assistant",
          content: data.message,
          tokens_used: data.usage,
        });
      } catch (err) {
        setError(err.message);
        // Remove the optimistic user message on error
        setMessages(messages);
      } finally {
        setLoading(false);
      }
    },
    [messages, conversationId, coachType, proposalContext]
  );

  // Start a new conversation
  const newConversation = useCallback(() => {
    setMessages([]);
    setConversationId(null);
    setProposalContext(null);
    setError(null);
  }, []);

  return {
    messages,
    loading,
    error,
    conversationId,
    proposalContext,
    sendMessage,
    loadConversation,
    loadProposalContext,
    newConversation,
  };
}
```

### `src/hooks/useCoachConversations.js`

Hook for the conversation history sidebar.

```javascript
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../services/supabase";

export function useCoachConversations(coachType = "estimator") {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchConversations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error: fetchError } = await supabase
        .from("coach_conversations")
        .select("id, title, coach_type, updated_at, proposal_id")
        .eq("user_id", user.id)
        .eq("coach_type", coachType)
        .order("updated_at", { ascending: false })
        .limit(50);

      if (fetchError) throw fetchError;
      setConversations(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [coachType]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const deleteConversation = useCallback(async (convId) => {
    const { error: delError } = await supabase
      .from("coach_conversations")
      .delete()
      .eq("id", convId);

    if (!delError) {
      setConversations((prev) => prev.filter((c) => c.id !== convId));
    }
  }, []);

  const renameConversation = useCallback(async (convId, newTitle) => {
    const { error: updateError } = await supabase
      .from("coach_conversations")
      .update({ title: newTitle })
      .eq("id", convId);

    if (!updateError) {
      setConversations((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, title: newTitle } : c))
      );
    }
  }, []);

  return {
    conversations,
    loading,
    error,
    fetchConversations,
    deleteConversation,
    renameConversation,
  };
}
```

---

## 4. UI Components

### File structure for coaching:
```
src/components/coaching/
  CoachPage.jsx          -- Full page layout (sidebar + chat)
  ConversationSidebar.jsx -- Left sidebar with history
  ChatArea.jsx           -- Main chat area with messages
  ChatMessage.jsx        -- Individual message bubble
  StarterPrompts.jsx     -- Initial prompt suggestions
  ProposalSelector.jsx   -- Modal to pick a proposal to review
```

### Design specs:

**Layout:** Two-column. Left sidebar (280px) for conversation history. Right area fills remaining space for the chat.

**Color scheme (matching Bid Assassin design system):**
- Page background: `#F9FAFB`
- Sidebar background: `#FFFFFF` with right border `#E5E7EB`
- User message bubbles: `#DC2626` (Tiberius Red) with white text
- Assistant message bubbles: `#FFFFFF` with border `#E5E7EB`, text `#374151`
- Input area: sticky at bottom, white background, subtle top border
- Coach avatar/icon: Blue (`#3B82F6`) circle with calculator or ruler icon
- "New Chat" button: `#DC2626` background, white text
- Active conversation in sidebar: `#FEF2F2` background with left red border

**Conversation sidebar items show:**
- Title (truncated to ~40 chars)
- Relative timestamp ("2 hours ago", "Yesterday")
- Small badge if a proposal is linked
- Right-click or hover menu: Rename, Delete

**Chat area behavior:**
- Auto-scroll to bottom on new messages
- Loading state: animated typing indicator (three dots) in an assistant bubble
- Error state: red banner at bottom with retry button
- Messages support basic markdown rendering (bold, lists, code blocks) since the AI coach will format responses with structure
- Input is a textarea that grows up to 4 lines, with send button (red) and an "Attach Proposal" button (gray outline)

**Starter prompts (shown when conversation is empty):**
- Coach avatar and name centered: "The Estimator" with subtitle "Scope Review & Pricing Validation"
- Four clickable prompt cards in a 2x2 grid:
  1. "Review my scope for missing items"
  2. "Am I pricing this right for my market?"
  3. "Help me structure my line items"
  4. "Should I bid this project or pass?"
- Below the grid: small text "Or ask me anything about estimating and pricing"

**Proposal selector (triggered by "Attach Proposal" button):**
- Modal overlay with a list of the user's proposals from Supabase
- Each row shows: project name, client, total amount, date
- Clicking a proposal loads its data as context
- After selection, a small banner appears above the input: "Reviewing: [Project Name] - $XX,XXX" with an X to remove
- The coach's FIRST response after proposal attachment should acknowledge it: "I can see your proposal for [project]. Let me review the scope and line items..."
- If the user describes the project details manually instead of attaching, that is equally valid. The coach should NOT insist on the formal attachment flow

---

## 5. Proposal Context Injection Flow

This is the "smart" part. When a user attaches a proposal, the data gets injected into the system prompt so the coach can reference specific line items.

**Flow:**
1. User clicks "Attach Proposal" or mentions wanting to review a specific proposal
2. If they click the button, `ProposalSelector` modal opens with their proposals list
3. User picks one. `loadProposalContext(proposalId)` fires
4. The proposal data (project name, client, trade, line items with quantities and prices) gets added to the `proposal_context` field in the Edge Function request
5. Edge Function appends the data to the system prompt
6. The coach now references real line items: "Your drywall line item at $2.15/sqft is below the DFW average of $2.40-2.80 for commercial finish"

**What gets injected (keep it lean to save tokens):**
```json
{
  "project_name": "Medical Office TI - Plano",
  "client_name": "ABC Property Management",
  "trade": "Interior Painting",
  "project_type": "Tenant Improvement",
  "total_amount": 34500,
  "line_items": [
    { "description": "Wall prep and prime", "quantity": 8500, "unit": "sqft", "unit_price": 1.25, "total": 10625 },
    { "description": "2-coat finish walls", "quantity": 8500, "unit": "sqft", "unit_price": 2.10, "total": 17850 },
    { "description": "Ceiling paint", "quantity": 3200, "unit": "sqft", "unit_price": 1.50, "total": 4800 }
  ]
}
```

---

## 6. Prompt Caching Strategy

Since the system prompt is identical across all Estimator conversations, enable prompt caching to reduce input token costs by up to 90%.

**Implementation in the Edge Function:**
- Add `anthropic-beta: prompt-caching-2024-07-31` header
- Use `cache_control` on the system prompt:

```typescript
// In the Anthropic API call body:
{
  model: "claude-sonnet-4-6",
  max_tokens: 2048,
  system: [
    {
      type: "text",
      text: fullSystemPrompt,
      cache_control: { type: "ephemeral" }
    }
  ],
  messages: messages,
}
```

This means the first request pays full price for the system prompt, but subsequent requests within the cache TTL (currently ~5 minutes) pay only 10% of the input cost for those cached tokens.

---

## 7. Cost Tracking

The `tokens_used` JSONB field on `coach_messages` stores usage from every assistant response:

```json
{ "input_tokens": 1247, "output_tokens": 382, "cache_creation_input_tokens": 0, "cache_read_input_tokens": 1100 }
```

**Future use:** Build a simple admin view or Supabase SQL query to track:
- Total tokens per user per month
- Average tokens per conversation
- Cache hit rate
- Estimated cost per user

Example query:
```sql
SELECT
  cc.user_id,
  DATE_TRUNC('month', cm.created_at) AS month,
  SUM((cm.tokens_used->>'input_tokens')::int) AS total_input,
  SUM((cm.tokens_used->>'output_tokens')::int) AS total_output,
  COUNT(DISTINCT cc.id) AS conversations,
  COUNT(cm.id) AS messages
FROM coach_messages cm
JOIN coach_conversations cc ON cm.conversation_id = cc.id
WHERE cm.role = 'assistant'
GROUP BY cc.user_id, DATE_TRUNC('month', cm.created_at);
```

---

## 8. Testing Checklist

Before marking The Estimator as done, verify:

- [ ] Edge Function deploys and responds to authenticated requests
- [ ] Unauthenticated requests return 401
- [ ] New conversation creates a record in `coach_conversations`
- [ ] Messages save to `coach_messages` with correct conversation_id
- [ ] Conversation history sidebar loads and sorts by most recent
- [ ] Clicking a past conversation loads its messages
- [ ] Starter prompts appear on empty conversation and are clickable
- [ ] "Attach Proposal" opens the selector modal with real proposal data
- [ ] Attaching a proposal injects context and the coach references it
- [ ] Manually describing a project (without attaching) works fine
- [ ] The coach stays in character and redirects off-topic questions to other coaches
- [ ] Loading/typing indicator shows while waiting for response
- [ ] Error state shows with retry option
- [ ] Delete conversation removes it from sidebar and database
- [ ] Rename conversation updates the title
- [ ] Messages render markdown (bold, lists, code) correctly
- [ ] Auto-scroll works on new messages
- [ ] Mobile responsive: sidebar collapses to a hamburger menu
- [ ] Token usage is recorded on every assistant message
- [ ] Prompt caching header is included in API calls

---

## 9. Future Upgrades (Do NOT build now)

These are planned but out of scope for the initial build:

- **Streaming responses:** Switch from full response to SSE streaming for real-time token output
- **Web search integration:** Let The Estimator look up current material pricing via Claude's web search tool
- **Conversation export:** Export a coaching session as PDF for reference
- **Coach-to-proposal handoff:** "Apply these suggestions to my proposal" button that modifies line items directly
- **Rate limiting:** Cap conversations per user per month based on subscription tier
- **The other 3 coaches:** The Closer, The Prospector, The GC Whisperer -- same architecture, different system prompts
