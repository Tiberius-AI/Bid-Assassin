/**
 * Edge Function: fetch-permits-sa
 *
 * Downloads the San Antonio open-data building-permits CSV, filters
 * for commercial permits above a value threshold, converts State Plane
 * coordinates to WGS-84, deduplicates against existing rows, groups
 * related permits by address, scores each permit against the company's
 * trades/location, and inserts new opportunity rows with source='permit'.
 *
 * POST body: { "company_id": "uuid" }
 *
 * Can also be called without a body by a cron job — in that case it
 * processes ALL companies that have opportunity_settings.
 *
 * Env vars (auto-injected by Supabase):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Papa from "https://esm.sh/papaparse@5.4.1";

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const SA_PERMITS_ISSUED_URL =
  "https://data.sanantonio.gov/dataset/05012dcb-ba1b-4ade-b5f3-7403bc7f52eb/resource/c21106f9-3ef5-4f3a-8604-f992b4db7512/download/permits_issued.csv";

const DEFAULT_MIN_VALUATION = 50_000;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ─────────────────────────────────────────────────────────────
// Permit type filters
// ─────────────────────────────────────────────────────────────

const COMMERCIAL_PREFIXES = [
  "COMM NEW BUILDING",
  "COMM REMODEL",
  "COMM ADDITION",
  "COMM IFO",
  "COMM SHELL",
  "COMM SITEWORK",
  "COMMERCIAL",
];

const EXCLUDE_TYPES = [
  "GARAGE SALE",
  "SOLAR",
  "SIGN PERMIT",
  "SIGN ",
];

function isCommercialPermit(permitType: string): boolean {
  const upper = permitType.toUpperCase();
  if (EXCLUDE_TYPES.some((ex) => upper.includes(ex))) return false;
  // Residential is excluded UNLESS high-value (handled at caller level)
  if (upper.startsWith("RES ") || upper.startsWith("RESIDENTIAL")) return false;
  return COMMERCIAL_PREFIXES.some((prefix) => upper.includes(prefix));
}

// ─────────────────────────────────────────────────────────────
// State Plane → WGS-84 conversion
// ─────────────────────────────────────────────────────────────
// San Antonio CSV uses Texas South Central State Plane (NAD83,
// EPSG:2278, US survey feet).  Rather than bundling proj4 in a
// Deno edge function we use the direct Lambert Conformal Conic
// inverse formulas (NAD83 / GRS-80 ellipsoid).
// ─────────────────────────────────────────────────────────────

const DEG = Math.PI / 180;
const A   = 6378137.0;                     // GRS-80 semi-major (meters)
const F   = 1 / 298.257222101;             // GRS-80 flattening
const E   = Math.sqrt(2 * F - F * F);      // eccentricity
const US_FT = 0.3048006096012192;          // 1 US survey foot in meters

// EPSG:2278 projection parameters
const LAT1 = 28.383333333333 * DEG;        // standard parallel 1
const LAT2 = 30.283333333333 * DEG;        // standard parallel 2
const LAT0 = 27.833333333333 * DEG;        // latitude of origin
const LON0 = -99.0 * DEG;                  // central meridian
const FE   = 600_000 * US_FT;              // false easting (m)
const FN   = 4_000_000 * US_FT;            // false northing (m)

function msfn(sinPhi: number, cosPhi: number, e: number): number {
  return cosPhi / Math.sqrt(1 - e * e * sinPhi * sinPhi);
}
function tsfn(phi: number, sinPhi: number, e: number): number {
  const eSinPhi = e * sinPhi;
  return (
    Math.tan(Math.PI / 4 - phi / 2) /
    Math.pow((1 - eSinPhi) / (1 + eSinPhi), e / 2)
  );
}

// Pre-compute LCC constants
const ms1 = msfn(Math.sin(LAT1), Math.cos(LAT1), E);
const ms2 = msfn(Math.sin(LAT2), Math.cos(LAT2), E);
const ts0 = tsfn(LAT0, Math.sin(LAT0), E);
const ts1 = tsfn(LAT1, Math.sin(LAT1), E);
const ts2 = tsfn(LAT2, Math.sin(LAT2), E);
const N   = (Math.log(ms1) - Math.log(ms2)) / (Math.log(ts1) - Math.log(ts2));
const F0  = ms1 / (N * Math.pow(ts1, N));
const RF0 = A * F0 * Math.pow(ts0, N);

/**
 * Convert Texas South Central State Plane (EPSG:2278, US feet)
 * to WGS-84 latitude / longitude.
 */
