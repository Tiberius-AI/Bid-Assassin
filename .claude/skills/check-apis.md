# /check-apis

Run a full checklist of every external API this project depends on. For each one, confirm the key is set, where it goes, what permissions it needs, and the known gotchas that burned us before.

## Instructions

Walk through every item below in order. For each section:
1. State whether it's configured or not (ask the user if unsure)
2. Call out any known gotcha that applies
3. Give the exact fix if something is wrong

---

## 1. Google Places API (New)

**Used by:** `generate-opportunities` edge function
**Env var:** `GOOGLE_PLACES_API_KEY` (set in Supabase Dashboard → Edge Functions → Secrets)
**Google Cloud:** Project must have "Places API (New)" enabled — NOT the old "Places API"

**Gotchas:**
- `radius` in the Places API is in **meters**, max **50,000m** (~31 miles). If `radius_miles` is 50 in `opportunity_settings`, that's 80,467m — over the limit. The code now caps it at `Math.min(radiusMiles * 1609.34, 50000)`.
- The old Places API and Places API (New) are different products with different endpoints. We use the New one at `https://places.googleapis.com/v1/places:searchText`.
- The field mask header `X-Goog-FieldMask` is required — requests fail without it.

**Test:** In Supabase Dashboard → Edge Functions → `generate-opportunities` → Logs, trigger a run and check for "Places API error: 400".

---

## 2. Google Geocoding API

**Used by:** `generate-opportunities` edge function (same key as Places)
**Env var:** `GOOGLE_PLACES_API_KEY` (reused)
**Google Cloud:** Enable "Geocoding API" on the same project/key

**Gotchas:**
- Returns `status: "REQUEST_DENIED"` if Geocoding API isn't enabled (even if Places is).
- The company profile **must** have `city` and `state` filled in, or geocoding is skipped and the function returns 422.
- Geocoded lat/lng is cached in `opportunity_settings.center_lat / center_lng` — if bad coords got cached, clear them manually in Supabase Table Editor.

---

## 3. Google Custom Search API (LinkedIn people)

**Used by:** `generate-opportunities` edge function
**Env vars:**
- `GOOGLE_SEARCH_API_KEY` — can be the same key as Places, **but** Custom Search API must be enabled for it
- `GOOGLE_SEARCH_ENGINE_ID` — the `cx` value from https://programmablesearchengine.google.com

**Gotchas:**
- Custom Search API and Places API are separate enablements. A key valid for Places will return `API_KEY_INVALID` for Custom Search if that API isn't enabled on it.
- Must create a Programmable Search Engine at programmablesearchengine.google.com, set it to search the entire web, and copy the `cx` ID.
- Free tier: 100 queries/day. After that, results silently return empty.

**Setup steps (if not done):**
1. Go to Google Cloud Console → APIs & Services → Enable "Custom Search API"
2. Go to https://programmablesearchengine.google.com → Create engine → Search the entire web
3. Copy the `cx` value into Supabase secret `GOOGLE_SEARCH_ENGINE_ID`

---

## 4. Supabase Edge Function Secrets

**Where to set them:** Supabase Dashboard → Project → Edge Functions → (select function) → Secrets
OR: Project Settings → Edge Functions → Environment Variables (applies to all functions)

**Required secrets for `generate-opportunities`:**
| Secret | Value |
|--------|-------|
| `GOOGLE_PLACES_API_KEY` | Google Cloud key (Places API + Geocoding API enabled) |
| `GOOGLE_SEARCH_API_KEY` | Google Cloud key (Custom Search API enabled) |
| `GOOGLE_SEARCH_ENGINE_ID` | Programmable Search Engine `cx` value |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected — do not set these manually.

**After changing secrets:** Re-deploy the function. Secrets are baked in at deploy time.

---

## 5. Deploying the Edge Function

After any code or secret change:
```bash
npx supabase login          # opens browser, only needed once
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase functions deploy generate-opportunities
```

Project ref = the ID in the Supabase dashboard URL (16-char string like `abcdefghijklmnop`).

Alternatively: Supabase Dashboard → Edge Functions → `generate-opportunities` → Edit → paste code → Deploy.

---

## 6. Vercel Environment Variables (frontend)

**Where:** Vercel Dashboard → Project → Settings → Environment Variables

| Variable | Used for |
|----------|----------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key |
| `ANTHROPIC_API_KEY` | Claude API via Vite proxy at `/api/anthropic` |

After adding/changing: redeploy on Vercel (or push a commit to trigger auto-deploy).

---

## Summary checklist

Ask the user to confirm each:
- [ ] Places API (New) enabled in Google Cloud
- [ ] Geocoding API enabled in Google Cloud
- [ ] Custom Search API enabled in Google Cloud
- [ ] Programmable Search Engine created, `cx` copied
- [ ] All 3 secrets set in Supabase Edge Function secrets
- [ ] Edge function re-deployed after secret/code changes
- [ ] Company profile has `city` and `state` filled in
- [ ] Vercel env vars set (for frontend connections)
