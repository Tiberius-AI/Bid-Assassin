# Bid Assassin — The Prospector: SAM.gov Integration Spec

## Overview

The Prospector is an automated opportunity discovery engine inside Bid Assassin. It scans SAM.gov federal contract opportunities, matches them against each member's company profile, scores them for relevance, and delivers notifications so members can be among the first to submit proposals.

This spec covers Phase 1: SAM.gov integration only. Future phases will add Texas ESBD, municipal bid boards, and permit database scanning.

---

## Architecture

### Tech Stack

- **Frontend:** React (inside existing Bid Assassin app)
- **Backend:** Supabase Edge Functions (Deno/TypeScript)
- **Database:** Supabase PostgreSQL with RLS
- **AI Layer:** Anthropic Claude API (for scope analysis and matching)
- **Notifications:** Resend (email), Web Push API (browser), Twilio (SMS — Phase 2)
- **Scheduling:** Vercel Cron Jobs or Supabase pg_cron

### Data Flow

```
SAM.gov API → Scraper (Edge Function, runs on cron) → Raw Opportunities Table
                                                            ↓
Member Profiles ← Matching Engine (Edge Function) → Matched Opportunities Table
                                                            ↓
                                              Notification Service → Email / Push / In-App
                                                            ↓
                                              Opportunity Dashboard (React UI)
                                                            ↓
                                              "Build Proposal" → Proposal Builder (pre-filled)
```

---

## SAM.gov API Details

### Authentication

- **API Key:** Free, obtained from https://sam.gov after registration
- **Rate Limits:**
  - Public (no entity registration): 10 requests/day
  - Registered entity: 1,000 requests/day
  - System account: higher limits (requires approval, 10-30 business days)
- **Recommendation:** Register a Tiberius AI entity on SAM.gov for the 1,000/day tier. This is more than enough for hourly polling.

### Endpoints

**Opportunities Search (primary endpoint):**
```
GET https://api.sam.gov/prod/opportunities/v2/search
```

**Key Request Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `api_key` | string | Your SAM.gov API key (query param) |
| `limit` | int | Results per page (max 1000) |
| `offset` | int | Pagination offset |
| `postedFrom` | string | Start date filter (MM/DD/YYYY) |
| `postedTo` | string | End date filter (MM/DD/YYYY) |
| `ptype` | string | Notice type: `o` = solicitation, `p` = presolicitation, `k` = combined synopsis/solicitation |
| `ncode` | string | NAICS code filter (e.g., "236220" for commercial building construction) |
| `state` | string | Place of performance state filter |
| `typeOfSetAside` | string | Small business set-aside filter (SBA, 8A, HUBZone, SDVOSBC, WOSB) |

### Response Data Fields (per opportunity)

```json
{
  "noticeId": "unique-id-string",
  "title": "Interior Painting — Building 4200 Fort Worth",
  "solicitationNumber": "W9124D-26-Q-0042",
  "department": "DEPT OF THE ARMY",
  "subTier": "US ARMY CORPS OF ENGINEERS",
  "office": "W071 ENDIST FORT WORTH",
  "postedDate": "2026-03-01",
  "type": "Combined Synopsis/Solicitation",
  "baseType": "Combined Synopsis/Solicitation",
  "responseDeadLine": "2026-03-21T14:00:00-06:00",
  "naicsCode": "238320",
  "classificationCode": "Z",
  "active": "Yes",
  "typeOfSetAsideDescription": "Total Small Business Set-Aside",
  "typeOfSetAside": "SBA",
  "placeOfPerformance": {
    "streetAddress": "1234 Example Blvd",
    "city": { "code": "23456", "name": "Fort Worth" },
    "state": { "code": "TX" },
    "zip": "76102",
    "country": { "code": "USA" }
  },
  "pointOfContact": [
    {
      "type": "primary",
      "fullName": "Jane Smith",
      "email": "jane.m.smith.civ@army.mil",
      "phone": "817-555-0123",
      "fax": null,
      "title": "Contract Specialist"
    },
    {
      "type": "secondary",
      "fullName": "John Doe",
      "email": "john.doe@army.mil",
      "phone": null,
      "fax": null,
      "title": ""
    }
  ],
  "award": null,
  "description": null
}
```

### Important Notes on SAM.gov Data

