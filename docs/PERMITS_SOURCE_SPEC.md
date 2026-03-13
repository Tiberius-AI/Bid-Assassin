# Bid Assassin -- Building Permits Source Spec

**Place in docs/ alongside OPPORTUNITIES_TAB_SPEC.md**
**Tell Claude Code: "Read docs/PERMITS_SOURCE_SPEC.md and add the building permits source to the Opportunities tab"**

---

## Overview

Building permits are the highest-signal lead source in the Prospector. Unlike Google Places (which shows businesses that *might* have projects), a building permit means someone *definitely* has a project with money committed. The permit data includes the project address, type of work, estimated dollar value, and often the name of the contractor or applicant.

This source feeds into the same Opportunities tab feed as Google Places and LinkedIn cards. Permit cards use `source = 'permit'` and display with the orange permit badge already defined in OPPORTUNITIES_TAB_SPEC.md.

---

## Data Sources -- Texas Cities

Start with San Antonio (home market), then expand to other Texas cities. All of these publish building permit data as free, public, downloadable CSVs through open data portals.

### 1. San Antonio (Priority -- Build First)

**Portal:** https://data.sanantonio.gov/dataset/building-permits
**License:** Creative Commons Attribution (free to use)
**Last Updated:** March 8, 2026 (actively maintained)

**Two key datasets:**

| Dataset | URL | Description |
|---------|-----|-------------|
| Permits Issued (current year) | `https://data.sanantonio.gov/dataset/05012dcb-ba1b-4ade-b5f3-7403bc7f52eb/resource/c21106f9-3ef5-4f3a-8604-f992b4db7512/download/permits_issued.csv` | All building, trade (MEP) and permits issued in current year |
| Applications Submitted | `https://data.sanantonio.gov/dataset/05012dcb-ba1b-4ade-b5f3-7403bc7f52eb/resource/fbb7202e-c6c1-475b-849e-c5c2cfb65833/download/accelasubmitpermitsextract.csv` | Applications submitted this year (earlier signal -- permits not yet issued) |

**CSV Fields:**

```
PERMIT TYPE        -- e.g., "Comm New Building Permit", "Electrical General Permit", "Mechanical Permit"
PERMIT #           -- e.g., "COM-BLG-PMT24-40200788"
PROJECT NAME       -- e.g., "Building No: N/A; Unit No: N/A" or actual project name
WORK TYPE          -- e.g., "New", "Remodel", "Addition", "Tenant Improvement"
ADDRESS            -- Full address with city and zip
LOCATION           -- Sometimes empty, sometimes has descriptive location
X_COORD            -- Longitude (or state plane X coordinate)
Y_COORD            -- Latitude (or state plane Y coordinate)
DATE SUBMITTED     -- ISO date format (YYYY-MM-DD)
DATE ISSUED        -- ISO date format
DECLARED VALUATION -- Dollar amount (e.g., 3500000.0) -- THIS IS THE GOLD FIELD
AREA (SF)          -- Square footage
PRIMARY CONTACT    -- Name of contractor or applicant -- THIS IS WHO THE SUB SHOULD CONTACT
CD                 -- Council District
NCD                -- Neighborhood Conservation District
HD                 -- Historic District
```

**Key filtering logic:**

The CSV contains everything from garage sale permits to multi-million dollar commercial projects. We need to filter aggressively.

**Commercial permit types to INCLUDE (contain these strings):**
- `Comm New Building`
- `Comm Remodel`
- `Comm Addition`
- `Comm IFO` (Interior Finish-Out / Tenant Improvement)
- `Comm Shell`
- `Comm Sitework`

**Permit types to EXCLUDE:**
- `Garage Sale`
- `Res` (residential -- unless declared valuation > $500K, which suggests a large custom home or multi-family)
- `Solar`
- `Sign`
- `Demolition` (unless declared valuation > $100K, suggesting a site-prep for new construction)

**Minimum declared valuation filter:** $50,000 default. Configurable per user in settings. Anything under this is likely minor trade work not worth a sub's time.

**Sample raw data row:**
```
Comm New Building Permit,COM-BLG-PMT24-40200788,Building No: N/A; Unit No: N/A,New,"8751 STATE HWY 151, City of San Antonio, TX 78245",,2076498.5,13708187.9,2024-08-02,2025-01-01,3500000.0,9110.0,Taco Palenque,6,,
```

This tells us: a $3.5M new commercial building, 9,110 sq ft, for Taco Palenque on State Hwy 151. The primary contact is Taco Palenque (the owner/applicant). A sub could look up who the GC is or reach out directly.

### 2. Austin

**Portal:** https://data.austintexas.gov/Building-and-Development/Issued-Construction-Permits/3syk-w9eu
**Format:** Socrata API (supports JSON, CSV, with query filtering built in)
**API endpoint:** `https://data.austintexas.gov/resource/3syk-w9eu.json`

