/**
 * useSanAntonioPermits
 *
 * Client-side hook that fetches commercial building permits from the San
 * Antonio open-data CSV, parses with PapaParse, converts State Plane
 * coordinates (EPSG:2278) to WGS-84, scores against company profile, and
 * returns DbOpportunity objects for merging into the Opportunities feed.
 *
 * Results are cached in localStorage for 24 hours per company.
 */

import { useState, useEffect, useCallback } from "react";
import Papa from "papaparse";
import type { DbOpportunity, OpportunitySettings } from "./useOpportunities";

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const SA_CSV_URL =
  "https://data.sanantonio.gov/dataset/05012dcb-ba1b-4ade-b5f3-7403bc7f52eb/resource/c21106f9-3ef5-4f3a-8604-f992b4db7512/download/permits_issued.csv";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const DEFAULT_MIN_VALUATION = 50_000;

// ─────────────────────────────────────────────────────────────
// CSV row shape (actual SA column headers)
// ─────────────────────────────────────────────────────────────

interface SaPermitRow {
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
  [key: string]: string;
}

// ─────────────────────────────────────────────────────────────
// State Plane → WGS-84 (EPSG:2278, Texas South Central, NAD83)
// Lambert Conformal Conic inverse — no external projection lib needed
// ─────────────────────────────────────────────────────────────

const DEG   = Math.PI / 180;
const A_GRS = 6378137.0;
const F_GRS = 1 / 298.257222101;
const E_GRS = Math.sqrt(2 * F_GRS - F_GRS * F_GRS);
const US_FT = 0.3048006096012192;

const LAT1 = 28.383333333333 * DEG;
const LAT2 = 30.283333333333 * DEG;
const LAT0 = 27.833333333333 * DEG;
const LON0 = -99.0 * DEG;
const FE   = 600_000 * US_FT;
const FN   = 4_000_000 * US_FT;

function msfn(sinP: number, cosP: number, e: number) {
  return cosP / Math.sqrt(1 - e * e * sinP * sinP);
}
function tsfn(phi: number, sinP: number, e: number) {
  const eS = e * sinP;
  return Math.tan(Math.PI / 4 - phi / 2) / Math.pow((1 - eS) / (1 + eS), e / 2);
}

const ms1 = msfn(Math.sin(LAT1), Math.cos(LAT1), E_GRS);
const ms2 = msfn(Math.sin(LAT2), Math.cos(LAT2), E_GRS);
const ts0 = tsfn(LAT0, Math.sin(LAT0), E_GRS);
const ts1 = tsfn(LAT1, Math.sin(LAT1), E_GRS);
const ts2 = tsfn(LAT2, Math.sin(LAT2), E_GRS);
const N_   = (Math.log(ms1) - Math.log(ms2)) / (Math.log(ts1) - Math.log(ts2));
const F0_  = ms1 / (N_ * Math.pow(ts1, N_));
const RF0_ = A_GRS * F0_ * Math.pow(ts0, N_);

function statePlaneToLatLng(xFeet: number, yFeet: number): { lat: number; lng: number } | null {
  const xM = xFeet * US_FT;
  const yM = yFeet * US_FT;
  const dx = xM - FE;
  const dy = RF0_ - (yM - FN);
  const rho = Math.sign(N_) * Math.sqrt(dx * dx + dy * dy);
  const theta = Math.atan2(dx, dy);
  const ts = Math.pow(rho / (A_GRS * F0_), 1 / N_);
  let phi = Math.PI / 2 - 2 * Math.atan(ts);
  for (let i = 0; i < 15; i++) {
    const eS = E_GRS * Math.sin(phi);
    const next = Math.PI / 2 - 2 * Math.atan(ts * Math.pow((1 - eS) / (1 + eS), E_GRS / 2));
    if (Math.abs(next - phi) < 1e-12) { phi = next; break; }
    phi = next;
  }
  const lat = phi / DEG;
  const lng = (theta / N_ + LON0) / DEG;
  if (lat < 25 || lat > 37 || lng < -107 || lng > -90) return null;
  return { lat: parseFloat(lat.toFixed(7)), lng: parseFloat(lng.toFixed(7)) };
}

// ─────────────────────────────────────────────────────────────
// Permit type filtering
// ─────────────────────────────────────────────────────────────

const COMMERCIAL_PREFIXES = [
  "COMM NEW BUILDING", "COMM REMODEL", "COMM ADDITION",
  "COMM IFO", "COMM SHELL", "COMM SITEWORK", "COMMERCIAL",
];
const EXCLUDE_TYPES = ["GARAGE SALE", "SOLAR", "SIGN PERMIT", "SIGN "];

function isCommercial(permitType: string): boolean {
  const u = permitType.toUpperCase();
  if (EXCLUDE_TYPES.some((x) => u.includes(x))) return false;
  if (u.startsWith("RES ") || u.startsWith("RESIDENTIAL")) return false;
  return COMMERCIAL_PREFIXES.some((p) => u.includes(p));
}

