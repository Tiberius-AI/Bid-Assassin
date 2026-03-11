# Bid Assassin -- Opportunities Tab (The Prospector)

**Add this to your project root alongside your existing CLAUDE.md / PROJECT_BRIEF.md**
**Tell Claude Code: "Read OPPORTUNITIES_TAB_SPEC.md and build the Opportunities tab"**

---

## What This Is

The Opportunities tab is a daily lead feed for commercial subcontractors. It hand-delivers potential clients and decision-makers to the user every day so the tab is never empty. Users should see something new every time they open the app. This is a retention feature as much as a lead gen feature -- if the feed is empty, people stop opening the app.

The tab pulls from two types of sources:

1. **Company cards** -- businesses found via Google Places API (general contractors, property managers, developers, facility companies, etc.)
2. **People cards** -- decision-makers found via Google search of LinkedIn profiles (project managers, superintendents, facilities directors, etc.)

Future sources (SAM.gov federal contracts, building permits, public bid boards) will plug into this same feed later. Build the data model to accommodate multiple source types from day one.

---

## User Setup (Part of Onboarding or Settings)

When a user first accesses the Opportunities tab (or during onboarding), collect:

- **Trade(s):** What they do (electrical, plumbing, drywall, HVAC, painting, etc.) -- multi-select
- **Service area center:** Default to their company address from onboarding
- **Radius:** Slider, default 50 miles, range 10-150 miles
- **Project size preference:** Optional -- small (<$50K), mid ($50K-$500K), large ($500K+)

Store in a `opportunity_settings` table tied to their `company_id`.

---

## The Rotation Engine

This is what makes the feed feel fresh every day instead of showing the same stale list.

### How It Works

Build a search matrix based on the user's trade. Each day, the system cycles through different **search categories** and **geographic slices** within their radius.

### Search Categories by Day (Default Rotation)

The system should rotate through these business/people types. Not all are relevant to every trade -- the rotation should weight categories based on the user's trade(s).

| Day | Company Search Focus | People Search Focus |
|-----|---------------------|---------------------|
| Mon | General Contractors (north quadrant) | Construction Project Managers |
| Tue | Property Management Companies | Facilities Directors |
| Wed | Commercial Developers + Medical Offices | Development Project Managers |
| Thu | School Districts + Churches + Nonprofits | Superintendent / Maintenance Directors |
| Fri | Hotels, Restaurants, Retail Groups | Property/Facility Managers |
| Sat | Facility Maintenance + Self-Storage | Construction Estimators |
| Sun | HOA Management + Auto Dealers + Misc | VP of Construction / Operations |

### Geographic Slicing

To avoid showing the same businesses, slice the radius into quadrants or rings:
- **Quadrants:** N, S, E, W of the user's center point
- **Rings:** 0-15mi, 15-30mi, 30-50mi (or whatever their radius is)

Vary the geographic slice each cycle so Monday-north gives different results than Monday-south next time through the rotation.

### Search Query Construction

**For Google Places API (Company Cards):**
```
Query: "{business_type} {city/area}"
Example: "general contractor New Braunfels TX"
Example: "property management company San Marcos TX"
Example: "commercial real estate developer San Antonio TX"
```

Use the Google Places API `textSearch` or `nearbySearch` endpoint with:
- `location` = user's center lat/lng
- `radius` = user's radius in meters
- `type` or `keyword` = the business category for that day

**For Google Web Search (People/LinkedIn Cards):**
```
Query: "{title} {city} site:linkedin.com/in"
Example: "construction project manager San Antonio site:linkedin.com/in"
Example: "facilities director New Braunfels site:linkedin.com/in"
Example: "commercial construction superintendent Texas site:linkedin.com/in"
```

Use a search API (Google Custom Search API, or SerpAPI, or similar) to find LinkedIn profiles. We are NOT scraping LinkedIn. We are using Google search results that happen to be LinkedIn URLs. The card links directly to LinkedIn -- the user logs into LinkedIn themselves to message the person.