Socrata supports SoQL queries, so you can filter server-side:
```
https://data.austintexas.gov/resource/3syk-w9eu.json?$where=permit_class='C Commercial' AND issued_date > '2026-01-01'&$limit=100
```

Key fields: `permit_type`, `permit_class`, `work_class`, `project_name`, `description`, `issued_date`, `status_current`, `original_address`, `latitude`, `longitude`, `total_existing_bldg_sqft`, `total_new_add_sqft`, `total_valuation`

### 3. Houston

**Portal:** https://data.houstontx.gov
**Search for:** "building permits" in the dataset catalog
**Format:** Typically Socrata-based, similar API pattern to Austin

### 4. Dallas / Fort Worth

**Dallas:** https://www.dallasopendata.com -- search for building permits
**Fort Worth:** https://data.fortworthtexas.gov -- has open data portal with permit data

### 5. Other Texas Cities with Open Data Portals

Many of these are on Socrata or ArcGIS platforms and follow similar patterns:
- New Braunfels, San Marcos, Round Rock, Pflugerville, Frisco, McKinney, Plano, Irving, Arlington

For smaller cities without APIs, the permit data is often published as weekly/monthly PDF reports on the city website. These require a scraper or manual import.

---

## The Permit Card

### Card Layout (in the Opportunities feed)

A permit card looks different from a company card because it represents a **specific project**, not just a business.

```
+----------------------------------------------------------+
| 🔶 PERMIT   NEW                                          |
|                                                           |
| 📋 Commercial New Building - Tenant Buildout              |
|    $3,500,000 est. value  |  9,110 SF                    |
|                                                           |
| 📍 8751 State Hwy 151, San Antonio, TX 78245              |
|    4.2 mi from you                                        |
|                                                           |
| 🏢 Applicant: Taco Palenque                               |
| 📅 Filed: Aug 2, 2024  |  Issued: Jan 1, 2025            |
| 🔖 Permit #COM-BLG-PMT24-40200788                        |
|                                                           |
|    [92% match]                                            |
|                                                           |
|    [Skip]  [Save]  [Find GC]  [Reach Out]                |
+----------------------------------------------------------+
```

### Card Fields

| Field | Source | Display |
|-------|--------|---------|
| Permit Type | `PERMIT TYPE` (cleaned up) | "Commercial New Building", "Tenant Buildout", etc. |
| Project Value | `DECLARED VALUATION` | Formatted as currency: "$3,500,000" |
| Square Footage | `AREA (SF)` | "9,110 SF" |
| Address | `ADDRESS` | Full address, cleaned |
| Distance | Calculated from user's center point | "4.2 mi" |
| Applicant | `PRIMARY CONTACT` | The name of whoever filed -- could be owner, GC, or architect |
| Date Filed | `DATE SUBMITTED` | "Filed: Aug 2, 2024" |
| Date Issued | `DATE ISSUED` | "Issued: Jan 1, 2025" |
| Permit Number | `PERMIT #` | Smaller text, useful for reference |
| Source Badge | hardcoded | Orange "PERMIT" badge |
| Match Score | calculated | Same scoring as other cards but weighted for value + trade fit |

### Special Action: "Find GC"

Permit data often lists the owner or applicant, not the GC. For commercial projects, the sub needs to reach the GC. The "Find GC" button should:

1. Take the project address and/or applicant name
2. Run a Google search: `"{applicant name}" OR "{address}" general contractor site:linkedin.com OR site:google.com`
3. Present results as supplemental people/company cards attached to this permit

This is a v2 feature. For v1, just show the applicant name and let the user do their own research. The card already has "Reach Out" which would let them contact the applicant directly.

---

## Data Pipeline

### Fetch Strategy

Building permit CSVs are static files that get updated periodically (San Antonio updates theirs regularly, Austin quarterly). We don't need real-time polling.

**Recommended approach:**

1. **Supabase Edge Function** (`fetch-permits`) runs on a cron schedule (daily at 6 AM)
2. Downloads the CSV from the data portal URL
3. Parses the CSV, filters for commercial permits above the value threshold
4. Compares against already-ingested permits (deduplicate by `PERMIT #`)
5. For new permits: geocodes if needed, calculates distance from each user's center, calculates match score
6. Inserts as `opportunities` rows with `source = 'permit'`

### Parsing Logic (San Antonio CSV)

