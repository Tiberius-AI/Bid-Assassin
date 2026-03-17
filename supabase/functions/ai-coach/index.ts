import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }

    const body = await req.json();
    const {
      coach_type = "estimator",
      messages = [],
      proposal_context = null,
      conversation_id = null,
    } = body;

    const systemPrompt = COACH_SYSTEM_PROMPTS[coach_type];
    if (!systemPrompt) {
      return new Response(JSON.stringify({ error: `Unknown coach: ${coach_type}` }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }

    let fullSystemPrompt = systemPrompt;
    if (proposal_context) {
      fullSystemPrompt += `\n\nCONTEXT -- The user has shared the following proposal data for review:\n${JSON.stringify(proposal_context, null, 2)}\n\nAnalyze this proposal data when relevant to the conversation. Reference specific line items by name and amount.`;
    }

    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        max_tokens: 2048,
        messages: [
          { role: "system", content: fullSystemPrompt },
          ...messages,
        ],
      }),
    });

    const openaiData = await openaiResponse.json();

    if (!openaiResponse.ok) {
      const errMsg = openaiData?.error?.message || JSON.stringify(openaiData);
      console.error("OpenAI API error:", errMsg);
      return new Response(JSON.stringify({ error: `OpenAI: ${errMsg}` }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }

    const assistantMessage = openaiData.choices[0]?.message?.content ?? "";

    return new Response(
      JSON.stringify({
        message: assistantMessage,
        usage: openaiData.usage,
        conversation_id,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      }
    );
  } catch (err) {
    console.error("Edge function error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }
});
