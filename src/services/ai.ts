import type { Company, AISuggestions, ChatMessage } from "@/types";

// In dev: Vite proxy handles /api/anthropic -> Anthropic API
// In prod: Vercel serverless function at /api/anthropic
const ANTHROPIC_PROXY = import.meta.env.DEV
  ? "/api/anthropic/v1/messages"
  : "/api/anthropic";

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string;
}

interface AnthropicResponse {
  content: Array<{ type: string; text?: string }>;
}

async function callClaude(
  messages: AnthropicMessage[],
  systemPrompt: string,
  options?: { tools?: unknown[]; max_tokens?: number }
): Promise<string> {
  const res = await fetch(ANTHROPIC_PROXY, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: options?.max_tokens || 4096,
      system: systemPrompt,
      messages,
      ...(options?.tools ? { tools: options.tools } : {}),
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Claude API error: ${res.status} - ${errorText}`);
  }

  const data: AnthropicResponse = await res.json();
  const textBlock = data.content.find((b) => b.type === "text");
  return textBlock?.text || "";
}

function buildSystemPrompt(company: Company): string {
  const trades = company.trades?.length ? company.trades.join(", ") : "General contracting";
  const certs = company.certifications?.length ? company.certifications.join(", ") : "None listed";

  return `You are a professional proposal generator for commercial subcontractors. You help create polished, detailed proposals.

Company Profile:
- Name: ${company.name}
- Trades: ${trades}
- Certifications: ${certs}
- Tone: ${company.proposal_tone || "professional"}
- Default Payment Terms: ${company.default_payment_terms}
- Default Warranty Terms: ${company.default_warranty_terms}
${company.license_number ? `- License: ${company.license_number}` : ""}
${company.insurance_provider ? `- Insurance: ${company.insurance_provider}` : ""}

IMPORTANT: Always respond with valid JSON matching this exact structure:
{
  "line_items": [{ "description": string, "quantity": number, "unit": string, "unit_price": number, "total_price": number }],
  "scope_of_work": string (detailed narrative),
  "exclusions": string[] (items NOT included),
  "inclusions": string[] (items included),
  "timeline": string (estimated timeline),
  "total_amount": number,
  "pricing_confidence": "low" | "medium" | "high",
  "market_range": { "low": number, "high": number },
  "suggestions": string[] (tips to improve the proposal)
}

Use realistic market pricing for the given trade and region. The tone should be ${company.proposal_tone}.`;
}

export async function generateProposal(
  company: Company,
  scopeNotes: string,
  projectDetails: {
    projectName: string;
    clientName: string;
    clientCompany: string;
    projectAddress: string;
    tradeType: string;
  }
): Promise<AISuggestions> {
  const systemPrompt = buildSystemPrompt(company);

  const userMessage = `Generate a detailed proposal for the following job:

Project: ${projectDetails.projectName}
Client: ${projectDetails.clientName} (${projectDetails.clientCompany})
Address: ${projectDetails.projectAddress}
Trade: ${projectDetails.tradeType}

Scope Notes:
${scopeNotes}

Generate realistic line items with market-appropriate pricing. Return ONLY the JSON object, no markdown or extra text.`;

  const response = await callClaude(
    [{ role: "user", content: userMessage }],
    systemPrompt
  );

  try {
    const cleaned = response.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned) as AISuggestions;
  } catch {
    throw new Error("Failed to parse AI response. Please try again.");
  }
}

export async function researchClient(
  clientName: string,
  clientCompany: string,
  location: string
): Promise<string> {
  const systemPrompt = `You are a business research assistant. Research the given company and provide useful intelligence for tailoring a commercial subcontractor proposal to win their business.

Return your findings as a JSON object:
{
  "company_overview": string,
  "google_business": { "rating": number, "review_count": number, "review_themes": string[], "categories": string[] } | null,
  "website_summary": string,
  "social_media": { "linkedin": string, "other": string } | null,
  "tailoring_insights": string[]
}`;

  const response = await callClaude(
    [
      {
        role: "user",
        content: `Research this company for a proposal: ${clientCompany} (contact: ${clientName}), located in ${location}. Find their online presence, reviews, values, and any useful info for tailoring a bid.`,
      },
    ],
    systemPrompt,
    {
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      max_tokens: 4096,
    }
  );

  return response;
}

export async function agentChat(
  company: Company,
  conversationHistory: ChatMessage[],
  proposalContext: Record<string, unknown>,
  userMessage: string
): Promise<{ reply: string; proposalUpdates?: Partial<AISuggestions> }> {
  const systemPrompt = `${buildSystemPrompt(company)}

You are also a proposal review assistant. The user is reviewing a generated proposal and may ask for changes.

Current proposal context:
${JSON.stringify(proposalContext, null, 2)}

When the user asks for changes, respond with:
1. A conversational reply explaining what you changed
2. If you made changes to the proposal, include a JSON block wrapped in <proposal_update> tags:
<proposal_update>
{ ... partial proposal fields to update ... }
</proposal_update>

Only include the fields that changed. If no proposal changes are needed (just answering a question), omit the tags entirely.`;

  const messages: AnthropicMessage[] = [
    ...conversationHistory.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: userMessage },
  ];

  const response = await callClaude(messages, systemPrompt);

  const updateMatch = response.match(
    /<proposal_update>([\s\S]*?)<\/proposal_update>/
  );
  let proposalUpdates: Partial<AISuggestions> | undefined;

  if (updateMatch) {
    try {
      proposalUpdates = JSON.parse(updateMatch[1].trim());
    } catch {
      // ignore parse errors for updates
    }
  }

  const reply = response
    .replace(/<proposal_update>[\s\S]*?<\/proposal_update>/, "")
    .trim();

  return { reply, proposalUpdates };
}

export async function agentIntakeChat(
  company: Company,
  conversationHistory: ChatMessage[],
  userMessage: string
): Promise<{ reply: string; intakeComplete: boolean; intakeData?: Record<string, string> }> {
  const systemPrompt = `You are a friendly proposal intake assistant for ${company.name}. You need to gather information from the user to build a proposal.

You need to collect:
1. Client info (company name, contact name, email)
2. Project address or location
3. Type of work needed (their registered trades: ${company.trades?.join(", ") || "General"})
4. Any scope notes, RFP text, or job details
5. Special requirements (timeline, budget range, certifications needed)
6. Anything else relevant

Ask questions one or two at a time in a conversational, friendly way. Don't ask for all info at once.

When you have enough information to generate a proposal, respond with the gathered data wrapped in <intake_complete> tags:
<intake_complete>
{
  "client_name": "...",
  "client_company": "...",
  "client_email": "...",
  "project_address": "...",
  "trade_type": "...",
  "scope_notes": "...",
  "special_requirements": "...",
  "additional_notes": "..."
}
</intake_complete>

Only include <intake_complete> when you have at minimum: client company, project location, and type of work.`;

  // Filter to only user/assistant messages, skip the initial greeting,
  // and ensure conversation starts with a user message (API requirement)
  const allMessages: AnthropicMessage[] = [
    ...conversationHistory.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: userMessage },
  ];

  // Ensure first message is from "user" — Claude API requires it
  const messages: AnthropicMessage[] = [];
  for (const msg of allMessages) {
    if (messages.length === 0 && msg.role === "assistant") continue; // skip leading assistant messages
    messages.push(msg);
  }

  const response = await callClaude(messages, systemPrompt);

  const intakeMatch = response.match(
    /<intake_complete>([\s\S]*?)<\/intake_complete>/
  );

  if (intakeMatch) {
    try {
      const intakeData = JSON.parse(intakeMatch[1].trim());
      const reply = response
        .replace(/<intake_complete>[\s\S]*?<\/intake_complete>/, "")
        .trim();
      return { reply, intakeComplete: true, intakeData };
    } catch {
      // parse failed, treat as not complete
    }
  }

  return { reply: response, intakeComplete: false };
}