```javascript
// Pseudocode for the Edge Function
import Papa from 'papaparse';

const COMMERCIAL_PREFIXES = [
  'Comm New Building',
  'Comm Remodel',
  'Comm Addition', 
  'Comm IFO',
  'Comm Shell',
  'Comm Sitework',
  'Commercial',
];

const EXCLUDE_TYPES = [
  'Garage Sale',
  'Solar',
  'Sign Permit',
  'Res ',        // residential prefix (note trailing space)
  'Residential',
];

function isCommercialPermit(permitType) {
  const upper = permitType.toUpperCase();
  // Exclude first
  if (EXCLUDE_TYPES.some(ex => upper.includes(ex.toUpperCase()))) return false;
  // Include commercial
  return COMMERCIAL_PREFIXES.some(prefix => upper.includes(prefix.toUpperCase()));
}

function parsePermitCSV(csvText, minValuation = 50000) {
  const { data } = Papa.parse(csvText, { header: true, skipEmptyLines: true });
  
  return data
    .filter(row => {
      if (!isCommercialPermit(row['PERMIT TYPE'] || '')) return false;
      const valuation = parseFloat(row['DECLARED VALUATION'] || '0');
      if (valuation < minValuation) return false;
      return true;
    })
    .map(row => ({
      source: 'permit',
      source_id: row['PERMIT #'],
      card_type: 'company', // permits are project-type cards but stored as company type
      business_name: cleanProjectName(row['PROJECT NAME'], row['PRIMARY CONTACT']),
      business_type: cleanPermitType(row['PERMIT TYPE']),
      business_category: 'permit',
      address: cleanAddress(row['ADDRESS']),
      lat: parseCoord(row['Y_COORD']),
      lng: parseCoord(row['X_COORD']),
      phone: null, // permits don't include phone -- user can look up
      website: null,
      google_rating: null,
      google_reviews: null,
      // Permit-specific fields stored in a JSONB metadata column
      permit_metadata: {
        permit_number: row['PERMIT #'],
        permit_type: row['PERMIT TYPE'],
        work_type: row['WORK TYPE'],
        declared_valuation: parseFloat(row['DECLARED VALUATION'] || '0'),
        area_sf: parseFloat(row['AREA (SF)'] || '0'),
        primary_contact: row['PRIMARY CONTACT'],
        date_submitted: row['DATE SUBMITTED'],
        date_issued: row['DATE ISSUED'],
        council_district: row['CD'],
      }
    }));
}

// San Antonio coordinates may be in State Plane (Texas South Central, EPSG:2278)
// Need to detect and convert to WGS84 lat/lng if values are large numbers
function parseCoord(val) {
  const num = parseFloat(val);
  if (Math.abs(num) > 180) {
    // State Plane coordinates -- need proj4 conversion
    // Install proj4: npm install proj4
    // Convert EPSG:2278 (TX South Central) to EPSG:4326 (WGS84)
    return null; // flag for conversion
  }
  return num;
}
```

### Database Addition

Add a `permit_metadata` JSONB column to the `opportunities` table:

```sql
ALTER TABLE opportunities ADD COLUMN permit_metadata JSONB;
```

This keeps the main table schema clean while allowing permit-specific fields (valuation, square footage, permit number, etc.) to be stored and queried.

### Coordinate Conversion Note

San Antonio's CSV uses State Plane coordinates (Texas South Central Zone, EPSG:2278), not standard lat/lng. The values look like `X_COORD: 2076498.5, Y_COORD: 13708187.9`. These need to be converted to WGS84 (standard lat/lng) using proj4js:

```javascript
import proj4 from 'proj4';

// Define Texas South Central State Plane (NAD83, US Feet)
proj4.defs('EPSG:2278', '+proj=lcc +lat_1=28.38333333333333 +lat_2=30.28333333333333 +lat_0=27.83333333333333 +lon_0=-99 +x_0=600000 +y_0=4000000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=us-ft +no_defs');

function statePlaneToLatLng(x, y) {
  const [lng, lat] = proj4('EPSG:2278', 'EPSG:4326', [x, y]);
  return { lat, lng };
}

// Example: statePlaneToLatLng(2076498.5, 13708187.9) 
// Should return approximately { lat: 29.47, lng: -98.67 }
```

Install: `npm install proj4`

Austin's Socrata API returns standard lat/lng, so no conversion needed there.

---

## Match Scoring for Permits

Permits get a modified scoring algorithm because they carry stronger signals:

```
Trade Alignment (0-40 points):
  - Permit type matches user's trade directly (e.g., Electrical Permit + Electrical sub) = 40
  - Permit is a building permit that always needs user's trade (e.g., New Building + any sub) = 30
  - Permit is a remodel that sometimes needs user's trade = 20
  - Tangential match = 10

Project Value (0-25 points):
  - > $1M = 25
  - $500K - $1M = 20
  - $200K - $500K = 15
  - $100K - $200K = 10
  - $50K - $100K = 5

Distance (0-20 points):
  - 0-10 mi = 20
  - 10-25 mi = 15
  - 25-50 mi = 10
  - 50+ mi = 5

Recency (0-15 points):
  - Filed in last 7 days = 15
  - Filed in last 30 days = 12
  - Filed in last 90 days = 8
  - Older = 3
```

