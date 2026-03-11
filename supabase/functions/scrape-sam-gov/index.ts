/**
 * Edge Function: scrape-sam-gov
 *
 * Polls the SAM.gov Opportunities v2 API, paginates through all results
 * since the last successful scrape, and upserts them into the opportunities
 * table.  After a successful run it triggers the match-opportunities function.
 *
 * Invoke manually:
 *   POST /functions/v1/scrape-sam-gov
 *   Body (optional): { "since": "2026-03-01T00:00:00Z" }
 *
 * Environment variables required (set in Supabase dashboard):
 *   SAM_GOV_API_KEY   — your SAM.gov API key
 *   SUPABASE_URL      — injected automatically by Supabase
 *   SUPABASE_SERVICE_ROLE_KEY — injected automatically by Supabase
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SAM_BASE = "https://api.sam.gov/prod/opportunities/v2/search";
const PAGE_SIZE = 50;          // reduced from 100 to be lighter on the API
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 2000;
const REQUEST_LIMIT = 9;       // circuit breaker: stay under 10/day public tier

// All NAICS codes we care about (from spec)
const TARGET_NAICS = [
  "236220", "238160", "238210", "238220", "238290",
  "238310", "238320", "238330", "238340", "238350",
  "238910", "238990", "561720", "561730", "562111",
  "562119", "811310",
];

// Notice types: solicitation, presolicitation, combined synopsis/solicitation
const NOTICE_TYPES = "o,p,k";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SamOpportunity {
  noticeId: string;
  title: string;
  solicitationNumber?: string;
  department?: string;
  subTier?: string;
  office?: string;
  postedDate?: string;
  responseDeadLine?: string;
  naicsCode?: string;
  classificationCode?: string;
  typeOfSetAside?: string;
  typeOfSetAsideDescription?: string;
  placeOfPerformance?: {
    streetAddress?: string;
    city?: { code?: string; name?: string };
    state?: { code?: string };
    zip?: string;
    country?: { code?: string };
  };
  pointOfContact?: Array<{
    type?: string;
    fullName?: string;
    email?: string;
    phone?: string;
    fax?: string;
    title?: string;
  }>;
  type?: string;
  active?: string;
}

interface ScrapeStats {
  total_fetched: number;
  new_inserts: number;
  updates: number;
  errors: number;
  pages: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatSamDate(iso: string): string {
  // SAM.gov expects MM/DD/YYYY
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

async function fetchWithRetry(
  url: string,
  retries = MAX_RETRIES
): Promise<Response | null> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    let res: Response;
    try {
      res = await fetch(url);
    } catch (networkErr) {
      // SAM.gov drops TCP connections occasionally — log and give up gracefully
      console.warn(`Network error on attempt ${attempt}/${retries}:`, networkErr);
      if (attempt === retries) return null;
      await new Promise((r) => setTimeout(r, RETRY_BASE_MS * attempt));
      continue;
    }

    if (res.status === 429) {
      console.warn(`Rate limited. Waiting 60s before retry ${attempt}/${retries}`);
      await new Promise((r) => setTimeout(r, 60_000));
      continue;
    }

    if (res.status >= 500) {
      const backoff = RETRY_BASE_MS * Math.pow(2, attempt - 1);
      console.warn(`SAM.gov ${res.status}. Retrying in ${backoff}ms (attempt ${attempt}/${retries})`);
      await new Promise((r) => setTimeout(r, backoff));
      continue;
    }

    return res;
  }
  console.warn(`SAM.gov API gave up after ${retries} retries`);
  return null;
}

function mapOpportunity(opp: SamOpportunity) {
  const pop = opp.placeOfPerformance;
  return {
    source: "sam_gov",
    source_id: opp.noticeId,
    title: opp.title,
    solicitation_number: opp.solicitationNumber ?? null,
    department: opp.department ?? null,
    sub_tier: opp.subTier ?? null,
    office: opp.office ?? null,
    posted_date: opp.postedDate ?? null,
    response_deadline: opp.responseDeadLine ?? null,
    naics_code: opp.naicsCode ?? null,
    classification_code: opp.classificationCode ?? null,
    set_aside_type: opp.typeOfSetAside ?? null,
    set_aside_description: opp.typeOfSetAsideDescription ?? null,
    place_of_performance: pop
      ? {
          street_address: pop.streetAddress ?? null,
          city: pop.city?.name ?? null,
          state: pop.state?.code ?? null,
          zip: pop.zip ?? null,
          country: pop.country?.code ?? null,
        }
      : null,
    contacts: opp.pointOfContact ?? null,
    notice_type: opp.type ?? null,
    active: opp.active === "Yes",
    raw_response: opp,
    updated_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Core scrape logic
// ---------------------------------------------------------------------------

async function scrapeNaics(
  apiKey: string,
  naicsCode: string,
  since: string,
  now: string,
  requestCounter: { count: number }
): Promise<{ opportunities: ReturnType<typeof mapOpportunity>[]; pages: number; limitHit: boolean }> {
  const opportunities: ReturnType<typeof mapOpportunity>[] = [];
  let offset = 0;
  let pages = 0;
  let totalRecords = Infinity;

  const postedFrom = formatSamDate(since);
  const postedTo = formatSamDate(now);

  while (offset < totalRecords) {
    // Circuit breaker — stop before hitting SAM.gov's public rate limit
    if (requestCounter.count >= REQUEST_LIMIT) {
      console.warn(`Circuit breaker: ${REQUEST_LIMIT} requests used. Stopping scrape.`);
      return { opportunities, pages, limitHit: true };
    }

    const url =
      `${SAM_BASE}?api_key=${apiKey}` +
      `&limit=${PAGE_SIZE}` +
      `&offset=${offset}` +
      `&postedFrom=${postedFrom}` +
      `&postedTo=${postedTo}` +
      `&ptype=${NOTICE_TYPES}` +
      `&ncode=${naicsCode}`;

    requestCounter.count++;
    const res = await fetchWithRetry(url);

    // Null means a network-level failure — skip this NAICS code gracefully
    if (res === null) {
      console.warn(`Skipping NAICS ${naicsCode} after network failure`);
      break;
    }

    if (!res.ok) {
      console.error(`Non-OK response for NAICS ${naicsCode} offset ${offset}: ${res.status}`);
      break;
    }

    const data = await res.json();
    pages++;

    // SAM.gov wraps results in opportunitiesData.opportunity
    const records: SamOpportunity[] =
      data?.opportunitiesData?.opportunity ?? [];

    if (records.length === 0) break;

    totalRecords = data?.opportunitiesData?.totalRecords ?? records.length;

    for (const opp of records) {
      // Skip award notices and inactive listings
      if (!opp.active || opp.active === "No") continue;
      if (opp.type?.toLowerCase().includes("award")) continue;

      opportunities.push(mapOpportunity(opp));
    }

    offset += PAGE_SIZE;

    // Small politeness delay between pages
    if (offset < totalRecords) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  return { opportunities, pages, limitHit: false };
}

// ---------------------------------------------------------------------------
// CORS helper
// ---------------------------------------------------------------------------

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  // Only allow POST
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  try {
    const apiKey = Deno.env.get("SAM_GOV_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "SAM_GOV_API_KEY not configured" }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Resolve `since` — body param > last_scrape_timestamp in DB > 7 days ago
    let since: string;
    try {
      const body = await req.json().catch(() => ({}));
      if (body?.since) {
        since = new Date(body.since).toISOString();
      } else {
        const result = await supabase
          .from("scrape_metadata")
          .select("value")
          .eq("key", "last_scrape_timestamp")
          .single();
        since = result?.data?.value ?? new Date(Date.now() - 7 * 86_400_000).toISOString();
      }
    } catch {
      since = new Date(Date.now() - 7 * 86_400_000).toISOString();
    }

    const now = new Date().toISOString();
    console.log(`Scraping SAM.gov from ${since} to ${now}`);

    const stats: ScrapeStats = {
      total_fetched: 0,
      new_inserts: 0,
      updates: 0,
      errors: 0,
      pages: 0,
    };

    // Shared request counter across all NAICS codes (circuit breaker)
    const requestCounter = { count: 0 };

    // Scrape each NAICS code
    let circuitBroken = false;
    for (const naicsCode of TARGET_NAICS) {
      if (circuitBroken) break;
      try {
        const { opportunities, pages, limitHit } = await scrapeNaics(apiKey, naicsCode, since, now, requestCounter);
        if (limitHit) circuitBroken = true;
        stats.pages += pages;
        stats.total_fetched += opportunities.length;

        if (opportunities.length === 0) continue;

        // Upsert in batches of 50
        const BATCH = 50;
        for (let i = 0; i < opportunities.length; i += BATCH) {
          const batch = opportunities.slice(i, i + BATCH);

          const result = await supabase
            .from("opportunities")
            .upsert(batch, {
              onConflict: "source_id",
              ignoreDuplicates: false,
            })
            .select("id, source_id");

          if (result?.error) {
            console.error(`Upsert error for NAICS ${naicsCode}:`, result.error.message);
            stats.errors += batch.length;
          } else {
            // Supabase upsert doesn't distinguish inserts vs updates, so we
            // approximate: if source_id was already in DB it's an update.
            stats.new_inserts += result?.data?.length ?? 0;
          }
        }
      } catch (err) {
        console.error(`Failed scraping NAICS ${naicsCode}:`, err);
        stats.errors++;
      }
    }

    // Update last_scrape_timestamp only if we had no fatal errors
    if (stats.errors === 0 || stats.total_fetched > 0) {
      await supabase
        .from("scrape_metadata")
        .upsert({ key: "last_scrape_timestamp", value: now, updated_at: now });
    }

    console.log("Scrape complete:", { ...stats, requests_made: requestCounter.count, circuit_broken: circuitBroken });

    // Trigger matching engine (fire and forget — don't await)
    const matchUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/match-opportunities`;
    fetch(matchUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ triggered_by: "scrape-sam-gov" }),
    }).catch((e) => console.warn("Could not trigger match-opportunities:", e));

    return new Response(
      JSON.stringify({ success: true, since, now, stats, requests_made: requestCounter.count, circuit_broken: circuitBroken }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Unhandled error in scrape-sam-gov:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
});
