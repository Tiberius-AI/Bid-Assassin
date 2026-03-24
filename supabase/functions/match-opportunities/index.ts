/**
 * Edge Function: match-opportunities
 *
 * Scores new opportunities against every active member profile using the
 * 5-factor scoring model from the Prospector spec, then inserts qualified
 * matches into opportunity_matches.  After inserting, it triggers the
 * notify-hot-alerts function for any matches >= 80.
 *
 * Invoke:
 *   POST /functions/v1/match-opportunities
 *   Body (optional):
 *     { "opportunity_ids": ["uuid", ...] }  — only score these opportunities
 *     { "triggered_by": "scrape-sam-gov" }  — auto-pick last 24h of opps
 *
 * Environment variables (auto-injected by Supabase):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Company {
  id: string;
  profile_id: string;        // = auth.users id, used as member_id
  trades: string[];
  certifications: string[];
  state: string | null;
  city: string | null;
}

interface Opportunity {
  id: string;
  naics_code: string | null;
  set_aside_type: string | null;
  place_of_performance: {
    state?: string | null;
    city?: string | null;
    country?: string | null;
  } | null;
  posted_date: string | null;
  response_deadline: string | null;
  department: string | null;
  office: string | null;
}

interface NaicsMapping {
  naics_code: string;
  trade: string;
  relevance_weight: number;
}

interface NotificationPrefs {
  member_id: string;
  hot_alert_threshold: number;
  min_score_threshold: number;
}

interface ScoreBreakdown {
  trade: number;
  location: number;
  certification: number;
  freshness: number;
  engagement: number;
}

interface MatchResult {
  member_id: string;
  opportunity_id: string;
  fit_score: number;
  score_breakdown: ScoreBreakdown;
  status: string;
}

// ---------------------------------------------------------------------------
// Adjacent states map (for location scoring)
// ---------------------------------------------------------------------------

const ADJACENT_STATES: Record<string, string[]> = {
  TX: ["OK", "AR", "LA", "NM", "CO"],
  OK: ["TX", "KS", "MO", "AR", "NM", "CO"],
  AR: ["TX", "OK", "MO", "TN", "MS", "LA"],
  LA: ["TX", "AR", "MS"],
  NM: ["TX", "OK", "CO", "AZ", "UT"],
  FL: ["GA", "AL"],
  GA: ["FL", "AL", "TN", "NC", "SC"],
  CA: ["OR", "NV", "AZ"],
  NY: ["NJ", "CT", "MA", "VT", "PA"],
  // Add more as the user base expands
};

// Set-aside codes that map to certification fields
const SET_ASIDE_TO_CERT: Record<string, string[]> = {
  "SBA":      ["sba", "small_business"],
  "8A":       ["8a", "8(a)"],
  "HUBZone":  ["hubzone", "hub_zone"],
  "SDVOSBC":  ["sdvosb", "sdvosbc", "veteran"],
  "WOSB":     ["wosb", "woman_owned", "women_owned"],
  "EDWOSB":   ["wosb", "woman_owned", "edwosb"],
  "VSB":      ["veteran"],
};

// ---------------------------------------------------------------------------
// Scoring functions
// ---------------------------------------------------------------------------

function scoreTradeMatch(
  opp: Opportunity,
  company: Company,
  naicsMap: Map<string, NaicsMapping[]>
): number {
  if (!opp.naics_code) return 0;

  const mappings = naicsMap.get(opp.naics_code) ?? [];
  if (mappings.length === 0) return 0;

  const memberTrades = new Set(
    company.trades.map((t) => t.toLowerCase().trim())
  );

  let bestWeight = 0;
  for (const mapping of mappings) {
    if (memberTrades.has(mapping.trade.toLowerCase().trim())) {
      bestWeight = Math.max(bestWeight, mapping.relevance_weight);
    }
  }

  return Math.round(35 * bestWeight);
}

function scoreLocation(opp: Opportunity, company: Company): number {
  const oppState = opp.place_of_performance?.state?.toUpperCase() ?? null;
  const memberState = company.state?.toUpperCase() ?? null;

  // No stated place of performance — treat as national
  if (!oppState) return 5;

  if (!memberState) return 5;

  // Same state (radius-based 25-pt bucket requires geocoding — Phase 2)
  if (oppState === memberState) return 15;

  // Adjacent state
  const adjacent = ADJACENT_STATES[memberState] ?? [];
  if (adjacent.includes(oppState)) return 10;

  // No geographic match
  return 5;
}

function scoreCertification(opp: Opportunity, company: Company): number {
  const setAside = opp.set_aside_type?.trim();

  // No set-aside requirement — open to all
  if (!setAside) return 10;

  const requiredCerts = SET_ASIDE_TO_CERT[setAside] ?? [];
  if (requiredCerts.length === 0) return 10; // unknown set-aside, assume open

  const memberCerts = new Set(
    company.certifications.map((c) => c.toLowerCase().trim())
  );

  const hasMatch = requiredCerts.some((cert) => memberCerts.has(cert));
  return hasMatch ? 20 : 0;
}

function scoreFreshness(opp: Opportunity): number {
  const now = new Date();

  // Expired deadline = not worth pursuing
  if (opp.response_deadline && new Date(opp.response_deadline) < now) return 0;

  if (!opp.posted_date) return 2;

  const posted = new Date(opp.posted_date);
  const diffDays = (now.getTime() - posted.getTime()) / (1000 * 60 * 60 * 24);

  if (diffDays < 1)  return 10;
  if (diffDays <= 3) return 8;
  if (diffDays <= 7) return 5;
  return 2;
}

function scoreEngagement(
  opp: Opportunity,
  agencyProposalCounts: Map<string, { total: number; won: number }>
): number {
  // Build a normalized agency key from department + office
  const agencyKey = [opp.department, opp.office]
    .filter(Boolean)
    .join("|")
    .toLowerCase();

  const history = agencyProposalCounts.get(agencyKey);
  if (!history) return 3;          // New agency
  if (history.won > 0) return 10;  // Won before
  return 5;                         // Bid before, no win
}

// ---------------------------------------------------------------------------
// Build agency engagement map for a member
// ---------------------------------------------------------------------------

async function buildEngagementMap(
  supabase: ReturnType<typeof createClient>,
  companyId: string
): Promise<Map<string, { total: number; won: number }>> {
  const map = new Map<string, { total: number; won: number }>();

  // We look at proposals where the client_name resembles a government agency.
  // This is an approximation for Phase 1.
  const { data: proposals } = await supabase
    .from("proposals")
    .select("client_name, client_company, status")
    .eq("company_id", companyId)
    .not("client_name", "is", null);

  if (!proposals) return map;

  for (const p of proposals) {
    const key = (p.client_name ?? p.client_company ?? "").toLowerCase();
    if (!key) continue;
    const existing = map.get(key) ?? { total: 0, won: 0 };
    existing.total++;
    if (p.status === "accepted") existing.won++;
    map.set(key, existing);
  }

  return map;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Parse request body
  let opportunityIds: string[] | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    opportunityIds = body?.opportunity_ids ?? null;
  } catch {
    // no body, proceed with default
  }

  // 1. Load opportunities to process
  let oppsQuery = supabase
    .from("sam_opportunities")
    .select("id, naics_code, set_aside_type, place_of_performance, posted_date, response_deadline, department, office")
    .eq("active", true);

  if (opportunityIds && opportunityIds.length > 0) {
    oppsQuery = oppsQuery.in("id", opportunityIds);
  } else {
    // Default: opportunities posted in the last 48 hours
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    oppsQuery = oppsQuery.gte("created_at", cutoff);
  }

  const { data: opportunities, error: oppsError } = await oppsQuery;

  if (oppsError) {
    console.error("Failed to load opportunities:", oppsError.message);
    return new Response(JSON.stringify({ error: oppsError.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!opportunities || opportunities.length === 0) {
    console.log("No opportunities to match.");
    return new Response(
      JSON.stringify({ success: true, message: "No opportunities to process", matches_created: 0 }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  console.log(`Matching ${opportunities.length} opportunities...`);

  // 2. Load all active companies (members)
  const { data: companies, error: companiesError } = await supabase
    .from("companies")
    .select("id, profile_id, trades, certifications, state, city");

  if (companiesError) {
    console.error("Failed to load companies:", companiesError.message);
    return new Response(JSON.stringify({ error: companiesError.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!companies || companies.length === 0) {
    console.log("No member companies found.");
    return new Response(
      JSON.stringify({ success: true, message: "No member companies", matches_created: 0 }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  // 3. Load notification preferences (for per-member thresholds)
  const memberIds = companies.map((c: Company) => c.profile_id);
  const { data: prefsData } = await supabase
    .from("notification_preferences")
    .select("member_id, hot_alert_threshold, min_score_threshold")
    .in("member_id", memberIds);

  const prefsMap = new Map<string, NotificationPrefs>();
  for (const p of prefsData ?? []) {
    prefsMap.set(p.member_id, p);
  }

  // Default prefs if none set
  const defaultPrefs: Omit<NotificationPrefs, "member_id"> = {
    hot_alert_threshold: 80,
    min_score_threshold: 50,
  };

  // 4. Load NAICS trade map into memory
  const { data: naicsRows } = await supabase
    .from("naics_trade_map")
    .select("naics_code, trade, relevance_weight");

  const naicsMap = new Map<string, NaicsMapping[]>();
  for (const row of naicsRows ?? []) {
    const existing = naicsMap.get(row.naics_code) ?? [];
    existing.push(row);
    naicsMap.set(row.naics_code, existing);
  }

  // 5. Load existing matches to avoid re-scoring (member_id, opportunity_id pairs)
  const oppIds = opportunities.map((o: Opportunity) => o.id);
  const { data: existingMatches } = await supabase
    .from("opportunity_matches")
    .select("member_id, opportunity_id")
    .in("opportunity_id", oppIds);

  const existingSet = new Set<string>();
  for (const m of existingMatches ?? []) {
    existingSet.add(`${m.member_id}:${m.opportunity_id}`);
  }

  // 6. Score every opportunity × member pair
  const newMatches: MatchResult[] = [];
  const hotAlertMatches: MatchResult[] = [];

  for (const company of companies as Company[]) {
    const prefs = prefsMap.get(company.profile_id) ?? { ...defaultPrefs, member_id: company.profile_id };
    const minScore = prefs.min_score_threshold ?? 50;
    const hotThreshold = prefs.hot_alert_threshold ?? 80;

    // Build engagement history for this member (lazy — only once per member)
    const engagementMap = await buildEngagementMap(supabase, company.id);

    for (const opp of opportunities as Opportunity[]) {
      const pairKey = `${company.profile_id}:${opp.id}`;
      if (existingSet.has(pairKey)) continue; // already matched

      const trade        = scoreTradeMatch(opp, company, naicsMap);
      const location     = scoreLocation(opp, company);
      const certification = scoreCertification(opp, company);
      const freshness    = scoreFreshness(opp);
      const engagement   = scoreEngagement(opp, engagementMap);

      const total = trade + location + certification + freshness + engagement;

      if (total < minScore) continue;

      const match: MatchResult = {
        member_id: company.profile_id,
        opportunity_id: opp.id,
        fit_score: total,
        score_breakdown: { trade, location, certification, freshness, engagement },
        status: "new",
      };

      newMatches.push(match);
      if (total >= hotThreshold) hotAlertMatches.push(match);
    }
  }

  // 7. Insert matches in batches of 100
  let matchesCreated = 0;
  let insertErrors = 0;
  const BATCH = 100;

  for (let i = 0; i < newMatches.length; i += BATCH) {
    const batch = newMatches.slice(i, i + BATCH);
    const { error } = await supabase
      .from("opportunity_matches")
      .upsert(batch, { onConflict: "member_id,opportunity_id", ignoreDuplicates: true });

    if (error) {
      console.error("Insert error:", error.message);
      insertErrors += batch.length;
    } else {
      matchesCreated += batch.length;
    }
  }

  console.log(`Matches created: ${matchesCreated}, hot alerts: ${hotAlertMatches.length}, errors: ${insertErrors}`);

  // 8. Trigger hot alert notifications (fire and forget)
  if (hotAlertMatches.length > 0) {
    const notifyUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/notify-hot-alerts`;
    fetch(notifyUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        match_ids: hotAlertMatches.map((m) => ({
          member_id: m.member_id,
          opportunity_id: m.opportunity_id,
        })),
      }),
    }).catch((e) => console.warn("Could not trigger notify-hot-alerts:", e));
  }

  return new Response(
    JSON.stringify({
      success: true,
      opportunities_processed: opportunities.length,
      members_evaluated: companies.length,
      matches_created: matchesCreated,
      hot_alerts: hotAlertMatches.length,
      errors: insertErrors,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
