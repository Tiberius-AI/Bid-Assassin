import type { Company, AISuggestions, ChatMessage } from "@/types";

// ============================================================
// API Proxy Endpoints
// ============================================================
const ANTHROPIC_PROXY = import.meta.env.DEV
  ? "/api/anthropic/v1/messages"
  : "/api/anthropic";

const OPENAI_PROXY = import.meta.env.DEV
  ? "/api/openai-dev"
  : "/api/openai";

// ============================================================
// Shared: Retry with exponential backoff for rate limits
// ============================================================
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retries = 3
): Promise<Response> {
  for (let attempt = 0; attempt < retries; attempt++) {
    const res = await fetch(url, init);
    if (res.status === 429 && attempt < retries - 1) {
      const waitSec = 15 * Math.pow(2, attempt);
      console.warn(`Rate limited, retrying in ${waitSec}s (attempt ${attempt + 1}/${retries})`);
      await new Promise((r) => setTimeout(r, waitSec * 1000));
      continue;
    }
    return res;
  }
  return fetch(url, init);
}

// ============================================================
// OpenAI: GPT-4o for intake, research, and web search
// ============================================================
interface OpenAIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

async function callOpenAI(
  messages: OpenAIMessage[],
  options?: { tools?: unknown[]; web_search?: boolean; max_tokens?: number }
): Promise<string> {
  // Responses API uses "input" instead of "messages"
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: Record<string, any> = {
    model: "gpt-4o",
    input: messages,
  };

  // Web search via Responses API tool
  if (options?.web_search) {
    body.tools = [{ type: "web_search_preview" }];
  }
  if (options?.tools) {
    body.tools = [...(body.tools || []), ...options.tools];
  }

  const res = await fetchWithRetry(OPENAI_PROXY, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`OpenAI API error: ${res.status} - ${errorText}`);
  }

  const data = await res.json();

  // Responses API returns output_text for the final text
  if (data.output_text) {
    return data.output_text;
  }

  // Fallback: extract from output array
  if (data.output) {
    for (const item of data.output) {
      if (item.type === "message" && item.content) {
        for (const block of item.content) {
          if (block.type === "output_text" && block.text) {
            return block.text;
          }
        }
      }
    }
  }

  return "";
}

// ============================================================
// Claude: Opus 4.6 for high-quality proposal writing
// ============================================================
interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | Array<{ type: string; [key: string]: unknown }>;
}

interface ContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  content?: unknown;
}

interface AnthropicResponse {
  content: ContentBlock[];
  stop_reason?: string;
}