1. **Descriptions are NOT in the API response.** Full scope/description must be fetched separately by scraping the SAM.gov opportunity page at `https://sam.gov/opp/{noticeId}/view` or by downloading attached documents. For Phase 1, use the title + NAICS code for matching. Phase 2 can add document parsing.

2. **Contact info varies by listing.** Most solicitations include at least one point of contact with a name and email. Phone numbers are less consistently provided. Some listings only have an email with no name.

3. **Set-aside codes** are valuable for matching members with relevant certifications (HUBZone, 8(a), SDVOSB, WOSB, etc.).

4. **NAICS codes** are the primary trade-matching mechanism. A mapping table is needed (see below).

---

## Database Schema

### New Tables

```sql
-- ============================================
-- RAW OPPORTUNITIES (scraped from SAM.gov)
-- ============================================
CREATE TABLE opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL DEFAULT 'sam_gov',
  source_id TEXT NOT NULL UNIQUE,           -- SAM.gov noticeId
  title TEXT NOT NULL,
  solicitation_number TEXT,
  department TEXT,
  sub_tier TEXT,
  office TEXT,
  posted_date DATE,
  response_deadline TIMESTAMPTZ,
  naics_code TEXT,
  classification_code TEXT,
  set_aside_type TEXT,                       -- SBA, 8A, HUBZone, SDVOSBC, WOSB, etc.
  set_aside_description TEXT,
  place_of_performance JSONB,                -- { city, state, zip, street_address }
  contacts JSONB,                            -- array of { type, fullName, email, phone, title }
  notice_type TEXT,                           -- solicitation, presolicitation, combined, award
  active BOOLEAN DEFAULT true,
  raw_response JSONB,                        -- full API response for reference
  description_text TEXT,                     -- scraped description (Phase 2)
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_opportunities_naics ON opportunities(naics_code);
CREATE INDEX idx_opportunities_state ON opportunities((place_of_performance->>'state'));
CREATE INDEX idx_opportunities_deadline ON opportunities(response_deadline);
CREATE INDEX idx_opportunities_posted ON opportunities(posted_date DESC);
CREATE INDEX idx_opportunities_source_id ON opportunities(source_id);

-- ============================================
-- NAICS TO TRADE MAPPING
-- ============================================
CREATE TABLE naics_trade_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  naics_code TEXT NOT NULL,
  naics_description TEXT,
  trade TEXT NOT NULL,                       -- matches member profile trade values
  relevance_weight NUMERIC DEFAULT 1.0       -- 1.0 = exact match, 0.5 = partial
);

-- Seed data examples:
-- 238320 | Painting and Wall Covering Contractors | Painting | 1.0
-- 238310 | Drywall and Insulation Contractors | Drywall | 1.0
-- 238220 | Plumbing, Heating, AC Contractors | HVAC | 0.8
-- 238220 | Plumbing, Heating, AC Contractors | Plumbing | 0.8
-- 236220 | Commercial/Institutional Building Construction | General Contractor | 1.0
-- 238290 | Other Building Equipment Contractors | Electrical | 0.7
-- 238910 | Site Preparation Contractors | Excavation | 1.0
-- 561720 | Janitorial Services | Janitorial | 1.0
-- 561730 | Landscaping Services | Landscaping | 1.0
-- 562111 | Solid Waste Collection | Junk Removal | 0.7
-- 238160 | Roofing Contractors | Roofing | 1.0
-- 238350 | Finish Carpentry Contractors | Carpentry | 1.0
-- 238340 | Tile and Terrazzo Contractors | Flooring | 1.0
-- 238330 | Flooring Contractors | Flooring | 1.0
-- 238210 | Electrical Contractors | Electrical | 1.0

-- ============================================
-- MATCHED OPPORTUNITIES (per member)
-- ============================================
CREATE TABLE opportunity_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES auth.users(id),
  opportunity_id UUID NOT NULL REFERENCES opportunities(id),
  fit_score NUMERIC NOT NULL,                -- 0-100
  score_breakdown JSONB,                     -- { trade: 30, location: 25, size: 20, certification: 15, deadline: 10 }
  status TEXT DEFAULT 'new',                 -- new, viewed, interested, passed, proposal_started, proposal_sent
  notified_at TIMESTAMPTZ,
  notification_channel TEXT,                 -- email, push, sms
  viewed_at TIMESTAMPTZ,
  action_at TIMESTAMPTZ,                    -- when they clicked interested/pass
  proposal_id UUID,                          -- links to proposals table if they build one
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(member_id, opportunity_id)
);

CREATE INDEX idx_matches_member ON opportunity_matches(member_id);
CREATE INDEX idx_matches_status ON opportunity_matches(status);
CREATE INDEX idx_matches_score ON opportunity_matches(fit_score DESC);

-- ============================================
-- NOTIFICATION PREFERENCES (per member)
-- ============================================
CREATE TABLE notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES auth.users(id) UNIQUE,
  email_enabled BOOLEAN DEFAULT true,
  push_enabled BOOLEAN DEFAULT false,
  sms_enabled BOOLEAN DEFAULT false,        -- Phase 2
  phone_number TEXT,                         -- for SMS
  hot_alert_threshold INTEGER DEFAULT 80,    -- score >= this triggers immediate notification
  digest_enabled BOOLEAN DEFAULT true,       -- daily digest email
  digest_time TEXT DEFAULT '08:00',          -- preferred digest delivery time (local)
  weekly_intel_enabled BOOLEAN DEFAULT true,
  min_score_threshold INTEGER DEFAULT 50,    -- don't show matches below this score
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- RLS POLICIES
-- ============================================

-- Members can only see their own matches
ALTER TABLE opportunity_matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members see own matches" ON opportunity_matches
  FOR SELECT USING (auth.uid() = member_id);
CREATE POLICY "System inserts matches" ON opportunity_matches
  FOR INSERT WITH CHECK (true);  -- Edge function uses service role key
CREATE POLICY "Members update own matches" ON opportunity_matches
  FOR UPDATE USING (auth.uid() = member_id);

-- Opportunities are readable by all authenticated members
ALTER TABLE opportunities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read opportunities" ON opportunities
  FOR SELECT USING (auth.role() = 'authenticated');

-- Notification prefs are per-member
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members manage own prefs" ON notification_preferences
  FOR ALL USING (auth.uid() = member_id);
```

