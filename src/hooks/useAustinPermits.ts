/**
 * useAustinPermits
 *
 * Client-side hook that fetches commercial building permits directly from the
 * Austin open-data Socrata API (no edge function required). Results are cached
 * in localStorage for 24 hours per company.
 *
 * Returns permit rows shaped as DbOpportunity objects so they can be merged
 * with the existing opportunities list in the Opportunities page.
 */

import { useState, useEffect, useCallback } from "react";
import type { DbOpportunity, OpportunitySettings } from "./useOpportunities";

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const SOCRATA_URL = "https://data.austintexas.gov/resource/3syk-w9eu.json";
const PAGE_SIZE = 1000;
const MAX_ROWS = 5000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const DEFAULT_MIN_VALUATION = 50_000;

// ─────────────────────────────────────────────────────────────
// Socrata row shape (actual field names from probe)
// ─────────────────────────────────────────────────────────────

interface SocrataRow {
  permittype?: string;
  permit_type_desc?: string;
  permit_class?: string;
  permit_class_mapped?: string;
  work_class?: string;
  description?: string;
  issue_date?: string;
  applieddate?: string;
  status_current?: string;
  original_address1?: string;
  latitude?: string;
  longitude?: string;
  total_existing_bldg_sqft?: string;
  total_new_add_sqft?: string;
  total_job_valuation?: string;
  contractor_company_name?: string;
  applicant_org?: string;
  permit_number?: string;
  council_district?: string;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function haversine(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

function scoreTradeAlignment(permitType: string, workClass: string, trades: string[]): number {
  const pt = `${permitType} ${workClass}`.toUpperCase();
  let best = 0;
  for (const trade of trades) {
    const t = trade.toLowerCase();
    let s = 10;
    if ((pt.includes("ELECTRICAL") && t.includes("electrical")) ||
        (pt.includes("MECHANICAL") && (t.includes("mechanical") || t.includes("hvac"))) ||
        (pt.includes("PLUMBING") && t.includes("plumbing")) ||
        (pt.includes("FIRE") && t.includes("fire"))) {
      s = 40;
    } else if (pt.includes("NEW") || pt.includes("SHELL")) {
      s = 30;
    } else if (pt.includes("REMODEL") || pt.includes("ADDITION") || pt.includes("INTERIOR") || pt.includes("TENANT")) {
      s = 20;
    } else if (pt.includes("SITE")) {
      s = ["concrete", "excavation", "grading", "paving", "utility"].some((x) => t.includes(x)) ? 25 : 10;
    }
    best = Math.max(best, s);
  }
  return best;
}

function scoreValue(v: number): number {
  if (v >= 1_000_000) return 25;
  if (v >= 500_000)   return 20;
  if (v >= 200_000)   return 15;
  if (v >= 100_000)   return 10;
  return 5;
}

function scoreDistance(miles: number): number {
  if (miles <= 10) return 20;
  if (miles <= 25) return 15;
  if (miles <= 50) return 10;
  return 5;
}

function scoreRecency(dateStr: string | undefined): number {
  if (!dateStr) return 3;
  const days = (Date.now() - new Date(dateStr).getTime()) / 86_400_000;
  if (days <= 7)  return 15;
  if (days <= 30) return 12;
  if (days <= 90) return 8;
  return 3;
}

function matchReason(permitType: string, valuation: number, distMiles: number | null, trades: string[]): string {
  const trade = trades[0] || "your trade";
  const val = valuation >= 1_000_000
    ? `$${(valuation / 1_000_000).toFixed(1)}M`
    : `$${(valuation / 1_000).toFixed(0)}K`;
  const dist = distMiles === null ? "Austin area"
    : distMiles < 1 ? "under 1mi away"
    : `${distMiles.toFixed(1)}mi away`;
  const pt = permitType.toLowerCase();
  if (pt.includes("new") || pt.includes("shell"))
    return `${val} new commercial build in Austin ${dist} — will need ${trade} bids`;
  if (pt.includes("remodel") || pt.includes("interior") || pt.includes("tenant"))
    return `${val} commercial remodel in Austin ${dist} — potential ${trade} scope`;
  if (pt.includes("addition"))
    return `${val} commercial addition in Austin ${dist} — likely needs ${trade}`;
  if (pt.includes("electrical") || pt.includes("mechanical") || pt.includes("plumbing"))
    return `${val} ${permitType} permit in Austin ${dist} — direct ${trade} opportunity`;
  return `${val} commercial permit in Austin ${dist} — potential ${trade} opportunity`;
}

function addrKey(raw: string): string {
  return raw.toLowerCase()
    .replace(/\b(suite|ste|unit|apt|#)\s*\S+/gi, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ─────────────────────────────────────────────────────────────
// Socrata fetch (paginated, commercial only, last 180 days)
// ─────────────────────────────────────────────────────────────

async function fetchFromSocrata(): Promise<SocrataRow[]> {
  const cutoff = new Date(Date.now() - 180 * 86_400_000).toISOString().split("T")[0];
  const where = encodeURIComponent(
    `issue_date > '${cutoff}' AND permit_class_mapped = 'Commercial'`,
  );

  const all: SocrataRow[] = [];
  let offset = 0;

  while (offset < MAX_ROWS) {
    const url = `${SOCRATA_URL}?$where=${where}&$limit=${PAGE_SIZE}&$offset=${offset}&$order=issue_date DESC`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      console.error(`Austin Socrata error ${res.status}:`, await res.text());
      break;
    }
    const page: SocrataRow[] = await res.json();
    if (page.length === 0) break;
    all.push(...page);
    offset += PAGE_SIZE;
    if (page.length < PAGE_SIZE) break; // last page
  }

  return all;
}

// ─────────────────────────────────────────────────────────────
// Score + shape rows into DbOpportunity objects
// ─────────────────────────────────────────────────────────────

function scoreAndShape(
  rows: SocrataRow[],
  _companyId: string,
  settings: OpportunitySettings,
  today: string,
): DbOpportunity[] {
  const { center_lat, center_lng, radius_miles, trades, permit_min_valuation } = settings;
  const minVal = permit_min_valuation ?? DEFAULT_MIN_VALUATION;
  const radius = radius_miles ?? 50;

  // Group by address key, keep highest valuation per address
  const groups = new Map<string, SocrataRow>();
  for (const row of rows) {
    const valuation = parseFloat(row.total_job_valuation ?? "0");
    if (valuation < minVal) continue;
    const key = addrKey(row.original_address1 ?? "");
    const existing = groups.get(key);
    if (!existing || parseFloat(existing.total_job_valuation ?? "0") < valuation) {
      groups.set(key || `${row.issue_date ?? ""}${row.permittype ?? ""}`, row);
    }
  }

  const result: DbOpportunity[] = [];

  for (const row of groups.values()) {
    const valuation = parseFloat(row.total_job_valuation ?? "0");
    const lat = parseFloat(row.latitude ?? "");
    const lng = parseFloat(row.longitude ?? "");
    const hasCoords = !isNaN(lat) && !isNaN(lng);

    let distMiles: number | null = null;
    if (hasCoords && center_lat && center_lng) {
      distMiles = parseFloat(haversine(center_lat, center_lng, lat, lng).toFixed(1));
      if (distMiles > radius) continue;
    }

    const permitType = row.permit_type_desc ?? row.permittype ?? "Commercial Permit";
    const workClass = row.work_class ?? "";
    const tradeScore = scoreTradeAlignment(permitType, workClass, trades);
    const total = Math.min(100,
      tradeScore + scoreValue(valuation) +
      (distMiles !== null ? scoreDistance(distMiles) : 5) +
      scoreRecency(row.issue_date),
    );
    if (total < 30) continue;

    const addr = row.original_address1 ?? "";
    const sourceId = `austin-${addrKey(addr)}-${(row.issue_date ?? "").substring(0, 10)}-${row.permittype ?? ""}`.substring(0, 200);

    result.push({
      id: `local-austin-${sourceId}`,
      card_type: "company",
      source: "permit",
      source_id: sourceId,
      status: "new",
      match_score: total,
      match_reason: matchReason(permitType, valuation, distMiles, trades),
      is_new: true,
      shown_date: today,
      business_name: row.applicant_org ?? row.contractor_company_name ?? row.description ?? "Commercial Project",
      business_type: [permitType, workClass].filter(Boolean).join(" — "),
      business_category: "permit",
      address: addr ? `${addr}, Austin, TX` : "Austin, TX",
      distance_miles: distMiles,
      phone: null,
      website: null,
      google_rating: null,
      google_reviews: null,
      person_name: null,
      person_title: null,
      person_company: null,
      linkedin_url: null,
      person_location: null,
      permit_metadata: {
        permit_number: row.permit_number ?? "",
        permit_type: permitType,
        work_type: workClass || null,
        declared_valuation: valuation,
        area_sf:
          parseFloat(row.total_new_add_sqft ?? "0") +
          parseFloat(row.total_existing_bldg_sqft ?? "0"),
        primary_contact: row.applicant_org ?? row.contractor_company_name ?? null,
        date_submitted: row.applieddate ?? null,
        date_issued: row.issue_date ?? null,
        council_district: row.council_district ?? null,
        city: "Austin",
      },
    } as DbOpportunity);
  }

  // Sort by score descending
  return result.sort((a, b) => b.match_score - a.match_score);
}

// ─────────────────────────────────────────────────────────────
// localStorage cache helpers
// ─────────────────────────────────────────────────────────────

function cacheKey(companyId: string, today: string) {
  return `austin_permits_${companyId}_${today}`;
}

function readCache(key: string): DbOpportunity[] | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return data as DbOpportunity[];
  } catch {
    return null;
  }
}

function writeCache(key: string, data: DbOpportunity[]) {
  try {
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
  } catch {
    // Quota exceeded — skip caching
  }
}

// ─────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────

export function useAustinPermits(
  companyId: string | undefined,
  settings: OpportunitySettings | null,
) {
  const [permits, setPermits]   = useState<DbOpportunity[]>([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const today = new Date().toISOString().split("T")[0];

  const load = useCallback(async (force = false) => {
    console.log("[useAustinPermits] load called — companyId:", companyId, "settings:", settings ? "loaded" : "null");
    if (!companyId || !settings) return;
    if (!settings.permits_enabled) {
      console.log("[useAustinPermits] permits_enabled=false, skipping");
      setPermits([]); return;
    }

    const key = cacheKey(companyId, today);

    if (!force) {
      const cached = readCache(key);
      if (cached) { setPermits(cached); return; }
    }

    setLoading(true);
    setError(null);

    try {
      const rows = await fetchFromSocrata();
      console.log(`[useAustinPermits] Socrata returned ${rows.length} raw rows`);
      const scored = scoreAndShape(rows, companyId, settings, today);
      console.log(`[useAustinPermits] ${scored.length} permits after scoring/filtering`);
      writeCache(key, scored);
      setPermits(scored);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to fetch Austin permits";
      console.error("useAustinPermits:", msg);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [companyId, settings, today]);

  useEffect(() => {
    load(false);
  }, [load]);

  return { permits, loading, error, refresh: () => load(true) };
}