function statePlaneToLatLng(
  xFeet: number,
  yFeet: number,
): { lat: number; lng: number } | null {
  const xMeters = xFeet * US_FT;
  const yMeters = yFeet * US_FT;

  const dx = xMeters - FE;
  const dy = RF0 - (yMeters - FN);
  const rho = Math.sign(N) * Math.sqrt(dx * dx + dy * dy);
  const theta = Math.atan2(dx, dy);

  const ts = Math.pow(rho / (A * F0), 1 / N);

  // Iterative inverse for latitude (φ)
  let phi = Math.PI / 2 - 2 * Math.atan(ts);
  for (let i = 0; i < 15; i++) {
    const eSinPhi = E * Math.sin(phi);
    const phiNext =
      Math.PI / 2 -
      2 * Math.atan(ts * Math.pow((1 - eSinPhi) / (1 + eSinPhi), E / 2));
    if (Math.abs(phiNext - phi) < 1e-12) {
      phi = phiNext;
      break;
    }
    phi = phiNext;
  }

  const lng = (theta / N + LON0) / DEG;
  const lat = phi / DEG;

  // Sanity: should be roughly 27–31°N,  -104 to -93°W (Texas)
  if (lat < 25 || lat > 37 || lng < -107 || lng > -90) return null;

  return {
    lat: parseFloat(lat.toFixed(7)),
    lng: parseFloat(lng.toFixed(7)),
  };
}

// ─────────────────────────────────────────────────────────────
// Haversine distance (miles)
// ─────────────────────────────────────────────────────────────

interface LatLng {
  lat: number;
  lng: number;
}

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
// Permit-specific match scoring (per spec)
// ─────────────────────────────────────────────────────────────