### Existing Tables Referenced

The matching engine needs access to these existing Bid Assassin tables:

- **`company_profiles`** — member's trades, service area (city, state, zip, radius), project size range (min/max), certifications (HUBZone, 8a, SDVOSB, WOSB, MBE, WBE, veteran)
- **`proposals`** — for linking matched opportunities to generated proposals
- **`auth.users`** — member identity

---

## Scraper Edge Function

### Purpose
Polls SAM.gov API on a schedule, fetches new/updated opportunities, and stores them in the `opportunities` table.

### Cron Schedule
Every 4 hours: `0 */4 * * *`

This uses roughly 6 API calls per day for polling (well within the 1,000/day limit), with room to paginate through results.

### Logic

```
1. Query SAM.gov API:
   - postedFrom = last successful scrape timestamp (stored in a metadata table or KV)
   - postedTo = now
   - ptype = o,p,k (solicitations, presolicitations, combined)
   - Filter by relevant NAICS codes (all codes in naics_trade_map table)
   - Paginate through all results (limit=100 per page)

2. For each opportunity:
   - Check if source_id already exists in opportunities table
   - If new: INSERT full record
   - If exists: UPDATE if any fields changed (deadline extension, status change, etc.)
   - Skip award notices and inactive listings

3. After scrape completes:
   - Update last_scrape_timestamp
   - Trigger matching engine (call the matching Edge Function)
   - Log scrape stats: total fetched, new inserts, updates, errors

4. Error handling:
   - If API returns 429 (rate limited): back off and retry after 60 seconds
   - If API returns 5xx: retry 3 times with exponential backoff
   - If API key is invalid: log critical error and send admin alert
   - Always complete partial results (don't discard everything on one page failure)
```

### NAICS Codes to Query

Start with these high-value codes for the contractor/trades verticals:

| NAICS | Description |
|-------|-------------|
| 236220 | Commercial and Institutional Building Construction |
| 238160 | Roofing Contractors |
| 238210 | Electrical Contractors |
| 238220 | Plumbing, Heating, and AC Contractors |
| 238290 | Other Building Equipment Contractors |
| 238310 | Drywall and Insulation Contractors |
| 238320 | Painting and Wall Covering Contractors |
| 238330 | Flooring Contractors |
| 238340 | Tile and Terrazzo Contractors |
| 238350 | Finish Carpentry Contractors |
| 238910 | Site Preparation Contractors |
| 238990 | All Other Specialty Trade Contractors |
| 561720 | Janitorial Services |
| 561730 | Landscaping Services |
| 562111 | Solid Waste Collection |
| 562119 | Other Waste Collection |
| 811310 | Machinery/Equipment Repair |