### Deduplication

- Track every opportunity shown to a user in an `opportunity_log` table
- Never show the same business/person twice in the feed (unless the user dismissed it 30+ days ago)
- Each day's batch query should exclude previously shown IDs

### Daily Batch Size

Target 8-15 new opportunities per day. Mix of ~60% company cards and ~40% people cards. If a source returns fewer results for a given area, backfill from the next rotation category.

---

## Data Model

### Tables

```sql
-- User's prospector settings
CREATE TABLE opportunity_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  trades TEXT[] NOT NULL DEFAULT '{}',
  center_lat DECIMAL(10, 7),
  center_lng DECIMAL(10, 7),
  radius_miles INTEGER DEFAULT 50,
  project_size_pref TEXT, -- 'small', 'mid', 'large', or null for all
  rotation_index INTEGER DEFAULT 0, -- tracks where we are in the rotation
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id)
);

-- Individual opportunities (companies + people)
CREATE TABLE opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  
  -- Card type
  card_type TEXT NOT NULL CHECK (card_type IN ('company', 'person')),
  
  -- Source tracking
  source TEXT NOT NULL DEFAULT 'google', -- 'google', 'linkedin', 'sam', 'permit', 'bid_board'
  source_id TEXT, -- Google Place ID, LinkedIn URL slug, SAM opportunity ID, etc.
  
  -- Company card fields
  business_name TEXT,
  business_type TEXT,
  business_category TEXT, -- maps to rotation category ID
  address TEXT,
  lat DECIMAL(10, 7),
  lng DECIMAL(10, 7),
  distance_miles DECIMAL(5, 1),
  phone TEXT,
  website TEXT,
  google_rating DECIMAL(2, 1),
  google_reviews INTEGER,
  
  -- Person card fields
  person_name TEXT,
  person_title TEXT,
  person_company TEXT,
  linkedin_url TEXT,
  person_location TEXT,
  
  -- AI-generated relevance
  match_score INTEGER, -- 0-100, based on trade alignment, distance, category
  match_reason TEXT, -- short explanation: "GC within 10mi, likely hires electrical subs"
  
  -- Status tracking
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'saved', 'dismissed', 'reached_out', 'responded', 'proposal_sent', 'won', 'lost')),
  
  -- Outreach tracking
  outreach_method TEXT, -- 'email', 'sms', 'phone', 'linkedin'
  outreach_date TIMESTAMPTZ,
  outreach_notes TEXT,
  
  -- Metadata
  shown_date DATE DEFAULT CURRENT_DATE,
  is_new BOOLEAN DEFAULT true, -- flag for "NEW" badge, set false after 48hrs
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Outreach templates (user customizes once, reuses forever)
CREATE TABLE outreach_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'phone', 'linkedin')),
  name TEXT NOT NULL DEFAULT 'Default',
  subject TEXT, -- email only
  body TEXT NOT NULL,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: users only see their own company's data
ALTER TABLE opportunity_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own opportunity_settings" ON opportunity_settings
  FOR ALL USING (company_id IN (SELECT id FROM companies WHERE profile_id = auth.uid()));

CREATE POLICY "Users see own opportunities" ON opportunities
  FOR ALL USING (company_id IN (SELECT id FROM companies WHERE profile_id = auth.uid()));

CREATE POLICY "Users see own outreach_templates" ON outreach_templates
  FOR ALL USING (company_id IN (SELECT id FROM companies WHERE profile_id = auth.uid()));
```

### Default Outreach Templates (seed on first access)

**Email:**
```
Subject: {trade} Contractor Available for Upcoming Projects

Hi {contact_name},

This is {user_name} with {user_company} -- we're a licensed commercial {trade} contractor based in {user_city}. 

We handle {services_list} for commercial projects and are currently booking for the coming months.

If you have any upcoming projects that need {trade} bids, we'd welcome the opportunity to submit a proposal. Happy to send references and recent project examples.

Best,
{user_name}
{user_phone}
{user_email}
```