async function callClaude(
  messages: AnthropicMessage[],
  systemPrompt: string,
  options?: { max_tokens?: number }
): Promise<string> {
  const body = JSON.stringify({
    model: "claude-opus-4-20250514",
    max_tokens: options?.max_tokens || 4096,
    system: systemPrompt,
    messages,
  });

  const res = await fetchWithRetry(ANTHROPIC_PROXY, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Claude API error: ${res.status} - ${errorText}`);
  }

  const data: AnthropicResponse = await res.json();
  const textBlocks = data.content.filter((b) => b.type === "text" && b.text);
  return textBlocks.map((b) => b.text).join("\n") || "";
}

// ============================================================
// Company prompt builder (used by Claude for proposals)
// ============================================================
function buildProposalSystemPrompt(company: Company): string {
  const trades = company.trades?.length ? company.trades.join(", ") : "General contracting";
  const certs = company.certifications?.length ? company.certifications.join(", ") : "None listed";

  return `You are a world-class proposal writer for commercial subcontractors. You write compelling, detailed, and winning proposals.

Company Profile:
- Name: ${company.name}
- Trades: ${trades}
- Certifications: ${certs}
- Tone: ${company.proposal_tone || "professional"}
- Default Payment Terms: ${company.default_payment_terms}
- Default Warranty Terms: ${company.default_warranty_terms}
${company.license_number ? `- License: ${company.license_number}` : ""}
${company.insurance_provider ? `- Insurance: ${company.insurance_provider}` : ""}

PRICING MODE — follow this exactly:

For RECURRING or MAINTENANCE services (landscaping, janitorial, cleaning, security, HVAC maintenance, snow removal, pest control, etc.):
  - Set "pricing_mode": "monthly"
  - All line item quantities must be PER MONTH (e.g., 4 visits/month for weekly service — NOT 52/year)
  - Units must reflect per-month cadence: "visits/month", "applications/month", "months", etc.
  - "total_amount" = the MONTHLY contract value (e.g., 1450 for $1,450/month)
  - Do NOT multiply out to annual — the display layer handles that

For ONE-TIME or PROJECT-BASED work (construction, renovation, painting, drywall, roofing, flooring, concrete, etc.):
  - Set "pricing_mode": "annual"
  - Quantities represent full project scope (sq ft, linear ft, units, lump sum, etc.)
  - "total_amount" = full project total

IMPORTANT: Always respond with valid JSON matching this exact structure:
{
  "line_items": [{ "description": string, "quantity": number, "unit": string, "unit_price": number, "total_price": number }],
  "scope_of_work": string (detailed narrative),
  "exclusions": string[] (items NOT included),
  "inclusions": string[] (items included),
  "timeline": string (estimated timeline),
  "total_amount": number,
  "pricing_mode": "monthly" | "annual",
  "pricing_confidence": "low" | "medium" | "high",
  "market_range": { "low": number, "high": number },
  "suggestions": string[] (tips to improve the proposal)
}

Use realistic market pricing for the given trade and region. The tone should be ${company.proposal_tone}. Write with authority and confidence — this proposal needs to WIN the bid.`;
}

// ============================================================
// EXPORTED FUNCTIONS
// ============================================================

/**
 * Generate proposal — Claude Opus 4.6 (quality writing)
 */
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
  const systemPrompt = buildProposalSystemPrompt(company);

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

/**
 * Research client — OpenAI GPT-4o with web search
 */
export async function researchClient(
  clientName: string,
  clientCompany: string,
  location: string
): Promise<string> {
  const response = await callOpenAI(
    [
      {
        role: "system",
        content: `You are a business research assistant. Research the given company and provide useful intelligence for tailoring a commercial subcontractor proposal to win their business.

Return your findings as a JSON object:
{
  "company_overview": string,
  "google_business": { "rating": number, "review_count": number, "review_themes": string[], "categories": string[] } | null,
  "website_summary": string,
  "social_media": { "linkedin": string, "other": string } | null,
  "tailoring_insights": string[]
}`,
      },
      {
        role: "user",
        content: `Research this company for a proposal: ${clientCompany} (contact: ${clientName}), located in ${location}. Find their online presence, reviews, values, recent projects, and any useful info for tailoring a winning bid. Search the web thoroughly.`,
      },
    ],
    { web_search: true, max_tokens: 4096 }
  );

  return response;
}

/**
 * Agent review chat — Claude Opus 4.6 (proposal refinement)
 */
export async function agentChat(
  company: Company,
  conversationHistory: ChatMessage[],
  proposalContext: Record<string, unknown>,
  userMessage: string
): Promise<{ reply: string; proposalUpdates?: Partial<AISuggestions> }> {
  const systemPrompt = `${buildProposalSystemPrompt(company)}

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

/**
 * Fetch and extract text content from a URL via OpenAI web search
 */
export async function fetchContentFromUrl(
  url: string,
  contentType: "about" | "terms"
): Promise<string> {
  const description =
    contentType === "about"
      ? "About Us, Company History, or Services section"
      : "Terms and Conditions or Legal Terms section";

  const response = await callOpenAI(
    [
      {
        role: "system",
        content: `You are a web content extractor. Visit the provided URL and extract only the ${description} text. Return it as clean plain text paragraphs — no markdown, no HTML tags, no navigation elements. Just the relevant body text, well formatted.`,
      },
      {
        role: "user",
        content: `Please visit this URL and extract the ${description}: ${url}`,
      },
    ],
    { web_search: true, max_tokens: 2048 }
  );

  return response.trim();
}

/**
 * Intake chat — OpenAI GPT-4o with web search (research + conversation)
 */
export async function agentIntakeChat(
  company: Company,
  conversationHistory: ChatMessage[],
  userMessage: string
): Promise<{ reply: string; intakeComplete: boolean; intakeData?: Record<string, string> }> {
  const systemPrompt = `You are a friendly proposal intake assistant for ${company.name}. You need to gather information from the user to build a proposal.

You have web search capabilities — use them! When a user mentions a client company, search for it to find their address, contact info, services, reviews, and any useful business intelligence. This helps you fill in gaps and tailor the proposal.

You need to collect:
1. Client info (company name, contact name, email)
2. Project address or location
3. Type of work needed (their registered trades: ${company.trades?.join(", ") || "General"})
4. Any scope notes, RFP text, or job details
5. Special requirements (timeline, budget range, certifications needed)
6. Anything else relevant

Ask questions one or two at a time in a conversational, friendly way. Don't ask for all info at once. When you know the client company name, proactively search for them online and share what you find — this shows value to the user.

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

  // Build messages for OpenAI format
  const openaiMessages: OpenAIMessage[] = [
    { role: "system", content: systemPrompt },
  ];

  // Add conversation history (skip leading assistant messages)
  for (const m of conversationHistory) {
    if (openaiMessages.length === 1 && m.role === "assistant") continue;
    openaiMessages.push({
      role: m.role as "user" | "assistant",
      content: m.content,
    });
  }
  openaiMessages.push({ role: "user", content: userMessage });

  const response = await callOpenAI(openaiMessages, {
    web_search: true,
    max_tokens: 4096,
  });

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