Note: SAM.gov API supports querying multiple NAICS codes in a single request using comma separation.

---

## Matching Engine

### Purpose
When new opportunities arrive, score each one against every active member's profile and create match records.

### Scoring Model (100 points total)

| Factor | Max Points | Logic |
|--------|------------|-------|
| **Trade Match** | 35 | Exact NAICS-to-trade match = 35. Related trade (via relevance_weight) = 35 * weight. No match = 0. |
| **Location** | 25 | Same state = 15. Within member's radius of service area = 25. Adjacent state = 10. National = 5. |
| **Set-Aside / Certification** | 20 | Member holds matching certification (8a, HUBZone, SDVOSB, WOSB) = 20. No set-aside required = 10. Member lacks required set-aside = 0. |
| **Deadline Freshness** | 10 | Posted today = 10. Posted within 3 days = 8. Within 7 days = 5. Older = 2. Expired = 0. |
| **Engagement History** | 10 | Member has bid on this agency/office before and won = 10. Bid before = 5. New agency = 3. |

### Match Threshold

- **Score >= 80:** Hot alert (immediate notification)
- **Score 60-79:** Daily digest
- **Score 50-59:** Weekly intel
- **Score < 50:** Do not create match record

### AI Enhancement (Phase 1.5)

For opportunities scoring 60+, optionally pass the title and any available description to Claude for deeper analysis:

```
System: You are a commercial construction opportunity analyst. Given a federal
contract opportunity and a contractor's profile, provide a brief assessment of
fit and any concerns.

User: 
Opportunity: {title}, NAICS: {naics_code}, Location: {city, state}
Contractor Profile: Trades: {trades}, Location: {city, state}, Certifications: {certs}

Respond with:
- fit_summary: 1-2 sentence plain English assessment
- concerns: any red flags or missing qualifications
- tip: one actionable suggestion for the bid
```

This adds the "AI Coach" angle to the Prospector -- not just finding leads, but giving a quick take on each one.

### Logic

```
1. Fetch all new/unmatched opportunities (no record in opportunity_matches for any member)
2. Fetch all active member profiles from company_profiles
3. For each opportunity:
   a. For each member:
      - Calculate trade_score via naics_trade_map lookup
      - Calculate location_score via state match + distance calc
      - Calculate certification_score via set-aside match
      - Calculate freshness_score via posted_date
      - Calculate engagement_score via historical proposal data
      - total_score = sum of all factors
      - If total_score >= min threshold (50): INSERT into opportunity_matches
4. For all new matches with score >= hot_alert_threshold:
   - Queue immediate notification
5. Log matching stats: total opportunities processed, total matches created, hot alerts triggered
```

---

## Notification Service

### Channels

**1. In-App (always on)**
New matches appear in the Opportunity Dashboard with a badge count on the sidebar nav item. No external service needed.

**2. Email (Resend)**
- **Hot alerts:** Sent immediately when a match scores >= member's hot_alert_threshold
- **Daily digest:** Sent at member's preferred time, includes all new matches from the past 24 hours
- **Weekly intel:** Sent Monday mornings, summary of market activity in their area

**3. Web Push (Phase 1)**
Browser push notifications for hot alerts. Uses the Web Push API (free, no third-party service). Requires the member to grant permission in-browser.

**4. SMS via Twilio (Phase 2)**
Text message for hot alerts only. Opt-in with phone number verification.

### Email Templates

**Hot Alert Email:**
```
Subject: New {trade} opportunity in {city, state} — {fit_score}% match

{member_name},

A new federal contract just posted that matches your profile:

{title}
Agency: {department} / {office}
Location: {city}, {state}
Bid Deadline: {response_deadline}
Set-Aside: {set_aside_description}
Contact: {primary_contact_name} — {primary_contact_email}

Your Fit Score: {fit_score}%

[View Details]  [Build Proposal]  [Pass]

— Bid Assassin
```