// ─────────────────────────────────────────────────────────────
// Scoring
// ─────────────────────────────────────────────────────────────

function scoreTradeAlignment(permitType: string, trades: string[]): number {
  const pt = permitType.toUpperCase();
  let best = 0;
  for (const trade of trades) {
    const t = trade.toLowerCase();
    let s = 10;
    if (
      (pt.includes("ELECTRICAL") && t.includes("electrical")) ||
      (pt.includes("MECHANICAL") && (t.includes("mechanical") || t.includes("hvac"))) ||
      (pt.includes("PLUMBING") && t.includes("plumbing")) ||
      (pt.includes("FIRE") && t.includes("fire"))
    ) { s = 40; }
    else if (pt.includes("NEW BUILDING") || pt.includes("SHELL")) { s = 30; }
    else if (pt.includes("REMODEL") || pt.includes("ADDITION") || pt.includes("IFO") || pt.includes("TENANT")) { s = 20; }
    else if (pt.includes("SITEWORK")) {
      s = ["concrete","excavation","grading","paving","utility"].some((x) => t.includes(x)) ? 25 : 10;
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

function scoreRecency(dateStr: string): number {
  if (!dateStr) return 3;
  const days = (Date.now() - new Date(dateStr).getTime()) / 86_400_000;
  if (days <= 7)  return 15;
  if (days <= 30) return 12;
  if (days <= 90) return 8;
  return 3;
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

function matchReason(permitType: string, valuation: number, distMiles: number | null, trades: string[]): string {
  const trade = trades[0] || "your trade";
  const val = valuation >= 1_000_000
    ? `$${(valuation / 1_000_000).toFixed(1)}M`
    : `$${(valuation / 1_000).toFixed(0)}K`;
  const dist = distMiles === null ? "San Antonio area"
    : distMiles < 1 ? "under 1mi away" : `${distMiles.toFixed(1)}mi away`;
  const pt = permitType.toLowerCase();
  if (pt.includes("new building"))
    return `${val} new commercial build ${dist} — will need ${trade} bids`;
  if (pt.includes("remodel") || pt.includes("ifo") || pt.includes("tenant"))
    return `${val} commercial remodel ${dist} — potential ${trade} scope`;
  if (pt.includes("addition"))
    return `${val} commercial addition ${dist} — likely needs ${trade}`;
  if (pt.includes("electrical") || pt.includes("mechanical") || pt.includes("plumbing"))
    return `${val} ${permitType} permit ${dist} — direct ${trade} opportunity`;
  return `${val} commercial permit ${dist} — potential ${trade} opportunity`;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function addrKey(raw: string): string {
  return raw.toLowerCase()
    .replace(/,?\s*city of san antonio/i, "")
    .replace(/\b(suite|ste|unit|apt|#)\s*\S+/gi, "")
    .replace(/[^a-z0-9 ]/g, "")
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

function cleanProjectName(name: string, contact: string): string {
  if (!name || name.includes("N/A") || name.trim().length < 3) return contact || "Commercial Project";
  return name.trim();
}

// ─────────────────────────────────────────────────────────────
// Score + shape CSV rows into DbOpportunity objects
// ─────────────────────────────────────────────────────────────

function scoreAndShape(
  rows: SaPermitRow[],
  companyId: string,
  settings: OpportunitySettings,
  today: string,
): DbOpportunity[] {
  const { center_lat, center_lng, radius_miles, trades, permit_min_valuation } = settings;
  const minVal = permit_min_valuation ?? DEFAULT_MIN_VALUATION;
  const radius = radius_miles ?? 50;

  // Filter to commercial above min value
  const commercial = rows.filter((row) => {
    if (!isCommercial(row["PERMIT TYPE"] || "")) return false;
    const v = parseFloat(row["DECLARED VALUATION"] || "0");
    return v >= minVal;
  });

  // Group by address key, keep highest-value permit per address
  const groups = new Map<string, SaPermitRow>();
  for (const row of commercial) {
    const key = addrKey(row.ADDRESS || "") || `${row["DATE ISSUED"]}${row["PERMIT #"]}`;
    const existing = groups.get(key);
    const v = parseFloat(row["DECLARED VALUATION"] || "0");
    if (!existing || parseFloat(existing["DECLARED VALUATION"] || "0") < v) {
      groups.set(key, row);
    }
  }

  const result: DbOpportunity[] = [];

  for (const row of groups.values()) {
    const valuation = parseFloat(row["DECLARED VALUATION"] || "0");
    const xFeet = parseFloat(row.X_COORD || "");
    const yFeet = parseFloat(row.Y_COORD || "");
    const coords = !isNaN(xFeet) && !isNaN(yFeet) && xFeet > 0 && yFeet > 0
      ? statePlaneToLatLng(xFeet, yFeet)
      : null;

    // Require a known company center — never show permits when location is unset
    if (!center_lat || !center_lng) continue;

    let distMiles: number | null = null;
    if (coords) {
      distMiles = parseFloat(haversine(center_lat, center_lng, coords.lat, coords.lng).toFixed(1));
      if (distMiles > radius) continue;
    } else {
      continue;
    }

    const rawPermitType = row["PERMIT TYPE"] || "Commercial Permit";
    const permitType = cleanPermitType(rawPermitType);
    const tradeScore = scoreTradeAlignment(rawPermitType, trades);
    const total = Math.min(100,
      tradeScore +
      scoreValue(valuation) +
      (distMiles !== null ? scoreDistance(distMiles) : 5) +
      scoreRecency(row["DATE ISSUED"]),
    );
    if (total < 30) continue;

    const addr = row.ADDRESS?.replace(/,?\s*City of San Antonio/i, "").trim() || "";
    const contact = row["PRIMARY CONTACT"] || "";
    const sourceId = `sa-${addrKey(addr)}-${(row["DATE ISSUED"] || "").substring(0, 10)}-${row["PERMIT #"] || ""}`.substring(0, 200);

    result.push({
      id: `local-sa-${sourceId}`,
      company_id: companyId,
      card_type: "company",
      source: "permit",
      source_id: sourceId,
      status: "new",
      match_score: total,
      match_reason: matchReason(permitType, valuation, distMiles, trades),
      is_new: true,
      shown_date: today,
      business_name: cleanProjectName(row["PROJECT NAME"] || "", contact),
      business_type: permitType,
      business_category: "permit",
      address: addr ? `${addr}, San Antonio, TX` : "San Antonio, TX",
      distance_miles: distMiles,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
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
        permit_number: row["PERMIT #"] || "",
        permit_type: permitType,
        work_type: row["WORK TYPE"] || null,
        declared_valuation: valuation,
        area_sf: parseFloat(row["AREA (SF)"] || "0"),
        primary_contact: contact || null,
        date_submitted: row["DATE SUBMITTED"] || null,
        date_issued: row["DATE ISSUED"] || null,
        council_district: row.CD || null,
        city: "San Antonio",
      },
    } as DbOpportunity);
  }

  return result.sort((a, b) => b.match_score - a.match_score);
}

// ─────────────────────────────────────────────────────────────
// localStorage cache helpers
// ─────────────────────────────────────────────────────────────

function cacheKey(companyId: string, today: string, centerLat: number | null, centerLng: number | null) {
  // Include center coords so stale empty cache is invalidated when geocoding completes
  const lat = centerLat != null ? centerLat.toFixed(2) : "0";
  const lng = centerLng != null ? centerLng.toFixed(2) : "0";
  return `sa_permits_${companyId}_${today}_${lat}_${lng}`;
}

function readCache(key: string): DbOpportunity[] | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL_MS) { localStorage.removeItem(key); return null; }
    return data as DbOpportunity[];
  } catch { return null; }
}

function writeCache(key: string, data: DbOpportunity[]) {
  try {
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
  } catch { /* quota exceeded */ }
}

// ─────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────

export function useSanAntonioPermits(
  companyId: string | undefined,
  settings: OpportunitySettings | null,
) {
  const [permits, setPermits] = useState<DbOpportunity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const today = new Date().toISOString().split("T")[0];

  const load = useCallback(async (force = false) => {
    console.log("[useSanAntonioPermits] load called — companyId:", companyId, "settings:", settings ? "loaded" : "null");
    if (!companyId || !settings) return;
    if (!settings.permits_enabled) { setPermits([]); return; }

    const key = cacheKey(companyId, today, settings.center_lat, settings.center_lng);
    if (!force) {
      const cached = readCache(key);
      if (cached) { setPermits(cached); return; }
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(SA_CSV_URL);
      if (!res.ok) throw new Error(`CSV download failed: ${res.status}`);
      const csvText = await res.text();
      console.log(`[useSanAntonioPermits] CSV downloaded: ${csvText.length} bytes`);

      const parsed = Papa.parse<SaPermitRow>(csvText, { header: true, skipEmptyLines: true });
      console.log(`[useSanAntonioPermits] Parsed ${parsed.data.length} rows`);

      const scored = scoreAndShape(parsed.data, companyId, settings, today);
      console.log(`[useSanAntonioPermits] ${scored.length} permits after scoring/filtering`);

      writeCache(key, scored);
      setPermits(scored);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to fetch SA permits";
      console.error("useSanAntonioPermits:", msg);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [companyId, settings, today]);

  useEffect(() => { load(false); }, [load]);

  return { permits, loading, error, refresh: () => load(true) };
}
