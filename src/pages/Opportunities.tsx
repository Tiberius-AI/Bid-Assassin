/**
 * Opportunities — The Prospector (Phase 1: static UI with mock data)
 * Phase 2 will swap MOCK_OPPORTUNITIES for live Supabase + Google API calls.
 */
import { useState, useMemo } from "react";
import { useSession } from "@/context/SessionContext";
import {
  Building2, User, Star, Phone, Globe, MapPin,
  Bookmark, X, MessageSquare, Mail, Smartphone,
  Copy, Check, ExternalLink, Lock, Zap,
  SlidersHorizontal, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type CardType = "company" | "person";
type OppStatus =
  | "new" | "saved" | "dismissed" | "reached_out"
  | "responded" | "proposal_sent" | "won" | "lost";
type OutreachChannel = "email" | "sms" | "phone" | "linkedin";

interface Opportunity {
  id: string;
  card_type: CardType;
  // Company fields
  business_name?: string;
  business_type?: string;
  business_category?: string;
  address?: string;
  distance_miles?: number;
  phone?: string;
  website?: string;
  google_rating?: number;
  google_reviews?: number;
  // Person fields
  person_name?: string;
  person_title?: string;
  person_company?: string;
  linkedin_url?: string;
  person_location?: string;
  // Shared
  match_score: number;
  match_reason: string;
  status: OppStatus;
  is_new: boolean;
}

// ─────────────────────────────────────────────────────────────
// Rotation strip data
// ─────────────────────────────────────────────────────────────

const ROTATION = [
  { day: "Mon", company: "General Contractors",      people: "Construction PMs" },
  { day: "Tue", company: "Property Management",      people: "Facilities Directors" },
  { day: "Wed", company: "Commercial Developers",    people: "Development PMs" },
  { day: "Thu", company: "Schools & Institutions",   people: "Supt. / Maintenance" },
  { day: "Fri", company: "Hotels & Hospitality",     people: "Property Managers" },
  { day: "Sat", company: "Facility Maintenance",     people: "Estimators" },
  { day: "Sun", company: "HOA & Auto Dealers",       people: "VP Construction" },
];
// Mon=0 … Sun=6 (aligned to ROTATION array)
const DOW = new Date().getDay(); // 0=Sun … 6=Sat
const TODAY_IDX = DOW === 0 ? 6 : DOW - 1;

// ─────────────────────────────────────────────────────────────
// Mock data  (San Antonio / Central Texas, electrical trade)
// ─────────────────────────────────────────────────────────────

const MOCK: Opportunity[] = [
  // ── Company cards ──────────────────────────────────────────
  {
    id: "c1", card_type: "company",
    business_name: "Guido Construction Co.",
    business_type: "General Contractor", business_category: "General Contractors",
    address: "8800 Village Dr, San Antonio, TX", distance_miles: 8.2,
    phone: "(210) 824-7700", website: "guidoconstruction.com",
    google_rating: 4.3, google_reviews: 47,
    match_score: 94,
    match_reason: "Active GC within 10mi — high demand for electrical subs on commercial builds",
    status: "new", is_new: true,
  },
  {
    id: "c2", card_type: "company",
    business_name: "Kopplow Construction",
    business_type: "General Contractor", business_category: "General Contractors",
    address: "430 Loop 337, New Braunfels, TX", distance_miles: 22.4,
    phone: "(830) 620-5600", website: "kopplowconstruction.com",
    google_rating: 4.7, google_reviews: 63,
    match_score: 88,
    match_reason: "Regional GC with strong commercial portfolio — hires electrical subs regularly",
    status: "saved", is_new: false,
  },
  {
    id: "c3", card_type: "company",
    business_name: "JMJ Property Management",
    business_type: "Property Management", business_category: "Property Management",
    address: "12707 Silicon Dr, San Antonio, TX", distance_miles: 3.1,
    phone: "(210) 545-9595", website: "jmjproperty.com",
    google_rating: 4.1, google_reviews: 28,
    match_score: 81,
    match_reason: "Manages 40+ commercial properties — ongoing electrical maintenance contracts",
    status: "new", is_new: true,
  },
  {
    id: "c4", card_type: "company",
    business_name: "Zachry Construction",
    business_type: "Commercial Developer", business_category: "Commercial Developers",
    address: "527 Logwood Ave, San Antonio, TX", distance_miles: 12.7,
    phone: "(210) 588-5000", website: "zachryconstruction.com",
    google_rating: 4.5, google_reviews: 112,
    match_score: 91,
    match_reason: "Major commercial builder — active projects in medical and industrial sectors",
    status: "reached_out", is_new: false,
  },
  {
    id: "c5", card_type: "company",
    business_name: "North East ISD Facilities",
    business_type: "School District", business_category: "Schools & Institutions",
    address: "8961 Tesoro Dr, San Antonio, TX", distance_miles: 11.3,
    phone: "(210) 407-0000", website: "neisd.net",
    google_rating: 3.9, google_reviews: 18,
    match_score: 77,
    match_reason: "ISD with active capital improvement program — bids electrical work annually",
    status: "new", is_new: true,
  },
  {
    id: "c6", card_type: "company",
    business_name: "Marriott Rivercenter",
    business_type: "Hotel", business_category: "Hotels & Hospitality",
    address: "101 Bowie St, San Antonio, TX", distance_miles: 4.8,
    phone: "(210) 223-1000", website: "marriott.com",
    google_rating: 4.4, google_reviews: 2841,
    match_score: 72,
    match_reason: "Large hotel with regular facility upgrades — uses local electrical contractors",
    status: "new", is_new: true,
  },
  {
    id: "c7", card_type: "company",
    business_name: "Embrey Partners",
    business_type: "Multifamily Developer", business_category: "Commercial Developers",
    address: "2100 Raven Hill, San Antonio, TX", distance_miles: 6.9,
    phone: "(210) 737-2000", website: "embreypartners.com",
    google_rating: 4.2, google_reviews: 34,
    match_score: 86,
    match_reason: "Active multifamily developer — regularly bids out electrical to local subs",
    status: "new", is_new: false,
  },

  // ── Person cards ───────────────────────────────────────────
  {
    id: "p1", card_type: "person",
    person_name: "Maria Rodriguez", person_title: "Construction Project Manager",
    person_company: "DPR Construction",
    linkedin_url: "https://www.linkedin.com/in/",
    person_location: "San Antonio, TX",
    match_score: 89,
    match_reason: "PM at DPR managing $40M+ commercial builds — actively sourcing electrical subs",
    status: "new", is_new: true,
  },
  {
    id: "p2", card_type: "person",
    person_name: "James Wilson", person_title: "Director of Facilities",
    person_company: "USAA",
    linkedin_url: "https://www.linkedin.com/in/",
    person_location: "San Antonio, TX",
    match_score: 83,
    match_reason: "Facilities director overseeing 5 campuses — controls electrical maintenance vendors",
    status: "new", is_new: true,
  },
  {
    id: "p3", card_type: "person",
    person_name: "David Martinez", person_title: "Commercial Superintendent",
    person_company: "Manhattan Construction",
    linkedin_url: "https://www.linkedin.com/in/",
    person_location: "San Antonio, TX",
    match_score: 91,
    match_reason: "Superintendent on 3 active SA commercial projects — direct sub contact",
    status: "new", is_new: true,
  },
  {
    id: "p4", card_type: "person",
    person_name: "Sarah Chen", person_title: "VP of Construction",
    person_company: "GrayStreet Partners",
    linkedin_url: "https://www.linkedin.com/in/",
    person_location: "San Antonio, TX",
    match_score: 76,
    match_reason: "Decision maker at active developer — oversees sub selection on all projects",
    status: "new", is_new: false,
  },
  {
    id: "p5", card_type: "person",
    person_name: "Robert Taylor", person_title: "Chief Estimator",
    person_company: "Bartlett Cocke General Contractors",
    linkedin_url: "https://www.linkedin.com/in/",
    person_location: "San Antonio, TX",
    match_score: 87,
    match_reason: "Estimator at top SA GC — manages sub invitations for bid on all projects",
    status: "new", is_new: true,
  },
];

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const ALL_TRADES = [
  "Electrical", "Plumbing", "HVAC", "Mechanical", "Roofing", "Drywall",
  "Painting", "Flooring", "Carpentry", "Framing", "Concrete", "Masonry",
  "Excavation", "General Contractor", "Glazing", "Fire Protection",
  "Janitorial", "Landscaping", "Security Systems",
];

const PIPELINE_STAGES: OppStatus[] = [
  "saved", "reached_out", "responded", "proposal_sent", "won", "lost",
];

const STATUS_META: Record<OppStatus, { label: string; color: string }> = {
  new:           { label: "New",           color: "text-blue-600 bg-blue-50" },
  saved:         { label: "Saved",         color: "text-yellow-700 bg-yellow-50" },
  dismissed:     { label: "Dismissed",     color: "text-gray-500 bg-gray-50" },
  reached_out:   { label: "Reached Out",   color: "text-purple-700 bg-purple-50" },
  responded:     { label: "Responded",     color: "text-green-700 bg-green-50" },
  proposal_sent: { label: "Proposal Sent", color: "text-indigo-700 bg-indigo-50" },
  won:           { label: "Won",           color: "text-emerald-700 bg-emerald-50" },
  lost:          { label: "Lost",          color: "text-red-700 bg-red-50" },
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function scoreColor(score: number) {
  if (score >= 90) return "text-green-700 bg-green-50 border-green-200";
  if (score >= 75) return "text-amber-700 bg-amber-50 border-amber-200";
  return "text-gray-600 bg-gray-50 border-gray-200";
}

function buildTemplate(
  channel: OutreachChannel,
  target: Opportunity,
  userName: string,
  companyName: string,
  trade: string,
  city: string,
): { subject?: string; body: string } {
  const first =
    target.card_type === "person"
      ? (target.person_name?.split(" ")[0] ?? "there")
      : "there";
  const theirCo =
    target.card_type === "company"
      ? (target.business_name ?? "")
      : (target.person_company ?? "");

  switch (channel) {
    case "email":
      return {
        subject: `${trade} Contractor Available for Upcoming Projects`,
        body: `Hi ${first},\n\nThis is ${userName} with ${companyName} — we're a licensed commercial ${trade} contractor based in ${city}.\n\nWe handle ${trade.toLowerCase()} work for commercial projects and are currently booking for the coming months.\n\nIf you have any upcoming projects that need ${trade} bids, we'd welcome the opportunity to submit a proposal. Happy to send references and recent project examples.\n\nBest,\n${userName}`,
      };
    case "sms":
      return {
        body: `Hi ${first}, this is ${userName} with ${companyName}. We're a commercial ${trade} contractor in ${city}. If you have upcoming projects needing ${trade} bids, we'd love to submit a proposal. Can I send some info?`,
      };
    case "phone":
      return {
        body: `"Hi, my name is ${userName} with ${companyName}. We're a commercial ${trade} contractor here in ${city}.\n\nI'm reaching out to introduce ourselves — we specialize in ${trade.toLowerCase()} work for commercial projects.\n\nAre you currently accepting bids from ${trade.toLowerCase()} subcontractors on any upcoming projects?\n\n[If yes] Great — what's the best way to get project details so we can put a bid together?\n[If no] No problem. Would it be alright if I sent over our company info for future projects?"`,
      };
    case "linkedin":
      return {
        body: `Hi ${first}, I'm ${userName} with ${companyName} — we're a commercial ${trade} contractor in the ${city} area. Saw you're with ${theirCo} and wanted to connect. If you ever need ${trade.toLowerCase()} bids on upcoming projects, we'd welcome the chance to earn your business. Happy to send references.`,
      };
  }
}

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────

export default function Opportunities() {
  const { profile, company } = useSession();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const co = company as any;
  const userName    = profile?.full_name || "Your Name";
  const companyName = co?.name || "Your Company";
  const city        = co?.city || co?.address?.split(",")[1]?.trim() || "San Antonio";

  // UI state
  const [view,          setView]          = useState<"feed" | "pipeline">("feed");
  const [activeFilter,  setActiveFilter]  = useState("all");
  const [settingsOpen,  setSettingsOpen]  = useState(false);
  const [outreachTarget, setOutreachTarget] = useState<Opportunity | null>(null);
  const [outreachChannel, setOutreachChannel] = useState<OutreachChannel>("email");
  const [copiedId,      setCopiedId]      = useState<string | null>(null);

  // Persisted-to-Supabase in Phase 2, local in Phase 1
  const [statuses,       setStatuses]      = useState<Record<string, OppStatus>>({});
  const [radius,         setRadius]        = useState(50);
  const [selectedTrades, setSelectedTrades] = useState<string[]>(["Electrical"]);

  const primaryTrade = selectedTrades[0] || "Electrical";

  // Merge local status overrides with mock seed
  const opps = useMemo(
    () => MOCK.map((o) => ({ ...o, status: statuses[o.id] ?? o.status })),
    [statuses],
  );

  const updateStatus = (id: string, s: OppStatus) =>
    setStatuses((prev) => ({ ...prev, [id]: s }));

  // Derived counts
  const visible      = opps.filter((o) => o.status !== "dismissed");
  const newCount     = visible.filter((o) => o.status === "new").length;
  const savedCount   = opps.filter((o) => o.status === "saved").length;
  const companyCount = visible.filter((o) => o.card_type === "company").length;
  const personCount  = visible.filter((o) => o.card_type === "person").length;

  const feedItems = useMemo(() => {
    const items = opps.filter((o) => o.status !== "dismissed");
    if (activeFilter === "saved")     return items.filter((o) => o.status === "saved");
    if (activeFilter === "companies") return items.filter((o) => o.card_type === "company");
    if (activeFilter === "people")    return items.filter((o) => o.card_type === "person");
    return items;
  }, [opps, activeFilter]);

  const pipelineItems = opps.filter((o) => PIPELINE_STAGES.includes(o.status));

  const won     = opps.filter((o) => o.status === "won").length;
  const decided = opps.filter((o) => o.status === "won" || o.status === "lost").length;
  const winRate = decided > 0 ? Math.round((won / decided) * 100) : 0;

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const openOutreach = (opp: Opportunity, channel: OutreachChannel = "email") => {
    setOutreachTarget(opp);
    setOutreachChannel(channel);
  };

  const template = outreachTarget
    ? buildTemplate(outreachChannel, outreachTarget, userName, companyName, primaryTrade, city)
    : null;

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">

      {/* ── Sticky header ───────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200">

        {/* Title row */}
        <div className="flex items-center justify-between px-4 lg:px-6 pt-5 pb-3">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-gray-900">Opportunities</h1>
              {newCount > 0 && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-600 text-white">
                  {newCount} new today
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-0.5">
              Fresh leads within {radius} miles of your service area
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Feed / Pipeline toggle */}
            <div className="hidden sm:flex rounded-lg border border-gray-200 p-0.5 bg-gray-50 text-sm">
              {(["feed", "pipeline"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-3 py-1.5 rounded-md font-medium capitalize transition-colors ${
                    view === v
                      ? "bg-white shadow-sm text-gray-900"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {v}{v === "pipeline" && pipelineItems.length > 0 ? ` (${pipelineItems.length})` : ""}
                </button>
              ))}
            </div>

            <button
              onClick={() => setSettingsOpen(!settingsOpen)}
              className={`p-2 rounded-lg border transition-colors ${
                settingsOpen
                  ? "border-red-300 bg-red-50 text-red-600"
                  : "border-gray-200 text-gray-500 hover:text-gray-700 hover:bg-gray-50"
              }`}
            >
              <SlidersHorizontal className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Rotation strip */}
        <div className="overflow-x-auto px-4 lg:px-6 pb-3">
          <div className="flex gap-2 min-w-max">
            {ROTATION.map((r, i) => (
              <div
                key={r.day}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  i === TODAY_IDX
                    ? "bg-red-600 text-white border-red-600"
                    : "bg-gray-50 text-gray-500 border-gray-200"
                }`}
              >
                <span className="font-bold">{r.day}</span>
                <span className={`ml-1.5 ${i === TODAY_IDX ? "text-red-100" : "text-gray-400"}`}>
                  {r.company}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Filter chips — feed only */}
        {view === "feed" && (
          <div className="overflow-x-auto px-4 lg:px-6 pb-3">
            <div className="flex gap-2 min-w-max">
              {[
                { key: "all",       label: `All (${visible.length})` },
                { key: "saved",     label: `Saved (${savedCount})` },
                { key: "companies", label: `Companies (${companyCount})` },
                { key: "people",    label: `People (${personCount})` },
              ].map((f) => (
                <button
                  key={f.key}
                  onClick={() => setActiveFilter(f.key)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    activeFilter === f.key
                      ? "bg-gray-900 text-white border-gray-900"
                      : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Settings panel ──────────────────────────────────── */}
      {settingsOpen && (
        <div className="border-b border-gray-200 bg-gray-50 px-4 lg:px-6 py-5 space-y-5">
          {/* Radius slider */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-medium text-gray-700">Service Radius</label>
              <span className="text-sm font-bold text-red-600">{radius} miles</span>
            </div>
            <Slider
              value={[radius]} min={10} max={150} step={5}
              onValueChange={([v]) => setRadius(v)}
              className="max-w-sm"
            />
          </div>

          {/* Trade picker */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">Your Trade(s)</label>
            <div className="flex flex-wrap gap-2">
              {ALL_TRADES.map((t) => (
                <button
                  key={t}
                  onClick={() =>
                    setSelectedTrades((prev) =>
                      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
                    )
                  }
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    selectedTrades.includes(t)
                      ? "bg-red-600 text-white border-red-600"
                      : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Source indicators */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">Data Sources</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                { name: "Google Places",             status: "active",  label: "Active" },
                { name: "LinkedIn (via Google)",      status: "active",  label: "Active" },
                { name: "SAM.gov Federal Contracts",  status: "pending", label: "IRS Verification Pending" },
                { name: "Building Permits",           status: "soon",    label: "Coming Soon" },
                { name: "Public Bid Boards",          status: "soon",    label: "Coming Soon" },
              ].map((src) => (
                <div
                  key={src.name}
                  className="flex items-center justify-between p-2.5 bg-white rounded-lg border border-gray-200"
                >
                  <span className="text-xs text-gray-700 font-medium">{src.name}</span>
                  {src.status === "active" && (
                    <span className="text-xs text-green-600 font-semibold flex items-center gap-1">
                      <Zap className="h-3 w-3" /> {src.label}
                    </span>
                  )}
                  {src.status === "pending" && (
                    <span className="text-xs text-amber-600 font-semibold">{src.label}</span>
                  )}
                  {src.status === "soon" && (
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <Lock className="h-3 w-3" /> {src.label}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Main content ─────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 lg:px-6 py-4">

        {/* FEED VIEW */}
        {view === "feed" && (
          <div className="max-w-2xl space-y-3">
            {feedItems.length === 0 && (
              <div className="text-center py-16 text-gray-400">
                <p className="font-medium">No opportunities in this filter</p>
                <p className="text-sm mt-1">Try switching to "All"</p>
              </div>
            )}
            {feedItems.map((opp) => (
              <OppCard
                key={opp.id}
                opp={opp}
                onSave={() =>
                  updateStatus(opp.id, opp.status === "saved" ? "new" : "saved")
                }
                onSkip={() => updateStatus(opp.id, "dismissed")}
                onReachOut={(ch) =>
                  openOutreach(opp, ch ?? (opp.card_type === "person" ? "linkedin" : "email"))
                }
              />
            ))}
          </div>
        )}

        {/* PIPELINE VIEW */}
        {view === "pipeline" && (
          <div className="max-w-2xl space-y-6">
            {pipelineItems.length === 0 && (
              <div className="text-center py-16 text-gray-400">
                <p className="font-medium">No saved leads yet</p>
                <p className="text-sm mt-1">
                  Save opportunities from the Feed to start your pipeline
                </p>
              </div>
            )}
            {PIPELINE_STAGES.map((stage) => {
              const items = pipelineItems.filter((o) => o.status === stage);
              if (items.length === 0) return null;
              const { label, color } = STATUS_META[stage];
              return (
                <div key={stage}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${color}`}>
                      {label}
                    </span>
                    <span className="text-xs text-gray-400">({items.length})</span>
                  </div>
                  <div className="space-y-2">
                    {items.map((opp) => (
                      <div
                        key={opp.id}
                        className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-4 py-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                              opp.card_type === "company" ? "bg-blue-50" : "bg-purple-50"
                            }`}
                          >
                            {opp.card_type === "company"
                              ? <Building2 className="h-4 w-4 text-blue-600" />
                              : <User className="h-4 w-4 text-purple-600" />}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">
                              {opp.card_type === "company" ? opp.business_name : opp.person_name}
                            </p>
                            <p className="text-xs text-gray-500 truncate">
                              {opp.card_type === "company"
                                ? `${opp.business_type} · ${opp.distance_miles}mi`
                                : `${opp.person_title} · ${opp.person_company}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${scoreColor(opp.match_score)}`}>
                            {opp.match_score}%
                          </span>
                          <button
                            onClick={() => openOutreach(opp)}
                            className="text-xs text-red-600 hover:text-red-700 font-medium"
                          >
                            Reach Out
                          </button>
                          <ChevronRight className="h-4 w-4 text-gray-400" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Stats footer */}
        <div className="max-w-2xl mt-8 border-t border-gray-100 pt-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "This Week",       value: opps.length },
              { label: "Saved",           value: savedCount },
              { label: "Proposals Sent",  value: pipelineItems.filter((o) => o.status === "proposal_sent").length },
              { label: "Win Rate",        value: winRate > 0 ? `${winRate}%` : "—" },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <p className="text-2xl font-bold text-gray-900 font-mono">{s.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Outreach drawer ──────────────────────────────────── */}
      {outreachTarget && template && (
        <>
          <div
            className="fixed inset-0 bg-black/30 z-40"
            onClick={() => setOutreachTarget(null)}
          />
          <div className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl shadow-2xl max-h-[80vh] overflow-y-auto">
            {/* Drawer header */}
            <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">Reaching out to</p>
                <p className="font-semibold text-gray-900 text-sm">
                  {outreachTarget.card_type === "company"
                    ? outreachTarget.business_name
                    : outreachTarget.person_name}
                </p>
              </div>
              <button
                onClick={() => setOutreachTarget(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Channel tabs */}
              <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                {(["email", "sms", "phone", "linkedin"] as OutreachChannel[]).map((ch) => {
                  // Hide LinkedIn tab for company cards (no profile URL)
                  if (ch === "linkedin" && outreachTarget.card_type === "company") return null;
                  const Icon = {
                    email: Mail, sms: Smartphone, phone: Phone, linkedin: ExternalLink,
                  }[ch];
                  return (
                    <button
                      key={ch}
                      onClick={() => setOutreachChannel(ch)}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-medium capitalize transition-colors ${
                        outreachChannel === ch
                          ? "bg-white shadow-sm text-gray-900"
                          : "text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {ch}
                    </button>
                  );
                })}
              </div>

              {/* Subject (email only) */}
              {outreachChannel === "email" && template.subject && (
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Subject
                  </label>
                  <p className="text-sm text-gray-900 mt-1 font-medium">{template.subject}</p>
                </div>
              )}

              {/* Body */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {outreachChannel === "phone" ? "Phone Script" : "Message"}
                </label>
                <div className="mt-1 bg-gray-50 rounded-lg p-3 text-sm text-gray-700 whitespace-pre-wrap border border-gray-200 leading-relaxed">
                  {template.body}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 pb-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() =>
                    handleCopy(
                      (outreachChannel === "email" && template.subject
                        ? `Subject: ${template.subject}\n\n`
                        : "") + template.body,
                      outreachTarget.id,
                    )
                  }
                >
                  {copiedId === outreachTarget.id
                    ? <><Check className="h-3.5 w-3.5 mr-1.5 text-green-600" /> Copied!</>
                    : <><Copy className="h-3.5 w-3.5 mr-1.5" /> Copy</>}
                </Button>

                {outreachChannel === "email" && (
                  <Button
                    size="sm"
                    className="flex-1 bg-red-600 hover:bg-red-700"
                    onClick={() => {
                      window.open(
                        `mailto:?subject=${encodeURIComponent(template.subject ?? "")}&body=${encodeURIComponent(template.body)}`,
                      );
                      updateStatus(outreachTarget.id, "reached_out");
                      setOutreachTarget(null);
                    }}
                  >
                    Open Email App <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                  </Button>
                )}
                {outreachChannel === "sms" && (
                  <Button
                    size="sm"
                    className="flex-1 bg-red-600 hover:bg-red-700"
                    onClick={() => {
                      window.open(`sms:?body=${encodeURIComponent(template.body)}`);
                      updateStatus(outreachTarget.id, "reached_out");
                      setOutreachTarget(null);
                    }}
                  >
                    Open Messages <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                  </Button>
                )}
                {outreachChannel === "phone" && outreachTarget.phone && (
                  <a
                    href={`tel:${outreachTarget.phone}`}
                    className="flex-1"
                    onClick={() => {
                      updateStatus(outreachTarget.id, "reached_out");
                      setOutreachTarget(null);
                    }}
                  >
                    <Button size="sm" className="w-full bg-red-600 hover:bg-red-700">
                      Call {outreachTarget.phone} <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                    </Button>
                  </a>
                )}
                {outreachChannel === "linkedin" && outreachTarget.linkedin_url && (
                  <Button
                    size="sm"
                    className="flex-1 bg-[#0A66C2] hover:bg-[#004182]"
                    onClick={() => {
                      window.open(outreachTarget.linkedin_url, "_blank");
                      updateStatus(outreachTarget.id, "reached_out");
                      setOutreachTarget(null);
                    }}
                  >
                    Open LinkedIn <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Opportunity card (company + person variants)
// ─────────────────────────────────────────────────────────────

function OppCard({
  opp,
  onSave,
  onSkip,
  onReachOut,
}: {
  opp: Opportunity;
  onSave: () => void;
  onSkip: () => void;
  onReachOut: (channel?: OutreachChannel) => void;
}) {
  const isSaved = opp.status === "saved";

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-shadow p-4">
      {/* Header row */}
      <div className="flex items-start gap-3">
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
            opp.card_type === "company" ? "bg-blue-50" : "bg-purple-50"
          }`}
        >
          {opp.card_type === "company"
            ? <Building2 className="h-5 w-5 text-blue-600" />
            : <User className="h-5 w-5 text-purple-600" />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              {opp.is_new && opp.status === "new" && (
                <span className="inline-block text-[10px] font-bold bg-red-600 text-white px-1.5 py-0.5 rounded mr-1.5 align-middle">
                  NEW
                </span>
              )}
              <span className="font-semibold text-gray-900 text-sm">
                {opp.card_type === "company" ? opp.business_name : opp.person_name}
              </span>
            </div>
            <span className={`flex-shrink-0 text-xs font-bold px-2 py-0.5 rounded-full border ${scoreColor(opp.match_score)}`}>
              {opp.match_score}%
            </span>
          </div>

          {/* Subtitle */}
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            {opp.card_type === "company" ? (
              <>
                <span className="text-xs text-gray-500">{opp.business_type}</span>
                <span className="text-gray-300">·</span>
                <span className="text-xs text-gray-500">{opp.distance_miles}mi</span>
                <span className="text-gray-300">·</span>
                <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                  Google
                </span>
              </>
            ) : (
              <>
                <span className="text-xs text-gray-500">{opp.person_title}</span>
                <span className="text-gray-300">·</span>
                <span className="text-xs text-gray-500">{opp.person_company}</span>
                <span className="text-gray-300">·</span>
                <span className="text-[10px] font-semibold text-[#0A66C2] bg-blue-50 px-1.5 py-0.5 rounded">
                  LinkedIn
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Company details */}
      {opp.card_type === "company" && (
        <div className="mt-3 space-y-1.5">
          {opp.google_rating !== undefined && (
            <div className="flex items-center gap-1.5">
              <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400 flex-shrink-0" />
              <span className="text-xs text-gray-600">
                {opp.google_rating} ({opp.google_reviews?.toLocaleString()} reviews)
              </span>
            </div>
          )}
          {opp.address && (
            <div className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
              <span className="text-xs text-gray-500">{opp.address}</span>
            </div>
          )}
          <div className="flex items-center gap-3 flex-wrap">
            {opp.phone && (
              <a
                href={`tel:${opp.phone}`}
                className="flex items-center gap-1 text-xs text-gray-600 hover:text-red-600 transition-colors"
              >
                <Phone className="h-3.5 w-3.5" /> {opp.phone}
              </a>
            )}
            {opp.website && (
              <a
                href={`https://${opp.website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-gray-600 hover:text-red-600 transition-colors"
              >
                <Globe className="h-3.5 w-3.5" /> {opp.website}
              </a>
            )}
          </div>
        </div>
      )}

      {/* Person details */}
      {opp.card_type === "person" && (
        <div className="mt-3 space-y-1.5">
          {opp.person_location && (
            <div className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
              <span className="text-xs text-gray-500">{opp.person_location}</span>
            </div>
          )}
          {opp.linkedin_url && (
            <a
              href={opp.linkedin_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-[#0A66C2] hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" /> View on LinkedIn
            </a>
          )}
        </div>
      )}

      {/* Match reason */}
      <div className="mt-3 bg-gray-50 rounded-lg px-3 py-2">
        <p className="text-xs text-gray-600 italic">{opp.match_reason}</p>
      </div>

      {/* Action buttons */}
      <div className="mt-3 flex gap-2">
        <button
          onClick={onSkip}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <X className="h-3.5 w-3.5" /> Skip
        </button>
        <button
          onClick={onSave}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-lg transition-colors ${
            isSaved
              ? "border-yellow-300 bg-yellow-50 text-yellow-700"
              : "border-gray-200 text-gray-600 hover:bg-gray-50"
          }`}
        >
          <Bookmark className={`h-3.5 w-3.5 ${isSaved ? "fill-yellow-400 text-yellow-400" : ""}`} />
          {isSaved ? "Saved" : "Save"}
        </button>
        <button
          onClick={() => onReachOut()}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
        >
          <MessageSquare className="h-3.5 w-3.5" /> Reach Out
        </button>
      </div>
    </div>
  );
}