**Daily Digest Email:**
```
Subject: {count} new opportunities matched your profile today

{member_name},

Here are today's top matches:

1. {title} — {city}, {state} — {fit_score}% match — Due {deadline}
2. {title} — {city}, {state} — {fit_score}% match — Due {deadline}
3. {title} — {city}, {state} — {fit_score}% match — Due {deadline}

[View All in Dashboard]

— Bid Assassin
```

---

## Opportunity Dashboard (React UI)

### Location in App
New sidebar nav item: "Opportunities" (with notification badge showing count of unviewed matches).

### Layout

```
┌─────────────────────────────────────────────────────────┐
│  Opportunities                          [Filter] [Sort] │
│  {badge_count} new matches                              │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │ 🔴 92% Match                    Due: Mar 21     │    │
│  │ Interior Painting — Bldg 4200, Fort Worth       │    │
│  │ Dept of the Army / USACE Fort Worth District    │    │
│  │ Fort Worth, TX | NAICS 238320 | Small Biz Set-Aside│ │
│  │ Contact: Jane Smith — jane.smith@army.mil       │    │
│  │                                                  │    │
│  │ [View on SAM.gov]  [Build Proposal]  [Pass]     │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │ 🟡 74% Match                    Due: Apr 02     │    │
│  │ HVAC Maintenance — VA Medical Center Dallas     │    │
│  │ Dept of Veterans Affairs                        │    │
│  │ Dallas, TX | NAICS 238220 | SDVOSB Set-Aside    │    │
│  │ Contact: Robert Johnson — robert.johnson@va.gov │    │
│  │                                                  │    │
│  │ [View on SAM.gov]  [Build Proposal]  [Pass]     │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  [Load More]                                            │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Filters
- Score range (slider: 50-100)
- Trade (dropdown, from member's trades)
- State (dropdown)
- Set-aside type (multi-select)
- Status: New / Viewed / Interested / Passed
- Deadline: This week / Next 2 weeks / Next 30 days / All

### Sort Options
- Fit score (highest first) — default
- Deadline (soonest first)
- Posted date (newest first)

### Card Actions

| Action | Effect |
|--------|--------|
| **View on SAM.gov** | Opens `https://sam.gov/opp/{noticeId}/view` in new tab |
| **Build Proposal** | Navigates to Proposal Builder with pre-filled data: project title, location, agency as client name, contact info, deadline, NAICS-derived trade |
| **Pass** | Updates match status to "passed", removes from default view, feeds back into matching engine to improve future scoring |
| **Interested** | Saves to member's pipeline, tracks for follow-up |

### Fit Score Badge Colors
- 80-100: Red badge (hot match — your brand color `#DC2626`)
- 60-79: Amber badge (`#D97706`)
- 50-59: Gray badge (`#64748B`)

---

## Pre-Fill Flow: Opportunity to Proposal

When a member clicks "Build Proposal" on an opportunity card, navigate to the Proposal Builder with these fields pre-populated:

| Proposal Field | Source |
|----------------|--------|
| Project Title | `opportunities.title` |
| Client Name | `opportunities.department` + `opportunities.office` |
| Client Contact Name | `opportunities.contacts[0].fullName` |
| Client Contact Email | `opportunities.contacts[0].email` |
| Client Contact Phone | `opportunities.contacts[0].phone` |
| Project Location | `opportunities.place_of_performance` (city, state, zip) |
| Trade/Scope Category | Derived from `naics_trade_map` lookup |
| Bid Deadline | `opportunities.response_deadline` |
| Solicitation Number | `opportunities.solicitation_number` |
| Set-Aside | `opportunities.set_aside_description` |
| Source Reference | `"SAM.gov — " + source_id` |

The member reviews, adjusts scope details and pricing, and generates the proposal as normal. The `opportunity_matches` record gets updated with the `proposal_id` once created.

---

## Cron Job Schedule Summary

| Job | Schedule | Function |
|-----|----------|----------|
| SAM.gov scraper | Every 4 hours (`0 */4 * * *`) | Fetch new opportunities |
| Matching engine | Triggered after scraper completes | Score and create matches |
| Hot alert sender | Triggered after matching completes | Send immediate notifications for 80+ scores |
| Daily digest | Daily at configurable time (`0 8 * * *` default) | Compile and send daily match summary |
| Weekly intel | Mondays at 8am (`0 8 * * 1`) | Compile and send weekly market summary |
| Stale cleanup | Daily at midnight | Archive opportunities past deadline, mark expired |