**SMS:**
```
Hi {contact_name}, this is {user_name} with {user_company}. We're a commercial {trade} contractor in {user_city}. If you have upcoming projects needing {trade} bids, we'd love to submit a proposal. Can I send some info?
```

**Phone Script:**
```
"Hi, my name is {user_name} with {user_company}. We're a commercial {trade} contractor here in {user_city}. 

I'm reaching out to introduce ourselves -- we specialize in {services_list} for commercial projects. 

Are you currently accepting bids from {trade} subcontractors on any upcoming projects? 

[If yes] Great, what's the best way to get the project details so we can put a bid together?
[If no/not now] No problem at all. Would it be alright if I sent over our company info so you have us on file for future projects?"
```

**LinkedIn Message:**
```
Hi {first_name}, I'm {user_name} with {user_company} -- we're a commercial {trade} contractor in the {user_city} area. Saw you're with {their_company} and wanted to connect. If you ever need {trade} bids on upcoming projects, we'd welcome the chance to earn your business. Happy to send references.
```

---

## UI Specification

### Layout

The Opportunities tab lives in the main app sidebar navigation alongside Dashboard, Proposals, etc.

### Top Section (Sticky Header)

1. **Title + Daily Count:** "Opportunities" with a bold animated counter showing today's new count (e.g., "12 new today")
2. **Subtitle:** "Fresh leads delivered daily within {radius} miles of your service area"
3. **Settings button:** Opens inline settings panel (radius slider, trade selector, source toggles)
4. **Rotation Strip:** Horizontal scrollable row showing each day of the week with its search focus. Current day is highlighted in Tiberius Red (#DC2626). This is informational -- shows the user the system is working and rotating.

### Source Indicators (in Settings Panel)

Show which sources are active vs coming soon:
- Google Places: Active (green checkmark)
- LinkedIn (via Google): Active (green checkmark)  
- SAM.gov: "IRS Verified - Approval Pending" (yellow, show progress)
- Building Permits: "Coming Soon" (gray lock)
- Public Bid Boards: "Coming Soon" (gray lock)

### Filter Bar

Horizontal scrollable chips:
- "All" (with count)
- "Saved" (with count, star icon)
- Then one chip per active business category with count
- "Companies" / "People" toggle or chips to filter by card type

### The Feed

Vertical list of opportunity cards. Two card variants:

#### Company Card
- Left: Category icon (emoji or custom)
- Business name (bold, primary text)
- Business type + distance + source badge (Google, SAM, Permit, etc.)
- Star rating + review count
- Address with map pin icon
- Phone (tap to call) + Website (tap to open)
- Match score badge (e.g., "94% match" in green/yellow/gray)
- **Action buttons:**
  - "Skip" -- dismisses, tracks in log, never shows again (until 30-day reset)
  - "Save" -- moves to saved pipeline
  - "Reach Out" -- opens the outreach drawer (PRIMARY action, replaces old "+ Proposal")

#### Person Card (LinkedIn)
- Left: Person silhouette icon or LinkedIn icon
- Person name (bold)
- Title + Company
- Location + source badge ("LinkedIn" in blue)
- Match score badge
- **Action buttons:**
  - "Skip"
  - "Save"  
  - "View on LinkedIn" -- opens their profile URL in new tab
  - "Reach Out" -- opens outreach drawer pre-set to LinkedIn message template

### Outreach Drawer (Slide-up Panel)

When user taps "Reach Out" on any card:

1. **Channel selector:** Tabs or segmented control -- Email | SMS | Phone | LinkedIn
2. **Template area:** Shows the default template for that channel with merge fields auto-filled ({contact_name}, {user_name}, {user_company}, {trade}, etc.)
3. **Edit toggle:** User can tweak the message before sending
4. **Action button per channel:**
   - Email: "Copy & Open Email" (copies message, opens mailto: link) or if email integration exists, "Send"
   - SMS: "Copy & Open Messages" (copies message, opens sms: link)
   - Phone: "Call Now" (tel: link) + shows the phone script as a reference card
   - LinkedIn: "Copy & Open LinkedIn" (copies message, opens their LinkedIn URL)
5. **After action:** Card status updates to "reached_out", outreach_method and outreach_date are recorded

### Pipeline View (Secondary View)

Toggle at the top: "Feed" vs "Pipeline"

Pipeline shows saved/contacted opportunities in a simple list grouped by status:
- **Saved** (not yet contacted)
- **Reached Out** (waiting for response)
- **Responded** (they replied -- hot leads)
- **Proposal Sent** (linked to actual proposal in Proposals tab)
- **Won / Lost**

Each row is compact: name, type, status, days since last action, and a quick-action to move to next stage.

### Stats Footer

At the bottom of the feed, show a stats bar:
- This Week: {count} opportunities
- Saved: {count} in pipeline
- Proposals: {count} sent this month
- Win Rate: {percent} last 90 days

---

## Technical Implementation Notes

### Google Places API

Use the Places API (New) `searchText` method:
```javascript
const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY,
    'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.nationalPhoneNumber,places.websiteUri,places.id,places.primaryType'
  },
  body: JSON.stringify({
    textQuery: 'general contractor New Braunfels TX',
    locationBias: {
      circle: {
        center: { latitude: 29.703, longitude: -98.124 },
        radius: 80467.0 // 50 miles in meters
      }
    },
    maxResultCount: 20
  })
});
```

Store the Google `place_id` in `source_id` for deduplication.

### LinkedIn via Google Search

Use Google Custom Search API (or SerpAPI if preferred):
```javascript
const query = encodeURIComponent('construction project manager San Antonio site:linkedin.com/in');
const response = await fetch(
  `https://www.googleapis.com/customsearch/v1?q=${query}&key=${API_KEY}&cx=${SEARCH_ENGINE_ID}&num=10`
);
```

Parse results to extract:
- `person_name` from the title (e.g., "Luke Divin - Steel Built Direct | LinkedIn" -> "Luke Divin")
- `person_company` from the title or snippet
- `person_title` from the snippet
- `linkedin_url` from the link
- `person_location` from the snippet

We do NOT scrape LinkedIn pages. We only use the Google search result snippet data. The user clicks through to LinkedIn to view the full profile and send messages.

### Match Scoring (v1 -- Simple)

Calculate a basic match score (0-100) based on:
- **Trade alignment (0-40 points):** Does this business type typically hire the user's trade? GC for an electrical sub = 40. Auto dealer for electrical = 15. Use a simple lookup table.
- **Distance (0-30 points):** Closer = higher. 0-10mi = 30, 10-25mi = 25, 25-50mi = 15, 50+ = 5.
- **Business quality signals (0-20 points):** Has website = +5, has phone = +5, Google rating > 4.0 = +5, review count > 20 = +5.
- **Recency (0-10 points):** Is this a new business (recently registered)? Recently updated Google listing? +10 if signals are fresh.

Store the score and a short `match_reason` string for display.

### Cron / Background Job

The daily feed should be generated via a scheduled function (Supabase Edge Function with pg_cron, or Vercel Cron):

1. For each user with `opportunity_settings` configured:
2. Determine today's rotation category based on `rotation_index`
3. Build search queries for company + people cards
4. Execute Google Places + Google Search API calls
5. Filter out already-shown opportunities (check `opportunity_log`)
6. Calculate match scores
7. Insert new `opportunities` rows with `shown_date = today`
8. Increment `rotation_index`

For MVP/demo, this can run on-demand when the user opens the Opportunities tab (with a loading state). Move to true background cron once the core flow works.

### API Key Management

Store Google API keys in Supabase Edge Function secrets or environment variables. Never expose them client-side. All Google API calls should go through a Supabase Edge Function or server-side API route.

---

## Design System Reminders

- **Background:** White/light (#F8F8F7 or #FFFFFF)
- **Primary accent:** Tiberius Red #DC2626 -- buttons, active states, NEW badges, highlighted day
- **Text:** #111827 (primary), #6B7280 (secondary), #9CA3AF (tertiary)
- **Cards:** White with 1.5px border, 14px border-radius, subtle shadow on hover
- **Source badges:** Google = blue (#4285F4), SAM = green (#0A5C36), Permit = orange (#E65100), Bid = purple (#7B1FA2), LinkedIn = blue (#0A66C2)
- **Match score:** Green (90+), Yellow (75-89), Gray (<75)
- **Font:** DM Sans or system font stack
- **Monospace numbers:** JetBrains Mono for counts and stats
- **No dark backgrounds.** Keep it clean and professional.
- **Mobile-first:** Cards should work well on phone screens. Horizontal scroll for filter chips and rotation strip.

---

## Build Order

### Phase 1: Static Feed (get the UI working)
- [ ] Opportunities page route + sidebar nav link
- [ ] Settings panel with trade select, radius slider, center point (default from company address)
- [ ] Opportunity card components (company + person variants)
- [ ] Filter chips (all, saved, by category, by card type)
- [ ] Save / Skip / Reach Out actions with local state
- [ ] Pipeline toggle view (grouped by status)
- [ ] Stats footer
- [ ] Seed with mock data to verify layout and interactions

### Phase 2: Live Data
- [ ] Supabase migrations for opportunity_settings, opportunities, outreach_templates tables + RLS
- [ ] Supabase Edge Function for Google Places API search
- [ ] Supabase Edge Function for Google Custom Search (LinkedIn profiles)
- [ ] Rotation engine logic (determine today's category, build queries, execute, deduplicate)
- [ ] Match score calculation
- [ ] On-demand feed generation (user opens tab -> check if today's batch exists -> if not, generate)
- [ ] Persist save/skip/status to Supabase

### Phase 3: Outreach
- [ ] Outreach templates table + default seed
- [ ] Outreach drawer UI (channel tabs, template with merge fields, copy + open actions)
- [ ] Template editor in settings (customize defaults)
- [ ] Status tracking (reached_out -> responded -> proposal_sent)
- [ ] Link "Proposal Sent" status to actual proposal in the Proposals tab

### Phase 4: Future Sources (post-SAM approval)
- [ ] SAM.gov API integration (same card format, different source badge)
- [ ] Building permit data feed (county-specific, start with Texas counties)
- [ ] Public bid board aggregation
- [ ] Source priority indicators (live bid > permit > Google Places)

---

## Known Pitfalls

1. **Google Places API billing:** textSearch costs $32 per 1000 requests. For 100 users generating daily feeds of ~20 results each, that's ~$64/month. Budget accordingly. Cache results aggressively.
2. **Google Custom Search API limits:** Free tier = 100 queries/day. Paid = $5 per 1000 queries. May need SerpAPI ($50/mo) for higher volume.
3. **LinkedIn profile parsing from Google snippets is imperfect.** Names and titles may need regex cleanup. Some results will be company pages, not personal profiles -- filter by URL pattern (`linkedin.com/in/` for people, skip `linkedin.com/company/`).
4. **RLS chain:** Same pattern as proposals -- opportunities require `company_id` lookup through `companies` where `profile_id = auth.uid()`. If onboarding didn't create the company record, queries return empty.
5. **Rate limiting on feed generation:** Don't fire API calls on every page load. Check if today's batch already exists. If `opportunities` has rows with `shown_date = today` for this `company_id`, serve from cache.
6. **Radius math:** Google Places API uses meters. 50 miles = 80,467 meters. Always convert.
7. **The "empty feed" problem:** If a user is in a rural area, some rotation days may return few or no results. Always have a fallback -- if the primary category returns < 5 results, fill from adjacent categories or expand the radius temporarily and note the expanded distance on the card.