Permits naturally score higher than Google Places cards because they represent confirmed projects. This is correct -- they should float to the top of the feed.

---

## Feed Integration

### Priority Order in the Daily Feed

When mixing sources, display in this order:
1. **Permit cards** (highest signal -- active projects with real money)
2. **Public bid cards** (when added later -- active solicitations with deadlines)
3. **Google Places company cards** (potential clients)
4. **LinkedIn people cards** (potential contacts)

Within each group, sort by match score descending.

### "NEW" Badge Logic for Permits

A permit card gets the "NEW" badge if:
- The `DATE ISSUED` or `DATE SUBMITTED` is within the last 14 days, AND
- The user hasn't seen this card before

Permits stay relevant longer than Google Places results because they represent active projects with timelines.

### Deduplication

One physical project can generate multiple permit rows (building permit, electrical permit, mechanical permit, plumbing permit all for the same address and project). Group these by address + approximate date range. Show the primary building permit as the card, and note "3 related trade permits" as a detail line. This avoids flooding the feed with 4 cards for the same project.

Dedup logic:
```sql
-- Group permits that share the same address and were submitted within 30 days of each other
-- Use the row with the highest DECLARED VALUATION as the primary card
-- Store related permit numbers in the permit_metadata JSONB
```

---

## Future: ESBD (Texas State Bids)

The Texas Electronic State Business Daily (ESBD) at txsmartbuy.gov/esbd lists all state agency solicitations valued at $25,000+. This includes construction bids from TxDOT, state universities, state agencies, and more.

ESBD does not have a public API but the solicitation search page can be scraped. Key fields:
- Agency name
- Solicitation title and description
- Posted date and closing date
- Estimated value (sometimes)
- Category (construction, maintenance, etc.)
- Attached bid documents (PDFs)

This would be a separate source (`source = 'bid_board'`) with the purple badge. Save for Phase 4 per the main Opportunities spec. When built, ESBD cards would include a countdown to the bid closing date as a urgency indicator.

---

## Build Order for This Source

### Step 1: CSV Fetch + Parse
- [ ] Create Supabase Edge Function `fetch-permits-sa`
- [ ] Download San Antonio permits CSV
- [ ] Parse with papaparse, filter commercial permits above valuation threshold
- [ ] Handle State Plane to WGS84 coordinate conversion (proj4)
- [ ] Deduplicate by permit number against existing `opportunities` rows
- [ ] Group related permits by address + date proximity

### Step 2: Insert into Opportunities
- [ ] Add `permit_metadata JSONB` column to `opportunities` table
- [ ] Map parsed permit data to `opportunities` row format
- [ ] Calculate match score using permit-specific algorithm
- [ ] Calculate distance from user's center point
- [ ] Insert new rows with `source = 'permit'`, `card_type = 'company'`

### Step 3: Permit Card UI
- [ ] Create `PermitCard` component variant (or extend `OpportunityCard` with permit-specific layout)
- [ ] Display: permit type, project value, square footage, address, distance, applicant, dates, permit number
- [ ] Orange "PERMIT" source badge (already defined in design system)
- [ ] "Find GC" button (v1: just a Google search link for the applicant/address)
- [ ] Same Save/Skip/Reach Out actions as other cards

### Step 4: Cron Schedule
- [ ] Set up pg_cron or Vercel Cron to run `fetch-permits-sa` daily at 6 AM CT
- [ ] Log fetch results (how many new permits found, how many inserted)
- [ ] Alert if fetch fails (CSV URL changed, format changed, etc.)

### Step 5: Expand to Austin
- [ ] Create `fetch-permits-austin` Edge Function
- [ ] Use Socrata API with SoQL query filtering (no CSV download needed)
- [ ] Same insert/scoring/dedup logic
- [ ] Austin uses standard lat/lng -- no coordinate conversion needed

### Step 6: Settings Integration
- [ ] Add "Permit Data" source toggle to Opportunities settings panel
- [ ] Add "Minimum project value" slider/input (default $50K)
- [ ] Show active cities: "San Antonio ✓  Austin ✓  Houston (coming soon)"
- [ ] Allow user to enable/disable permit source independently of Google Places

---

## Cost

Zero. All data sources listed here are public, free, and published under open data licenses. The only cost is compute for the Edge Function cron job and storage for the permit rows in Supabase, both negligible.

This is a significant competitive advantage. Tools like SmatLeads charge for lead data. Your permit leads are free, higher quality, and represent confirmed commercial projects with real budgets attached.