function scorePermitTradeAlignment(
  permitType: string,
  userTrades: string[],
): number {
  const pt = permitType.toUpperCase();
  let best = 0;

  for (const trade of userTrades) {
    const t = trade.toLowerCase();
    let score = 0;

    // Direct trade-permit match (e.g., Electrical Permit + Electrical sub)
    if (
      (pt.includes("ELECTRICAL") && t.includes("electrical")) ||
      (pt.includes("MECHANICAL") && t.includes("mechanical")) ||
      (pt.includes("MECHANICAL") && t.includes("hvac")) ||
      (pt.includes("PLUMBING") && t.includes("plumbing")) ||
      (pt.includes("FIRE") && t.includes("fire"))
    ) {
      score = 40;
    }
    // New building — every trade needed
    else if (pt.includes("NEW BUILDING") || pt.includes("SHELL")) {
      score = 30;
    }
    // Remodel / addition — usually needs most trades
    else if (
      pt.includes("REMODEL") ||
      pt.includes("ADDITION") ||
      pt.includes("IFO") ||
      pt.includes("TENANT")
    ) {
      score = 20;
    }
    // Sitework
    else if (pt.includes("SITEWORK")) {
      score = ["concrete", "excavation", "grading", "paving", "utility"].some(
        (x) => t.includes(x),
      )
        ? 25
        : 10;
    }
    // Generic commercial
    else {
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
  const val = valuation >= 1_000_000
    ? `$${(valuation / 1_000_000).toFixed(1)}M`
    : `$${(valuation / 1_000).toFixed(0)}K`;
  const dist =
    distMiles !== null
      ? distMiles < 1
        ? "under 1mi"
        : `${distMiles.toFixed(1)}mi`
      : "unknown distance";

  const pt = permitType.toLowerCase();
  if (pt.includes("new building"))
    return `${val} new commercial build ${dist} away — will need ${trade} bids`;
  if (pt.includes("remodel") || pt.includes("ifo") || pt.includes("tenant"))
    return `${val} commercial remodel ${dist} away — potential ${trade} scope`;
  if (pt.includes("addition"))
    return `${val} commercial addition ${dist} away — likely needs ${trade}`;
  return `${val} commercial permit ${dist} away — potential ${trade} opportunity`;
}

// ─────────────────────────────────────────────────────────────
// CSV row interface
// ─────────────────────────────────────────────────────────────

interface PermitRow {
  "PERMIT TYPE": string;
  "PERMIT #": string;
  "PROJECT NAME": string;
  "WORK TYPE": string;
  ADDRESS: string;
  LOCATION: string;
  X_COORD: string;
  Y_COORD: string;
  "DATE SUBMITTED": string;
  "DATE ISSUED": string;
  "DECLARED VALUATION": string;
  "AREA (SF)": string;
  "PRIMARY CONTACT": string;
  CD: string;
  NCD: string;
  HD: string;
}

// ─────────────────────────────────────────────────────────────
// Parsing helpers
// ─────────────────────────────────────────────────────────────

function cleanAddress(raw: string): string {
  if (!raw) return "";
  // Remove "City of San Antonio, " prefix variants
  return raw
    .replace(/,?\s*City of San Antonio/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanPermitType(raw: string): string {
  return raw
    .replace(/\bComm\b/i, "Commercial")
    .replace(/\bIFO\b/i, "Interior Finish-Out")
    .replace(/\bPmt\b/i, "")
    .replace(/Permit$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanProjectName(
  projectName: string,
  primaryContact: string,
): string {
  // Often "Building No: N/A; Unit No: N/A" — useless
  if (
    !projectName ||
    projectName.includes("N/A") ||
    projectName.trim().length < 3
  ) {
    return primaryContact || "Commercial Project";
  }
  return projectName.trim();
}

/**
 * Normalize an address to a simple key for dedup grouping.
 * Strips unit/suite, lowercases, removes punctuation.
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
    // No body or invalid JSON — process all companies
  }

  // ── 1. Download & parse the SA permits CSV ────────────────
  console.log("Fetching San Antonio permits CSV…");
  const csvRes = await fetch(SA_PERMITS_ISSUED_URL);
  if (!csvRes.ok) {
    const msg = `CSV download failed: ${csvRes.status} ${csvRes.statusText}`;
    console.error(msg);

    // Log failure to scrape_metadata so we can detect it
    await sb
      .from("scrape_metadata")
      .upsert({
        key: "last_permit_fetch",
        value: JSON.stringify({ error: msg, timestamp: new Date().toISOString() }),
        updated_at: new Date().toISOString(),
      }, { onConflict: "key" });

    return new Response(
      JSON.stringify({ error: msg }),
      { status: 502, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }
  const csvText = await csvRes.text();
  console.log(`CSV downloaded: ${csvText.length} bytes`);

  const parsed = Papa.parse<PermitRow>(csvText, {
    header: true,
    skipEmptyLines: true,
  });
  console.log(`Parsed ${parsed.data.length} total rows`);

  // ── 2. Filter commercial permits ──────────────────────────
  const filtered = parsed.data.filter((row) => {
    if (!isCommercialPermit(row["PERMIT TYPE"] || "")) return false;
    const valuation = parseFloat(row["DECLARED VALUATION"] || "0");
    if (valuation < DEFAULT_MIN_VALUATION) return false;
    return true;
  });
  console.log(`${filtered.length} commercial permits above $${DEFAULT_MIN_VALUATION}`);

  // ── 3. Convert coordinates & build permit objects ─────────
  interface ParsedPermit {
    source_id: string;
    business_name: string;
    business_type: string;
    address: string;
    addr_key: string;
    lat: number | null;
    lng: number | null;
    valuation: number;
    area_sf: number;
    permit_metadata: Record<string, unknown>;
    date_submitted: string | undefined;
    date_issued: string | undefined;
  }

  const permits: ParsedPermit[] = [];

  for (const row of filtered) {
    const permitNumber = (row["PERMIT #"] || "").trim();
    if (!permitNumber) continue;

    const x = parseFloat(row.X_COORD || "");
    const y = parseFloat(row.Y_COORD || "");
    let coords: { lat: number; lng: number } | null = null;

    if (!isNaN(x) && !isNaN(y) && x !== 0 && y !== 0) {
      // State Plane coordinates are large numbers (> 180)
      if (Math.abs(x) > 180 || Math.abs(y) > 180) {
        coords = statePlaneToLatLng(x, y);
      } else {
        coords = { lat: y, lng: x };
      }
    }

    const valuation = parseFloat(row["DECLARED VALUATION"] || "0");
    const areaSf = parseFloat(row["AREA (SF)"] || "0");
    const addr = cleanAddress(row.ADDRESS || "");

    permits.push({
      source_id: permitNumber,
      business_name: cleanProjectName(row["PROJECT NAME"], row["PRIMARY CONTACT"]),
      business_type: cleanPermitType(row["PERMIT TYPE"]),
      address: addr,
      addr_key: addressKey(addr),
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      valuation,
      area_sf: areaSf,
      permit_metadata: {
        permit_number: permitNumber,
        permit_type: row["PERMIT TYPE"],
        work_type: row["WORK TYPE"],
        declared_valuation: valuation,
        area_sf: areaSf,
        primary_contact: row["PRIMARY CONTACT"],
        date_submitted: row["DATE SUBMITTED"] || null,
        date_issued: row["DATE ISSUED"] || null,
        council_district: row.CD || null,
      },
      date_submitted: row["DATE SUBMITTED"] || undefined,
      date_issued: row["DATE ISSUED"] || undefined,
    });
  }
  console.log(`${permits.length} permits with valid permit numbers`);

  // ── 4. Group related permits by address ───────────────────
  // Multiple trade permits (electrical, mechanical, plumbing) often
  // filed for the same project.  Keep the highest-valuation row as
  // the primary card and attach related permit numbers.
  const groups = new Map<string, ParsedPermit[]>();
  for (const p of permits) {
    if (!p.addr_key) {
      // No address — treat as standalone
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

  // Pick primary permit per group (highest valuation)
  const primaryPermits: ParsedPermit[] = [];
  for (const [, group] of groups) {
    group.sort((a, b) => b.valuation - a.valuation);
    const primary = group[0];
    if (group.length > 1) {
      (primary.permit_metadata as Record<string, unknown>).related_permits =
        group.slice(1).map((p) => ({
          permit_number: p.source_id,
          permit_type: p.permit_metadata.permit_type,
          valuation: p.valuation,
        }));
      (primary.permit_metadata as Record<string, unknown>).related_count =
        group.length - 1;
    }
    primaryPermits.push(primary);
  }
  console.log(
    `${primaryPermits.length} primary permits after address grouping (from ${permits.length} total)`,
  );

  // ── 5. Load target companies ──────────────────────────────
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
      JSON.stringify({ success: true, message: "No companies with opportunity_settings found", inserted: 0 }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }

  const today = new Date().toISOString().split("T")[0];
  let totalInserted = 0;

  // ── 6. For each company, score & insert ───────────────────
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

    // Skip if company has permits disabled
    if (!permitsEnabled) {
      console.log(`Company ${companyId}: permits disabled, skipping`);
      continue;
    }

    // Skip if geocoding hasn't run yet — without center we can't distance-filter
    if (!center) {
      console.log(`Company ${companyId}: center_lat/lng not set yet, skipping permits`);
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
      // Skip if already ingested
      if (seenIds.has(permit.source_id)) continue;

      // Skip if below this company's minimum valuation threshold
      if (permit.valuation < minValuation) continue;

      // Distance filter
      let distMiles: number | null = null;
      if (center && permit.lat !== null && permit.lng !== null) {
        distMiles = parseFloat(
          distanceMiles(center, { lat: permit.lat, lng: permit.lng }).toFixed(1),
        );
        if (distMiles > radiusMiles) continue;
      }

      // Score
      const tradeScore = scorePermitTradeAlignment(
        (permit.permit_metadata.permit_type as string) || permit.business_type,
        trades,
      );
      const valueScore = scorePermitValue(permit.valuation);
      const distScore =
        distMiles !== null ? scorePermitDistance(distMiles) : 5;
      const recencyScore = scorePermitRecency(
        permit.date_issued || permit.date_submitted,
      );
      const totalScore = Math.min(
        100,
        tradeScore + valueScore + distScore + recencyScore,
      );

      // Skip very low relevance
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
      // Insert in batches of 100 to avoid payload limits
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
      `Company ${companyId}: ${rows.length} permit opportunities scored, inserted`,
    );
  }

  // ── 7. Log run to scrape_metadata ─────────────────────────
  const runSummary = {
    timestamp: new Date().toISOString(),
    csv_rows: parsed.data.length,
    commercial_filtered: filtered.length,
    primary_after_grouping: primaryPermits.length,
    companies_processed: settingsRows.length,
    total_inserted: totalInserted,
  };

  await sb
    .from("scrape_metadata")
    .upsert({
      key: "last_permit_fetch",
      value: JSON.stringify(runSummary),
      updated_at: new Date().toISOString(),
    }, { onConflict: "key" });

  console.log("Run complete:", JSON.stringify(runSummary));

  return new Response(
    JSON.stringify({ success: true, ...runSummary }),
    { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
  );
});