---

## Phase 1 Build Order (Step-by-Step Prompts for Claude Code)

These are the sequential prompts to feed Claude Code after the CLAUDE.md orientation is in place:

### Step 1: Database Migration
"Create a Supabase migration that adds the opportunities, naics_trade_map, opportunity_matches, and notification_preferences tables with all indexes and RLS policies as defined in the spec."

### Step 2: NAICS Seed Data
"Create a seed script that populates the naics_trade_map table with NAICS-to-trade mappings for all construction and service trades."

### Step 3: SAM.gov Scraper Edge Function
"Build a Supabase Edge Function called `scrape-sam-gov` that queries the SAM.gov Opportunities API, handles pagination, and upserts results into the opportunities table. It should accept a `since` parameter and track the last successful scrape timestamp."

### Step 4: Matching Engine Edge Function
"Build a Supabase Edge Function called `match-opportunities` that takes new opportunities, scores them against all active member profiles using the 5-factor scoring model (trade, location, certification, freshness, engagement), and inserts qualified matches into opportunity_matches."

### Step 5: Opportunity Dashboard UI
"Add an 'Opportunities' tab to the Bid Assassin sidebar. Build the opportunity feed showing matched opportunities as cards with fit score badges, contact info, deadline, and action buttons (View on SAM.gov, Build Proposal, Pass). Include filters for score range, trade, state, set-aside type, and deadline."

### Step 6: Pre-Fill Integration
"When a member clicks 'Build Proposal' on an opportunity card, navigate to the Proposal Builder with the opportunity data pre-filled into the appropriate form fields."

### Step 7: Notification Preferences UI
"Add a 'Notification Preferences' section to the Settings page where members can configure hot alert threshold, daily digest toggle and time, weekly intel toggle, and email/push preferences."

### Step 8: Email Notifications
"Integrate Resend for sending hot alert emails (immediate, when match score >= threshold) and daily digest emails (compiled summary of all new matches in the past 24 hours). Use the email templates from the spec."

### Step 9: Web Push Notifications
"Add browser push notification support for hot alerts. Include a permission request prompt on first visit to the Opportunities tab."

### Step 10: Cron Scheduling
"Configure Vercel cron jobs (or Supabase pg_cron) to run the scraper every 4 hours, the daily digest at 8am, the weekly intel on Mondays, and the stale opportunity cleanup at midnight."

---

## Cost Summary (For Michael Only)

| Item | Monthly Cost | Notes |
|------|-------------|-------|
| SAM.gov API | $0 | Free with registration |
| Supabase Pro | $25 | You likely already have this |
| Vercel Pro | $20 | You likely already have this |
| Resend email | $0-20 | Free tier: 3,000 emails/mo. $20/mo for 50K |
| Claude API (matching) | $20-50 | Short classification prompts, low token usage |
| Twilio SMS (Phase 2) | $2-5 | Only for hot alerts, opt-in |
| **Total incremental** | **$0-75/mo** | On top of existing Supabase + Vercel spend |

The heavy cost is your build time, not infrastructure. Estimate 2-3 weeks heads-down for a working Phase 1.

---

## Success Metrics

Track these from day one to validate the feature:

- **Opportunities scraped per day** (volume indicator)
- **Matches created per member per week** (relevance indicator)
- **Match-to-view rate** (are members opening matches?)
- **Match-to-proposal rate** (are they acting on matches?)
- **Proposal-to-win rate from Prospector leads** (the money metric)
- **Average time from opportunity posted to proposal sent** (speed advantage)
- **Pass rate by score range** (calibrate scoring thresholds)

---

## Future Enhancements (Phase 2+)

- **Texas ESBD integration** — scrape txsmartbuy.gov/esbd for state-level contracts $25K+
- **Municipal bid boards** — Dallas, Fort Worth, Houston, San Antonio city procurement portals
- **County permit databases** — new commercial permits signal sub work 30-90 days out
- **Dodge / BidNet API** — paid data sources for private-sector opportunities
- **AI scope analysis** — download and parse attached solicitation documents for deeper matching
- **"Smart Pass" learning** — when members pass on opportunities, use that signal to refine their profile and improve future matching
- **Competitor intelligence** — track award notices to show members who won contracts they passed on or lost
- **Team alerts** — for members with multiple estimators, route different matches to different team members by trade
