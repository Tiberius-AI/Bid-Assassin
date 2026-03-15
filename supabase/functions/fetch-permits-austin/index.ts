/**
 * Edge Function: fetch-permits-austin
 *
 * Fetches commercial building permits from the Austin open-data
 * Socrata API, scores them against company profiles, and inserts
 * new opportunity rows with source='permit'.
 *
 * Austin uses standard lat/lng — no coordinate conversion needed.
 * Socrata supports server-side SoQL filtering so we only pull
 * relevant commercial permits.
 *
 * POST body: { "company_id": "uuid" }   (optional — processes all if omitted)
 *
 * Env vars (auto-injected by Supabase):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const SOCRATA_BASE = "https://data.austintexas.gov/resource/3syk-w9eu.json";
const DEFAULT_MIN_VALUATION = 50_000;
const PAGE_SIZE = 1000;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface SocrataPermit {
  permittype?: string;           // actual field name (not permit_type)
  permit_type_desc?: string;
  permit_class?: string;
  permit_class_mapped?: string;  // "Commercial", "Residential", etc.
  work_class?: string;
  description?: string;
  issue_date?: string;           // actual field name (not issued_date)
  applieddate?: string;
  status_current?: string;
  original_address1?: string;    // actual field name (not original_address)
  latitude?: string;
  longitude?: string;
  total_existing_bldg_sqft?: string;
  total_new_add_sqft?: string;
  total_job_valuation?: string;  // actual field name (not total_valuation)
  total_valuation_remodel?: string;
  contractor_company_name?: string;
  applicant_org?: string;
  // Socrata may include extra fields
  [key: string]: unknown;
}

interface LatLng {
  lat: number;
  lng: number;
}

// ─────────────────────────────────────────────────────────────
// Haversine distance (miles)
// ─────────────────────────────────────────────────────────────

function distanceMiles(a: LatLng, b: LatLng): number {
  const R = 3958.8;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(h));
}

// ─────────────────────────────────────────────────────────────
// Permit-specific match scoring (same algorithm as SA)
// ─────────────────────────────────────────────────────────────

function scorePermitTradeAlignment(
  permitType: string,
  workClass: string,
  userTrades: string[],
): number {
  const pt = (permitType + " " + workClass).toUpperCase();
  let best = 0;

  for (const trade of userTrades) {
    const t = trade.toLowerCase();
    let score = 0;

    if (
      (pt.includes("ELECTRICAL") && t.includes("electrical")) ||
      (pt.includes("MECHANICAL") && t.includes("mechanical")) ||
      (pt.includes("MECHANICAL") && t.includes("hvac")) ||
      (pt.includes("PLUMBING") && t.includes("plumbing")) ||
      (pt.includes("FIRE") && t.includes("fire"))
    ) {
      score = 40;
    } else if (pt.includes("NEW") || pt.includes("SHELL")) {
      score = 30;
    } else if (
      pt.includes("REMODEL") ||
      pt.includes("ADDITION") ||
      pt.includes("INTERIOR") ||
      pt.includes("TENANT")
    ) {
      score = 20;
    } else if (pt.includes("SITE")) {
      score = ["concrete", "excavation", "grading", "paving", "utility"].some(
        (x) => t.includes(x),
      )
        ? 25
        : 10;
    } else {
      score = 10;
    }

    best = Math.max(best, score);
  }
  return best;
}

function scorePermitValue(valuation: number): number {
  if (valuation >= 1_000_000) return 25;
  if (valuation >= 500_000) return 20;
  if (valuation >= 200_000) return 15;
  if (valuation >= 100_000) return 10;
  return 5;
}

function scorePermitDistance(miles: number): number {
  if (miles <= 10) return 20;
  if (miles <= 25) return 15;
  if (miles <= 50) return 10;
  return 5;
}

function scorePermitRecency(dateStr: string | undefined): number {
  if (!dateStr) return 3;
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = diff / 86_400_000;
  if (days <= 7) return 15;
  if (days <= 30) return 12;
  if (days <= 90) return 8;
  return 3;
}

function buildPermitMatchReason(
  permitType: string,
  valuation: number,
  distMiles: number | null,
  userTrades: string[],
): string {
  const trade = userTrades[0] || "your trade";
  const val =
    valuation >= 1_000_000
      ? `$${(valuation / 1_000_000).toFixed(1)}M`
      : `$${(valuation / 1_000).toFixed(0)}K`;
  const dist =
    distMiles !== null
      ? distMiles < 1
        ? "under 1mi"
        : `${distMiles.toFixed(1)}mi`
      : "unknown distance";

  const pt = permitType.toLowerCase();
  if (pt.includes("new"))
    return `${val} new commercial build in Austin ${dist} away — will need ${trade} bids`;
  if (pt.includes("remodel") || pt.includes("interior") || pt.includes("tenant"))
    return `${val} commercial remodel in Austin ${dist} away — potential ${trade} scope`;
  if (pt.includes("addition"))
    return `${val} commercial addition in Austin ${dist} away — likely needs ${trade}`;
  return `${val} commercial permit in Austin ${dist} away — potential ${trade} opportunity`;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function cleanPermitType(raw: string): string {
  return (raw || "Commercial Permit")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalize address for dedup grouping.
 */
function addressKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\b(suite|ste|unit|apt|#)\s*\S+/gi, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ─────────────────────────────────────────────────────────────
// Socrata fetch with pagination
// ─────────────────────────────────────────────────────────────

async function fetchSocrataPermits(): Promise<SocrataPermit[]> {
  // Probe: fetch 1 row without filtering to verify connectivity + field names
  const probeUrl = `${SOCRATA_BASE}?$limit=1`;
  const probeRes = await fetch(probeUrl, { headers: { Accept: "application/json" } });
  if (!probeRes.ok) {
    console.error(`Socrata probe failed: ${probeRes.status} ${await probeRes.text()}`);
  } else {
    const probeData = await probeRes.json();
    console.log("Socrata probe row (field names):", JSON.stringify(probeData[0] ?? {}));
  }

  // Fetch permits issued in the last 180 days
  const cutoff = new Date(Date.now() - 180 * 86_400_000)
    .toISOString()
    .split("T")[0];

  console.log(`Querying Socrata with cutoff date: ${cutoff}`);

  const allResults: SocrataPermit[] = [];
  let offset = 0;

  while (true) {
    // Use only the date filter — Socrata SoQL is sensitive to column types
    // (quoting a number column causes empty results). Valuation and commercial
    // filtering happens in code after the fetch.
    const where = encodeURIComponent(`issue_date > '${cutoff}' AND permit_class_mapped = 'Commercial'`);
    const url = `${SOCRATA_BASE}?$where=${where}&$limit=${PAGE_SIZE}&$offset=${offset}&$order=issue_date DESC`;
    console.log(`Socrata URL: ${url}`);

    const res = await fetch(url, {
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      console.error(`Socrata API error: ${res.status} ${await res.text()}`);
      break;
    }

    const page: SocrataPermit[] = await res.json();
    console.log(`Socrata page offset=${offset}: ${page.length} rows`);
    if (page.length === 0) break;

    allResults.push(...page);
    offset += PAGE_SIZE;

    // Safety cap — don't fetch more than 5000 rows
    if (offset >= 5000) break;
  }

  return allResults;
}

// ─────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ── Parse body (optional company_id) ──────────────────────
  let targetCompanyId: string | null = null;
  try {
    if (req.method === "POST") {
      const body = await req.json();
      targetCompanyId = body.company_id ?? null;
    }
  } catch {
    // No body — process all companies
  }

  // ── 1. Fetch Austin permits via Socrata ───────────────────
  console.log("Fetching Austin permits via Socrata API…");
  const rawPermits = await fetchSocrataPermits();
  console.log(`Socrata returned ${rawPermits.length} commercial permits`);

  if (rawPermits.length === 0) {
    const msg = "No permits returned from Socrata API";
    console.warn(msg);
    await sb.from("scrape_metadata").upsert(
      {
        key: "last_permit_fetch_austin",
        value: JSON.stringify({ warning: msg, timestamp: new Date().toISOString() }),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
    return new Response(
      JSON.stringify({ success: true, message: msg, total_inserted: 0 }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }

  // ── 2. Filter & parse permits ─────────────────────────────
  interface ParsedPermit {
    source_id: string;
    business_name: string;
    business_type: string;
    work_class: string;
    address: string;
    addr_key: string;
    lat: number | null;
    lng: number | null;
    valuation: number;
    area_sf: number;
    permit_metadata: Record<string, unknown>;
    date_issued: string | undefined;
  }

  const permits: ParsedPermit[] = [];

  for (const row of rawPermits) {
    const valuation = parseFloat(row.total_job_valuation as string || "0");
    if (valuation < DEFAULT_MIN_VALUATION) continue;

    const addr = ((row.original_address1 as string) || "").trim();
    const lat = parseFloat(row.latitude as string || "");
    const lng = parseFloat(row.longitude as string || "");
    const areaSf =
      parseFloat(row.total_new_add_sqft as string || "0") +
      parseFloat(row.total_existing_bldg_sqft as string || "0");

    // Build a stable source_id from address + issue_date + permittype
    const sourceId = `austin-${addressKey(addr)}-${row.issue_date || ""}-${row.permittype || ""}`.substring(0, 200);

    permits.push({
      source_id: sourceId,
      business_name: (row.applicant_org as string) || (row.contractor_company_name as string) || row.description as string || "Commercial Project",
      business_type: cleanPermitType(
        [row.permittype as string, row.work_class].filter(Boolean).join(" — "),
      ),
      work_class: row.work_class || "",
      address: addr ? `${addr}, Austin, TX` : "Austin, TX",
      addr_key: addressKey(addr),
      lat: !isNaN(lat) ? lat : null,
      lng: !isNaN(lng) ? lng : null,
      valuation,
      area_sf: areaSf,
      permit_metadata: {
        permit_type: row.permittype || null,
        permit_class: row.permit_class || null,
        permit_class_mapped: row.permit_class_mapped || null,
        work_class: row.work_class || null,
        description: row.description || null,
        declared_valuation: valuation,
        area_sf: areaSf,
        date_issued: row.issue_date || null,
        date_submitted: row.applieddate || null,
        status_current: row.status_current || null,
        primary_contact: (row.applicant_org as string) || (row.contractor_company_name as string) || null,
        city: "Austin",
      },
      date_issued: (row.issue_date as string) || undefined,
    });
  }
  console.log(`${permits.length} permits above $${DEFAULT_MIN_VALUATION}`);

  // ── 3. Group related permits by address ───────────────────
  const groups = new Map<string, ParsedPermit[]>();
  for (const p of permits) {
    if (!p.addr_key) {
      groups.set(p.source_id, [p]);
      continue;
    }
    const existing = groups.get(p.addr_key);
    if (existing) {
      existing.push(p);
    } else {
      groups.set(p.addr_key, [p]);
    }
  }

  const primaryPermits: ParsedPermit[] = [];
  for (const [, group] of groups) {
    group.sort((a, b) => b.valuation - a.valuation);
    const primary = group[0];
    if (group.length > 1) {
      (primary.permit_metadata as Record<string, unknown>).related_permits =
        group.slice(1).map((p) => ({
          source_id: p.source_id,
          permit_type: p.permit_metadata.permit_type,
          valuation: p.valuation,
        }));
      (primary.permit_metadata as Record<string, unknown>).related_count =
        group.length - 1;
    }
    primaryPermits.push(primary);
  }
  console.log(
    `${primaryPermits.length} primary permits after grouping (from ${permits.length} total)`,
  );

  // ── 4. Load target companies ──────────────────────────────
  let companiesQuery = sb
    .from("opportunity_settings")
    .select(
      "company_id, trades, center_lat, center_lng, radius_miles, permits_enabled, permit_min_valuation",
    );

  if (targetCompanyId) {
    companiesQuery = companiesQuery.eq("company_id", targetCompanyId);
  }

  const { data: settingsRows, error: settingsErr } = await companiesQuery;

  if (settingsErr) {
    console.error("Error loading opportunity_settings:", settingsErr.message);
    return new Response(
      JSON.stringify({ error: settingsErr.message }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }

  if (!settingsRows || settingsRows.length === 0) {
    return new Response(
      JSON.stringify({ success: true, message: "No companies found", inserted: 0 }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }

  const today = new Date().toISOString().split("T")[0];
  let totalInserted = 0;

  // ── 5. For each company, score & insert ───────────────────
  for (const settings of settingsRows) {
    const companyId = settings.company_id;
    const trades: string[] = settings.trades || [];
    const radiusMiles = settings.radius_miles ?? 50;
    const permitsEnabled = settings.permits_enabled ?? true;
    const minValuation = settings.permit_min_valuation ?? DEFAULT_MIN_VALUATION;
    const center: LatLng | null =
      settings.center_lat && settings.center_lng
        ? { lat: settings.center_lat, lng: settings.center_lng }
        : null;

    if (!permitsEnabled) {
      console.log(`Company ${companyId}: permits disabled, skipping`);
      continue;
    }

    // Load existing permit source_ids to dedup
    const { data: existing } = await sb
      .from("opportunities")
      .select("source_id")
      .eq("company_id", companyId)
      .eq("source", "permit")
      .not("source_id", "is", null);

    const seenIds = new Set(
      (existing ?? []).map((r: { source_id: string }) => r.source_id),
    );

    const rows: Record<string, unknown>[] = [];

    for (const permit of primaryPermits) {
      if (seenIds.has(permit.source_id)) continue;
      if (permit.valuation < minValuation) continue;

      let distMiles: number | null = null;
      if (center && permit.lat !== null && permit.lng !== null) {
        distMiles = parseFloat(
          distanceMiles(center, { lat: permit.lat, lng: permit.lng }).toFixed(1),
        );
        if (distMiles > radiusMiles) continue;
      }

      const tradeScore = scorePermitTradeAlignment(
        (permit.permit_metadata.permit_type as string) || permit.business_type,
        permit.work_class,
        trades,
      );
      const valueScore = scorePermitValue(permit.valuation);
      const distScore = distMiles !== null ? scorePermitDistance(distMiles) : 5;
      const recencyScore = scorePermitRecency(permit.date_issued);
      const totalScore = Math.min(
        100,
        tradeScore + valueScore + distScore + recencyScore,
      );

      if (totalScore < 30) continue;

      rows.push({
        company_id: companyId,
        card_type: "company",
        source: "permit",
        source_id: permit.source_id,
        business_name: permit.business_name,
        business_type: permit.business_type,
        business_category: "permit",
        address: permit.address,
        lat: permit.lat,
        lng: permit.lng,
        distance_miles: distMiles,
        phone: null,
        website: null,
        google_rating: null,
        google_reviews: null,
        match_score: totalScore,
        match_reason: buildPermitMatchReason(
          (permit.permit_metadata.permit_type as string) || permit.business_type,
          permit.valuation,
          distMiles,
          trades,
        ),
        permit_metadata: permit.permit_metadata,
        status: "new",
        shown_date: today,
        is_new: true,
      });
    }

    if (rows.length > 0) {
      for (let i = 0; i < rows.length; i += 100) {
        const batch = rows.slice(i, i + 100);
        const { data: inserted, error: insertErr } = await sb
          .from("opportunities")
          .insert(batch)
          .select("id");

        if (insertErr) {
          console.error(
            `Insert error for company ${companyId}:`,
            insertErr.message,
          );
        } else {
          totalInserted += inserted?.length ?? 0;
        }
      }
    }

    console.log(
      `Company ${companyId}: ${rows.length} Austin permit opportunities scored`,
    );
  }

  // ── 6. Log run to scrape_metadata ─────────────────────────
  const runSummary = {
    timestamp: new Date().toISOString(),
    socrata_rows: rawPermits.length,
    above_min_valuation: permits.length,
    primary_after_grouping: primaryPermits.length,
    companies_processed: settingsRows.length,
    total_inserted: totalInserted,
  };

  await sb
    .from("scrape_metadata")
    .upsert(
      {
        key: "last_permit_fetch_austin",
        value: JSON.stringify(runSummary),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );

  console.log("Austin run complete:", JSON.stringify(runSummary));

  return new Response(
    JSON.stringify({ success: true, ...runSummary }),
    { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
  );
});
