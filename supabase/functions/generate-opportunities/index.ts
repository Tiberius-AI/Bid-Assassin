/**
 * Edge Function: generate-opportunities
 *
 * For a given company_id:
 *  1. Loads company city/state/trades from Supabase
 *  2. Gets or creates opportunity_settings (rotation_index, radius, lat/lng)
 *  3. Geocodes city+state → lat/lng if not yet stored
 *  4. Determines today's rotation category (day-of-week cycling)
 *  5. Calls Google Places API (new) for company cards
 *  6. Calls Google Custom Search API for LinkedIn person cards
 *  7. Scores results (trade alignment + distance + quality signals)
 *  8. Deduplicates against last 30 days of shown opportunities
 *  9. Upserts new rows to opportunities table
 * 10. Increments rotation_index
 *
 * POST body: { "company_id": "uuid", "force_refresh": true }
 *
 * Env vars:
 *   GOOGLE_PLACES_API_KEY      — Google Cloud key with Places API (new) enabled
 *   GOOGLE_SEARCH_API_KEY      — Google Cloud key with Custom Search API enabled
 *   GOOGLE_SEARCH_ENGINE_ID    — Custom Search Engine ID (cx)
 *   SUPABASE_URL               — auto-injected
 *   SUPABASE_SERVICE_ROLE_KEY  — auto-injected
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const PLACES_URL  = "https://places.googleapis.com/v1/places:searchText";
const SEARCH_URL  = "https://www.googleapis.com/customsearch/v1";
const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";

const MILES_TO_METERS = 1609.34;
const TARGET_COMPANY_COUNT = 12;
const TARGET_PERSON_COUNT  = 5;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Mon=0 … Sun=6  (aligned to JS getDay() where Mon=1, adjusted below)
const ROTATION = [
  { company: "general contractor commercial construction",          people: "construction project manager" },
  { company: "property management company commercial",              people: "facilities director facilities manager" },
  { company: "commercial real estate developer medical office",     people: "development project manager" },
  { company: "school district church nonprofit institution",        people: "superintendent maintenance director" },
  { company: "hotel restaurant retail commercial property",         people: "property manager facility manager" },
  { company: "facility maintenance company self storage industrial",people: "construction estimator procurement" },
  { company: "HOA management auto dealer mixed commercial",         people: "VP construction operations director" },
];

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface LatLng { lat: number; lng: number }

interface PlacesResult {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  rating?: number;
  userRatingCount?: number;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  primaryType?: string;
}

interface SearchResult {
  link: string;
  title: string;
  snippet?: string;
}

interface NewOpportunity {
  company_id: string;
  card_type: "company" | "person";
  source: string;
  source_id: string;
  business_name?: string;
  business_type?: string;
  business_category?: string;
  address?: string;
  lat?: number;
  lng?: number;
  distance_miles?: number;
  phone?: string;
  website?: string;
  google_rating?: number;
  google_reviews?: number;
  person_name?: string;
  person_title?: string;
  person_company?: string;
  linkedin_url?: string;
  person_location?: string;
  match_score: number;
  match_reason: string;
  status: "new";
  shown_date: string;
  is_new: boolean;
}

// ─────────────────────────────────────────────────────────────
// Geocoding
// ─────────────────────────────────────────────────────────────

async function geocode(city: string, state: string, apiKey: string): Promise<LatLng | null> {
  const address = encodeURIComponent(`${city}, ${state}`);
  const res = await fetch(`${GEOCODE_URL}?address=${address}&key=${apiKey}`);
  if (!res.ok) {
    const text = await res.text();
    console.error(`Geocode HTTP error ${res.status}:`, text.substring(0, 200));
    return null;
  }
  const data = await res.json();
  if (data.status !== "OK") {
    console.error(`Geocode API status: ${data.status}`, data.error_message ?? "");
    return null;
  }
  const loc = data?.results?.[0]?.geometry?.location;
  if (!loc) return null;
  return { lat: loc.lat, lng: loc.lng };
}

// ─────────────────────────────────────────────────────────────
// Distance (haversine, miles)
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
// Match scoring
// ─────────────────────────────────────────────────────────────

function scoreTradeAlignment(businessType: string, userTrades: string[]): number {
  const bt = businessType.toLowerCase();
  let best = 0;

  for (const trade of userTrades) {
    const t = trade.toLowerCase();
    let score = 0;

    if (bt.includes("general contractor") || bt.includes("construction_company") || bt.includes("construction company")) {
      score = 40;
    } else if (bt.includes("property management") || bt.includes("property_management")) {
      score = ["electrical", "plumbing", "hvac", "mechanical", "painting", "flooring", "janitorial", "landscaping", "pest"].some((x) => t.includes(x)) ? 35 : 22;
    } else if (bt.includes("developer") || bt.includes("real_estate_developer") || bt.includes("real estate")) {
      score = 32;
    } else if (bt.includes("school") || bt.includes("district") || bt.includes("university") || bt.includes("college")) {
      score = 28;
    } else if (bt.includes("hospital") || bt.includes("medical") || bt.includes("clinic") || bt.includes("health")) {
      score = ["electrical", "plumbing", "hvac", "mechanical"].some((x) => t.includes(x)) ? 32 : 22;
    } else if (bt.includes("hotel") || bt.includes("lodging") || bt.includes("resort")) {
      score = ["electrical", "plumbing", "hvac", "painting"].some((x) => t.includes(x)) ? 28 : 18;
    } else if (bt.includes("restaurant") || bt.includes("food") || bt.includes("bakery")) {
      score = ["electrical", "plumbing", "hvac"].some((x) => t.includes(x)) ? 22 : 12;
    } else if (bt.includes("retail") || bt.includes("shopping") || bt.includes("store")) {
      score = 18;
    } else if (bt.includes("facility") || bt.includes("maintenance") || bt.includes("storage")) {
      score = 30;
    } else if (bt.includes("church") || bt.includes("religious") || bt.includes("nonprofit")) {
      score = 24;
    } else if (bt.includes("auto") || bt.includes("car_dealer") || bt.includes("dealership")) {
      score = ["electrical", "plumbing", "hvac"].some((x) => t.includes(x)) ? 18 : 10;
    } else {
      score = 12;
    }
    best = Math.max(best, score);
  }
  return best;
}

function scoreDistance(miles: number): number {
  if (miles <= 10) return 30;
  if (miles <= 25) return 22;
  if (miles <= 50) return 14;
  if (miles <= 80) return 10;
  return 5;
}

function scoreQuality(rating?: number, reviews?: number, hasPhone?: boolean, hasWebsite?: boolean): number {
  let s = 0;
  if (hasWebsite) s += 5;
  if (hasPhone)   s += 5;
  if (rating && rating >= 4.0) s += 5;
  if (reviews && reviews >= 20) s += 5;
  return s;
}

function buildMatchReason(
  businessType: string,
  distMiles: number,
  userTrades: string[],
  cardType: "company" | "person",
  personTitle?: string,
): string {
  const trade = userTrades[0] || "your trade";
  if (cardType === "person" && personTitle) {
    return `${personTitle} — decision-maker for ${trade} subcontractor selection`;
  }
  const bt = businessType.toLowerCase();
  const dist = distMiles < 1 ? "under 1mi" : `${distMiles.toFixed(1)}mi`;
  if (bt.includes("general contractor") || bt.includes("construction"))
    return `GC within ${dist} — high demand for ${trade} subs on commercial builds`;
  if (bt.includes("property management"))
    return `Property manager within ${dist} — ongoing ${trade} maintenance contracts`;
  if (bt.includes("developer"))
    return `Active developer within ${dist} — bids out ${trade} on all projects`;
  if (bt.includes("school") || bt.includes("district"))
    return `Institution within ${dist} — capital improvement projects need ${trade} bids`;
  if (bt.includes("hospital") || bt.includes("medical"))
    return `Medical facility within ${dist} — regular ${trade} upgrades and service contracts`;
  if (bt.includes("hotel"))
    return `Hotel within ${dist} — facility upgrades use local ${trade} contractors`;
  return `${businessType} within ${dist} — potential ${trade} subcontractor opportunity`;
}

// ─────────────────────────────────────────────────────────────
// Google Places API call
// ─────────────────────────────────────────────────────────────

async function fetchPlaces(
  query: string,
  center: LatLng,
  radiusMiles: number,
  apiKey: string,
): Promise<PlacesResult[]> {
  const body = {
    textQuery: query,
    locationBias: {
      circle: {
        center: { latitude: center.lat, longitude: center.lng },
        radius: Math.min(radiusMiles * MILES_TO_METERS, 250000), // up to ~155 miles
      },
    },
    maxResultCount: 20,
  };

  const res = await fetch(PLACES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": [
        "places.id",
        "places.displayName",
        "places.formattedAddress",
        "places.location",
        "places.rating",
        "places.userRatingCount",
        "places.nationalPhoneNumber",
        "places.websiteUri",
        "places.primaryType",
      ].join(","),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    console.error("Places API error:", res.status, await res.text());
    return [];
  }

  const data = await res.json();
  return (data?.places ?? []) as PlacesResult[];
}

// ─────────────────────────────────────────────────────────────
// Google Custom Search (LinkedIn people)
// ─────────────────────────────────────────────────────────────

async function fetchLinkedInPeople(
  title: string,
  cityState: string,
  apiKey: string,
  cx: string,
): Promise<SearchResult[]> {
  const q = encodeURIComponent(`${title} ${cityState} site:linkedin.com/in`);
  const url = `${SEARCH_URL}?q=${q}&key=${apiKey}&cx=${cx}&num=10`;

  const res = await fetch(url);
  if (!res.ok) {
    console.error("Custom Search error:", res.status, await res.text());
    return [];
  }

  const data = await res.json();
  return (data?.items ?? []) as SearchResult[];
}

// Parse LinkedIn search result title into name/title/company
function parseLinkedIn(result: SearchResult, cityState: string): {
  name: string; title: string; company: string; url: string; location: string;
} | null {
  // Only personal profiles (skip /company/ URLs)
  if (!result.link.includes("linkedin.com/in/")) return null;

  // Title format: "First Last - Title at Company | LinkedIn"
  //           or: "First Last - Company | LinkedIn"
  const raw = result.title.replace(" | LinkedIn", "").replace(" | LinkedIn Profile", "");
  const parts = raw.split(" - ");
  const name = parts[0]?.trim() ?? "";
  if (!name || name.length < 3) return null;

  let title = "";
  let company = "";

  if (parts[1]) {
    const atMatch = parts[1].match(/^(.+?)\s+at\s+(.+)$/i);
    if (atMatch) {
      title   = atMatch[1].trim();
      company = atMatch[2].trim();
    } else {
      // Could be "Title | Company" in snippet, or just company name
      company = parts[1].trim();
      // Try to extract title from snippet
      const snippet = result.snippet ?? "";
      const titleMatch = snippet.match(/^([^·|]+)/);
      if (titleMatch) title = titleMatch[1].trim().substring(0, 60);
    }
  }

  return {
    name,
    title:    title.substring(0, 80),
    company:  company.substring(0, 80),
    url:      result.link,
    location: cityState,
  };
}

// ─────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS });
  }

  const placesKey = Deno.env.get("GOOGLE_PLACES_API_KEY");
  const searchKey = Deno.env.get("GOOGLE_SEARCH_API_KEY");
  const searchCx  = Deno.env.get("GOOGLE_SEARCH_ENGINE_ID");

  if (!placesKey || !searchKey || !searchCx) {
    return new Response(
      JSON.stringify({ error: "Missing Google API keys. Set GOOGLE_PLACES_API_KEY, GOOGLE_SEARCH_API_KEY, GOOGLE_SEARCH_ENGINE_ID." }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let companyId: string;
  let forceRefresh = false;
  try {
    const body = await req.json();
    companyId    = body.company_id;
    forceRefresh = body.force_refresh ?? false;
    if (!companyId) throw new Error("company_id required");
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid body — send { company_id: string }" }),
      { status: 400, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }

  // 1. Load company
  const { data: company, error: companyErr } = await supabase
    .from("companies")
    .select("id, name, city, state, address, trades")
    .eq("id", companyId)
    .single();

  if (companyErr || !company) {
    return new Response(
      JSON.stringify({ error: "Company not found" }),
      { status: 404, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }

  const city  = company.city  || "";
  const state = company.state || "";
  const trades: string[] = company.trades || [];
  const cityState = [city, state].filter(Boolean).join(", ");

  console.log(`Company: "${company.name}" | city="${city}" state="${state}" trades=${JSON.stringify(trades)}`);

  if (!cityState) {
    return new Response(
      JSON.stringify({ error: "Company has no city/state set. Complete your profile first." }),
      { status: 422, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }

  // 2. Load or create opportunity_settings
  let { data: settings } = await supabase
    .from("opportunity_settings")
    .select("*")
    .eq("company_id", companyId)
    .single();

  if (!settings) {
    const { data: newSettings } = await supabase
      .from("opportunity_settings")
      .insert({ company_id: companyId, trades, radius_miles: 50, rotation_index: 0 })
      .select()
      .single();
    settings = newSettings;
  }

  const radiusMiles    = settings?.radius_miles ?? 50;
  let   rotationIndex  = settings?.rotation_index ?? 0;
  const settingsTrades: string[] = settings?.trades?.length ? settings.trades : trades;

  // 3. Check if today's batch already exists (skip unless force_refresh)
  const today = new Date().toISOString().split("T")[0];
  if (!forceRefresh) {
    const { count } = await supabase
      .from("opportunities")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("shown_date", today);

    if ((count ?? 0) >= 10) {
      return new Response(
        JSON.stringify({ success: true, message: "Today's batch already exists", count }),
        { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }
  }

  // 4. Geocode if needed
  let center: LatLng;
  if (settings?.center_lat && settings?.center_lng) {
    center = { lat: settings.center_lat, lng: settings.center_lng };
  } else {
    const geocoded = await geocode(city, state, placesKey);
    if (!geocoded) {
      return new Response(
        JSON.stringify({ error: `Could not geocode "${cityState}". Check city/state in your profile.` }),
        { status: 422, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }
    center = geocoded;
    // Save for future runs
    await supabase
      .from("opportunity_settings")
      .update({ center_lat: center.lat, center_lng: center.lng })
      .eq("company_id", companyId);
  }

  // 5. Determine today's rotation category
  const dayIndex = rotationIndex % ROTATION.length;
  const rotation = ROTATION[dayIndex];
  // Use state only (not city) so Google casts a wide net across the region —
  // small cities like New Braunfels return too few results when named explicitly.
  const companyQuery = `${rotation.company} ${state}`;
  const peopleQuery  = rotation.people;

  console.log(`Generating for ${cityState} | rotation ${dayIndex} | company: "${companyQuery}" | people: "${peopleQuery}"`);

  // 6. Load existing source_ids to deduplicate (last 14 days, not 30)
  // 30-day window was causing between-metro users to exhaust the Places pool too quickly.
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86_400_000).toISOString().split("T")[0];
  const { data: existing } = await supabase
    .from("opportunities")
    .select("source_id")
    .eq("company_id", companyId)
    .gte("shown_date", fourteenDaysAgo)
    .not("source_id", "is", null);

  const seenIds = new Set((existing ?? []).map((r: { source_id: string }) => r.source_id));
  console.log(`Dedup pool: ${seenIds.size} seen IDs from last 14 days`);

  // 7. Fetch company cards from Google Places
  const places = await fetchPlaces(companyQuery, center, radiusMiles, placesKey);
  console.log(`Places returned ${places.length} results`);

  const newOpps: NewOpportunity[] = [];

  for (const place of places) {
    const placeId = place.id;
    if (!placeId || seenIds.has(placeId)) continue;
    if (newOpps.filter((o) => o.card_type === "company").length >= TARGET_COMPANY_COUNT) break;

    const businessName = place.displayName?.text ?? "Unknown Business";
    const businessType = place.primaryType?.replace(/_/g, " ") ?? rotation.company.split(" ")[0];
    const placeLat = place.location?.latitude;
    const placeLng = place.location?.longitude;
    const distMiles = placeLat && placeLng
      ? parseFloat(distanceMiles(center, { lat: placeLat, lng: placeLng }).toFixed(1))
      : null;

    // Hard radius filter — prevents over-reach (e.g. user 160mi away seeing local leads)
    if (distMiles !== null && distMiles > radiusMiles) continue;

    const tradeScore  = scoreTradeAlignment(businessType, settingsTrades);
    const distScore   = distMiles !== null ? scoreDistance(distMiles) : 10;
    const qualScore   = scoreQuality(place.rating, place.userRatingCount, !!place.nationalPhoneNumber, !!place.websiteUri);
    const total       = Math.min(100, tradeScore + distScore + qualScore + 5);

    if (total < 30) continue; // Skip very low-relevance results

    newOpps.push({
      company_id:        companyId,
      card_type:         "company",
      source:            "google_places",
      source_id:         placeId,
      business_name:     businessName,
      business_type:     businessType,
      business_category: rotation.company.split(" ")[0],
      address:           place.formattedAddress,
      lat:               placeLat,
      lng:               placeLng,
      distance_miles:    distMiles ?? undefined,
      phone:             place.nationalPhoneNumber,
      website:           place.websiteUri,
      google_rating:     place.rating,
      google_reviews:    place.userRatingCount,
      match_score:       total,
      match_reason:      buildMatchReason(businessType, distMiles ?? 50, settingsTrades, "company"),
      status:            "new",
      shown_date:        today,
      is_new:            true,
    });

    seenIds.add(placeId);
  }

  // 8. Fetch LinkedIn people via Google Custom Search
  const searchResults = await fetchLinkedInPeople(peopleQuery, cityState, searchKey, searchCx);
  console.log(`Search returned ${searchResults.length} results`);

  for (const result of searchResults) {
    if (newOpps.filter((o) => o.card_type === "person").length >= TARGET_PERSON_COUNT) break;

    const parsed = parseLinkedIn(result, cityState);
    if (!parsed) continue;

    const urlKey = parsed.url.split("linkedin.com/in/")[1]?.replace(/\/$/, "") ?? parsed.url;
    if (seenIds.has(urlKey)) continue;

    // Person score: trade alignment on person's company + consistent 10 freshness
    const personTradeScore = scoreTradeAlignment(parsed.company + " " + parsed.title, settingsTrades);
    const total = Math.min(100, personTradeScore + 25 + 10 + 5); // no distance for people

    if (total < 40) continue;

    newOpps.push({
      company_id:     companyId,
      card_type:      "person",
      source:         "google_search",
      source_id:      urlKey,
      person_name:    parsed.name,
      person_title:   parsed.title,
      person_company: parsed.company,
      linkedin_url:   parsed.url,
      person_location: cityState,
      match_score:    total,
      match_reason:   buildMatchReason("", 0, settingsTrades, "person", parsed.title || parsed.company),
      status:         "new",
      shown_date:     today,
      is_new:         true,
    });

    seenIds.add(urlKey);
  }

  console.log(`Inserting ${newOpps.length} new opportunities (${newOpps.filter(o => o.card_type === "company").length} companies, ${newOpps.filter(o => o.card_type === "person").length} people)`);

  // 9. Insert
  let inserted = 0;
  if (newOpps.length > 0) {
    const { data: insertedRows, error: insertErr } = await supabase
      .from("opportunities")
      .insert(newOpps)
      .select("id");

    if (insertErr) {
      console.error("Insert error:", insertErr.message);
    } else {
      inserted = insertedRows?.length ?? 0;
    }
  }

  // 10. Increment rotation_index
  await supabase
    .from("opportunity_settings")
    .update({ rotation_index: rotationIndex + 1, updated_at: new Date().toISOString() })
    .eq("company_id", companyId);

  return new Response(
    JSON.stringify({
      success: true,
      city: cityState,
      rotation_day: dayIndex,
      company_query: companyQuery,
      people_query:  peopleQuery,
      inserted,
      total_candidates: newOpps.length,
    }),
    { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
  );
});
