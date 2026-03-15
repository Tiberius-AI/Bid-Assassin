/**
 * Opportunities — The Prospector (Phase 2: live Google Places + LinkedIn data)
 */
import { useState, useMemo } from "react";
import { useSession } from "@/context/SessionContext";
import {
  Building2, User, Star, Phone, Globe, MapPin,
  Bookmark, X, MessageSquare, Mail, Smartphone,
  Copy, Check, ExternalLink, Lock, Zap,
  SlidersHorizontal, ChevronRight, RefreshCw, Loader2, Search,
  ClipboardList, DollarSign, Ruler, Calendar, HardHat,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useOpportunities, type DbOpportunity, type OppStatus, type PermitMetadata } from "@/hooks/useOpportunities";
import { useAustinPermits } from "@/hooks/useAustinPermits";

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

type OutreachChannel = "email" | "sms" | "phone" | "linkedin";

const ROTATION = [
  { day: "Mon", company: "General Contractors",      people: "Construction PMs" },
  { day: "Tue", company: "Property Management",      people: "Facilities Directors" },
  { day: "Wed", company: "Commercial Developers",    people: "Development PMs" },
  { day: "Thu", company: "Schools & Institutions",   people: "Supt. / Maintenance" },
  { day: "Fri", company: "Hotels & Hospitality",     people: "Property Managers" },
  { day: "Sat", company: "Facility Maintenance",     people: "Estimators" },
  { day: "Sun", company: "HOA & Auto Dealers",       people: "VP Construction" },
];
const DOW = new Date().getDay();
const TODAY_IDX = DOW === 0 ? 6 : DOW - 1;

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
  target: DbOpportunity,
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

  const userName    = profile?.full_name || "Your Name";
  const companyName = company?.name       || "Your Company";
  const city        = company?.city       || company?.state || "your area";

  const {
    opportunities,
    settings,
    loading,
    generating,
    error,
    generate,
    saveSettings,
    updateStatus,
  } = useOpportunities(company?.id);

  // Austin permits — fetched client-side, merged into the feed
  const {
    permits: austinPermits,
    refresh: refreshAustinPermits,
  } = useAustinPermits(company?.id, settings);

  // UI state
  const [view,           setView]           = useState<"feed" | "pipeline">("feed");
  const [activeFilter,   setActiveFilter]   = useState("all");
  const [settingsOpen,   setSettingsOpen]   = useState(false);
  const [outreachTarget, setOutreachTarget] = useState<DbOpportunity | null>(null);
  const [outreachChannel, setOutreachChannel] = useState<OutreachChannel>("email");
  const [copiedId,       setCopiedId]       = useState<string | null>(null);

  // Local settings state (synced from DB via hook)
  const [localRadius, setLocalRadius]   = useState(50);
  const [localTrades, setLocalTrades]   = useState<string[]>([]);
  const [localPermitsEnabled, setLocalPermitsEnabled]     = useState(true);
  const [localPermitMinValue, setLocalPermitMinValue]     = useState(50000);
  const settingsLoaded                  = settings !== null;

  // Sync from DB settings once loaded
  if (settingsLoaded && localTrades.length === 0 && settings.trades.length > 0) {
    setLocalTrades(settings.trades);
    setLocalRadius(settings.radius_miles);
    setLocalPermitsEnabled(settings.permits_enabled);
    setLocalPermitMinValue(settings.permit_min_valuation);
  }

  const primaryTrade = localTrades[0] || company?.trades?.[0] || "General";

  // Merge DB opportunities with client-side Austin permits (deduplicate by source_id)
  const dbSourceIds = new Set(opportunities.map((o) => o.source_id).filter(Boolean));
  const newAustinPermits = austinPermits.filter((p) => !dbSourceIds.has(p.source_id));
  console.log(`[Opportunities] DB opps: ${opportunities.length} | Austin permits: ${austinPermits.length} | new after dedup: ${newAustinPermits.length}`);
  const visible = [...opportunities, ...newAustinPermits];
  const newCount     = visible.filter((o) => o.status === "new").length;
  const savedCount   = visible.filter((o) => o.status === "saved").length;
  const companyCount = visible.filter((o) => o.card_type === "company" && o.source !== "permit").length;
  const personCount  = visible.filter((o) => o.card_type === "person").length;
  const permitCount  = visible.filter((o) => o.source === "permit").length;

  const feedItems = useMemo(() => {
    if (activeFilter === "saved")     return visible.filter((o) => o.status === "saved");
    if (activeFilter === "permits")   return visible.filter((o) => o.source === "permit");
    if (activeFilter === "companies") return visible.filter((o) => o.card_type === "company" && o.source !== "permit");
    if (activeFilter === "people")    return visible.filter((o) => o.card_type === "person");
    return visible;
  }, [visible, activeFilter]);

  const pipelineItems = opportunities.filter((o) => PIPELINE_STAGES.includes(o.status));

  const won     = opportunities.filter((o) => o.status === "won").length;
  const decided = opportunities.filter((o) => o.status === "won" || o.status === "lost").length;
  const winRate = decided > 0 ? Math.round((won / decided) * 100) : 0;

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const openOutreach = (opp: DbOpportunity, channel?: OutreachChannel) => {
    setOutreachTarget(opp);
    setOutreachChannel(channel ?? (opp.card_type === "person" ? "linkedin" : "email"));
  };

  const handleSaveSettings = async () => {
    await saveSettings({
      trades: localTrades,
      radius_miles: localRadius,
      permits_enabled: localPermitsEnabled,
      permit_min_valuation: localPermitMinValue,
    });
    setSettingsOpen(false);
    generate(true); // regenerate with new settings
    refreshAustinPermits();
  };

  const template = outreachTarget
    ? buildTemplate(outreachChannel, outreachTarget, userName, companyName, primaryTrade, city)
    : null;

  // ── Loading / generating state ─────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Loader2 className="w-6 h-6 text-red-600 animate-spin" />
        <p className="text-sm text-gray-500">Loading your opportunities…</p>
      </div>
    );
  }

  if (generating && opportunities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center px-4">
        <Loader2 className="w-8 h-8 text-red-600 animate-spin" />
        <p className="text-base font-semibold text-gray-900">Finding leads near {city}…</p>
        <p className="text-sm text-gray-500">Searching Google Places + LinkedIn. This takes about 10–15 seconds.</p>
      </div>
    );
  }

  if (error && opportunities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center px-4">
        <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
          <X className="w-6 h-6 text-red-600" />
        </div>
        <p className="text-base font-semibold text-gray-900">Couldn't load opportunities</p>
        <p className="text-sm text-gray-500 max-w-sm">{error}</p>
        <Button onClick={() => generate(true)} className="bg-red-600 hover:bg-red-700 mt-2">
          Try Again
        </Button>
      </div>
    );
  }

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
              {generating && (
                <Loader2 className="h-4 w-4 text-gray-400 animate-spin" />
              )}
            </div>
            <p className="text-sm text-gray-500 mt-0.5">
              Fresh leads within {localRadius} miles of {city}
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

            {/* Refresh */}
            <button
              onClick={() => generate(true)}
              disabled={generating}
              title="Refresh today's leads"
              className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors"
            >
              <RefreshCw className={`h-4 w-4 ${generating ? "animate-spin" : ""}`} />
            </button>

            {/* Settings */}
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
                ...(permitCount > 0 ? [{ key: "permits", label: `Permits (${permitCount})` }] : []),
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
              <span className="text-sm font-bold text-red-600">{localRadius} miles</span>
            </div>
            <Slider
              value={[localRadius]} min={10} max={150} step={5}
              onValueChange={([v]) => setLocalRadius(v)}
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
                    setLocalTrades((prev) =>
                      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
                    )
                  }
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    localTrades.includes(t)
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
                { name: "Building Permits (SA)",      status: "active",  label: "Active" },
                { name: "Building Permits (Austin)",  status: "active",  label: "Active" },
                { name: "Building Permits (Houston)", status: "soon",    label: "Coming Soon" },
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

          {/* Permit settings */}
          <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700">Building Permits</p>
                <p className="text-xs text-gray-500 mt-0.5">San Antonio &amp; Austin commercial permits from open data</p>
              </div>
              <Switch
                checked={localPermitsEnabled}
                onCheckedChange={setLocalPermitsEnabled}
              />
            </div>

            {localPermitsEnabled && (
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs font-medium text-gray-600">Minimum Project Value</label>
                  <span className="text-xs font-bold text-orange-600">
                    {localPermitMinValue >= 1_000_000
                      ? `$${(localPermitMinValue / 1_000_000).toFixed(1)}M`
                      : `$${(localPermitMinValue / 1_000).toFixed(0)}K`}
                  </span>
                </div>
                <Slider
                  value={[localPermitMinValue]}
                  min={25000}
                  max={2000000}
                  step={25000}
                  onValueChange={([v]) => setLocalPermitMinValue(v)}
                  className="max-w-sm"
                />
                <div className="flex justify-between text-[10px] text-gray-400 mt-1 max-w-sm">
                  <span>$25K</span>
                  <span>$500K</span>
                  <span>$1M</span>
                  <span>$2M</span>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button onClick={handleSaveSettings} className="bg-red-600 hover:bg-red-700" disabled={generating}>
              {generating ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Refreshing…</> : "Save & Refresh Feed"}
            </Button>
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* ── Main content ─────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 lg:px-6 py-4">

        {/* FEED VIEW */}
        {view === "feed" && (
          <div className="max-w-2xl space-y-3">
            {generating && opportunities.length > 0 && (
              <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin flex-shrink-0" />
                Finding fresh leads…
              </div>
            )}
            {feedItems.length === 0 && !generating && (
              <div className="text-center py-16 text-gray-400">
                <p className="font-medium">No opportunities in this filter</p>
                <p className="text-sm mt-1">
                  {activeFilter !== "all"
                    ? 'Try switching to "All"'
                    : "Click the refresh button to search for leads"}
                </p>
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
                onReachOut={(ch) => openOutreach(opp, ch)}
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
                              opp.source === "permit" ? "bg-orange-50" : opp.card_type === "company" ? "bg-blue-50" : "bg-purple-50"
                            }`}
                          >
                            {opp.source === "permit"
                              ? <ClipboardList className="h-4 w-4 text-orange-600" />
                              : opp.card_type === "company"
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
              { label: "Today",          value: opportunities.length },
              { label: "Saved",          value: savedCount },
              { label: "Proposals Sent", value: pipelineItems.filter((o) => o.status === "proposal_sent").length },
              { label: "Win Rate",       value: winRate > 0 ? `${winRate}%` : "—" },
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
                  if (ch === "linkedin" && outreachTarget.card_type === "company") return null;
                  const Icon = { email: Mail, sms: Smartphone, phone: Phone, linkedin: ExternalLink }[ch];
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

              {/* Research shortcuts (company cards only) */}
              {outreachTarget.card_type === "company" && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Research</p>
                  <div className="flex gap-2">
                    <a
                      href={`https://www.google.com/search?q=${encodeURIComponent(
                        [outreachTarget.business_name, outreachTarget.address?.split(",").slice(-2).join(",").trim()].filter(Boolean).join(" ")
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1"
                    >
                      <Button variant="outline" size="sm" className="w-full text-gray-600 border-gray-200 hover:bg-gray-50 text-xs">
                        <Search className="h-3.5 w-3.5 mr-1.5" />
                        Google Profile
                      </Button>
                    </a>
                    {outreachTarget.website ? (
                      <a
                        href={outreachTarget.website.startsWith("http") ? outreachTarget.website : `https://${outreachTarget.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1"
                      >
                        <Button variant="outline" size="sm" className="w-full text-gray-600 border-gray-200 hover:bg-gray-50 text-xs">
                          <Globe className="h-3.5 w-3.5 mr-1.5" />
                          Visit Website
                        </Button>
                      </a>
                    ) : (
                      <Button variant="outline" size="sm" className="flex-1 text-xs text-gray-400 border-gray-200" disabled>
                        <Globe className="h-3.5 w-3.5 mr-1.5" />
                        No Website
                      </Button>
                    )}
                    <a
                      href="https://hunter.io/extension"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1"
                      title="Install Hunter.io browser extension to find emails directly from company websites"
                    >
                      <Button variant="outline" size="sm" className="w-full text-gray-600 border-gray-200 hover:bg-gray-50 text-xs">
                        <Mail className="h-3.5 w-3.5 mr-1.5" />
                        Find Email
                      </Button>
                    </a>
                  </div>
                </div>
              )}

              {/* Subject */}
              {outreachChannel === "email" && template.subject && (
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Subject</label>
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
                  variant="outline" size="sm" className="flex-1"
                  onClick={() =>
                    handleCopy(
                      (outreachChannel === "email" && template.subject
                        ? `Subject: ${template.subject}\n\n` : "") + template.body,
                      outreachTarget.id,
                    )
                  }
                >
                  {copiedId === outreachTarget.id
                    ? <><Check className="h-3.5 w-3.5 mr-1.5 text-green-600" /> Copied!</>
                    : <><Copy className="h-3.5 w-3.5 mr-1.5" /> Copy</>}
                </Button>

                {outreachChannel === "email" && (
                  <Button size="sm" className="flex-1 bg-red-600 hover:bg-red-700"
                    onClick={() => {
                      window.open(`mailto:?subject=${encodeURIComponent(template.subject ?? "")}&body=${encodeURIComponent(template.body)}`);
                      updateStatus(outreachTarget.id, "reached_out");
                      setOutreachTarget(null);
                    }}>
                    Open Email App <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                  </Button>
                )}
                {outreachChannel === "sms" && (
                  <Button size="sm" className="flex-1 bg-red-600 hover:bg-red-700"
                    onClick={() => {
                      const digits = (outreachTarget.phone ?? "").replace(/\D/g, "");
                      window.open(`sms:${digits}?&body=${encodeURIComponent(template.body)}`);
                      updateStatus(outreachTarget.id, "reached_out");
                      setOutreachTarget(null);
                    }}>
                    Open Messages <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                  </Button>
                )}
                {outreachChannel === "phone" && outreachTarget.phone && (
                  <a href={`tel:${outreachTarget.phone}`} className="flex-1"
                    onClick={() => { updateStatus(outreachTarget.id, "reached_out"); setOutreachTarget(null); }}>
                    <Button size="sm" className="w-full bg-red-600 hover:bg-red-700">
                      Call {outreachTarget.phone} <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                    </Button>
                  </a>
                )}
                {outreachChannel === "linkedin" && outreachTarget.linkedin_url && (
                  <Button size="sm" className="flex-1 bg-[#0A66C2] hover:bg-[#004182]"
                    onClick={() => {
                      window.open(outreachTarget.linkedin_url!, "_blank");
                      updateStatus(outreachTarget.id, "reached_out");
                      setOutreachTarget(null);
                    }}>
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
// Opportunity card
// ─────────────────────────────────────────────────────────────

function OppCard({
  opp,
  onSave,
  onSkip,
  onReachOut,
}: {
  opp: DbOpportunity;
  onSave: () => void;
  onSkip: () => void;
  onReachOut: (channel?: OutreachChannel) => void;
}) {
  const isSaved = opp.status === "saved";

  const isPermit = opp.source === "permit";
  const pm = opp.permit_metadata as PermitMetadata | null;

  return (
    <div className={`bg-white border rounded-xl shadow-sm hover:shadow-md transition-shadow p-4 ${
      isPermit ? "border-orange-200" : "border-gray-200"
    }`}>
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
          isPermit ? "bg-orange-50" : opp.card_type === "company" ? "bg-blue-50" : "bg-purple-50"
        }`}>
          {isPermit
            ? <ClipboardList className="h-5 w-5 text-orange-600" />
            : opp.card_type === "company"
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
                {isPermit ? (pm?.primary_contact || opp.business_name) : opp.card_type === "company" ? opp.business_name : opp.person_name}
              </span>
            </div>
            <span className={`flex-shrink-0 text-xs font-bold px-2 py-0.5 rounded-full border ${scoreColor(opp.match_score)}`}>
              {opp.match_score}%
            </span>
          </div>

          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            {isPermit ? (
              <>
                <span className="text-xs text-gray-500">{opp.business_type}</span>
                {opp.distance_miles && (
                  <><span className="text-gray-300">·</span><span className="text-xs text-gray-500">{opp.distance_miles}mi</span></>
                )}
                <span className="text-gray-300">·</span>
                <span className="text-[10px] font-bold text-orange-700 bg-orange-50 px-1.5 py-0.5 rounded">PERMIT</span>
              </>
            ) : opp.card_type === "company" ? (
              <>
                <span className="text-xs text-gray-500">{opp.business_type}</span>
                {opp.distance_miles && (
                  <><span className="text-gray-300">·</span><span className="text-xs text-gray-500">{opp.distance_miles}mi</span></>
                )}
                <span className="text-gray-300">·</span>
                <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">Google</span>
              </>
            ) : (
              <>
                <span className="text-xs text-gray-500">{opp.person_title}</span>
                {opp.person_company && (
                  <><span className="text-gray-300">·</span><span className="text-xs text-gray-500">{opp.person_company}</span></>
                )}
                <span className="text-gray-300">·</span>
                <span className="text-[10px] font-semibold text-[#0A66C2] bg-blue-50 px-1.5 py-0.5 rounded">LinkedIn</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Permit details */}
      {isPermit && pm && (
        <div className="mt-3 space-y-1.5">
          {/* Value + SF row */}
          <div className="flex items-center gap-3 flex-wrap">
            {pm.declared_valuation > 0 && (
              <div className="flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
                <span className="text-xs font-semibold text-gray-700">
                  {pm.declared_valuation >= 1_000_000
                    ? `$${(pm.declared_valuation / 1_000_000).toFixed(1)}M`
                    : `$${(pm.declared_valuation / 1_000).toFixed(0)}K`}
                  <span className="font-normal text-gray-500"> est. value</span>
                </span>
              </div>
            )}
            {pm.area_sf > 0 && (
              <div className="flex items-center gap-1.5">
                <Ruler className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                <span className="text-xs text-gray-600">{pm.area_sf.toLocaleString()} SF</span>
              </div>
            )}
          </div>

          {/* Address */}
          {opp.address && (
            <div className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
              <span className="text-xs text-gray-500">{opp.address}</span>
            </div>
          )}

          {/* Applicant */}
          {pm.primary_contact && (
            <div className="flex items-center gap-1.5">
              <HardHat className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
              <span className="text-xs text-gray-600">Applicant: {pm.primary_contact}</span>
            </div>
          )}

          {/* Dates */}
          <div className="flex items-center gap-3 flex-wrap">
            {pm.date_submitted && (
              <div className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                <span className="text-xs text-gray-500">Filed: {new Date(pm.date_submitted).toLocaleDateString()}</span>
              </div>
            )}
            {pm.date_issued && (
              <span className="text-xs text-gray-500">Issued: {new Date(pm.date_issued).toLocaleDateString()}</span>
            )}
          </div>

          {/* Permit # + related count */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-gray-400">#{pm.permit_number}</span>
            {pm.related_count && pm.related_count > 0 && (
              <span className="text-[10px] text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">
                +{pm.related_count} related trade permit{pm.related_count > 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Company details (non-permit) */}
      {opp.card_type === "company" && !isPermit && (
        <div className="mt-3 space-y-1.5">
          {opp.google_rating !== null && opp.google_rating !== undefined && (
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
              <a href={`tel:${opp.phone}`}
                className="flex items-center gap-1 text-xs text-gray-600 hover:text-red-600 transition-colors">
                <Phone className="h-3.5 w-3.5" /> {opp.phone}
              </a>
            )}
            {opp.website && (
              <a href={opp.website.startsWith("http") ? opp.website : `https://${opp.website}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-gray-600 hover:text-red-600 transition-colors">
                <Globe className="h-3.5 w-3.5" /> {opp.website.replace(/^https?:\/\//, "").split("/")[0]}
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
            <a href={opp.linkedin_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-[#0A66C2] hover:underline">
              <ExternalLink className="h-3.5 w-3.5" /> View on LinkedIn
            </a>
          )}
        </div>
      )}

      {/* Match reason */}
      {opp.match_reason && (
        <div className="mt-3 bg-gray-50 rounded-lg px-3 py-2">
          <p className="text-xs text-gray-600 italic">{opp.match_reason}</p>
        </div>
      )}

      {/* Action buttons */}
      <div className="mt-3 flex gap-2">
        <button onClick={onSkip}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
          <X className="h-3.5 w-3.5" /> Skip
        </button>
        <button onClick={onSave}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-lg transition-colors ${
            isSaved
              ? "border-yellow-300 bg-yellow-50 text-yellow-700"
              : "border-gray-200 text-gray-600 hover:bg-gray-50"
          }`}>
          <Bookmark className={`h-3.5 w-3.5 ${isSaved ? "fill-yellow-400 text-yellow-400" : ""}`} />
          {isSaved ? "Saved" : "Save"}
        </button>
        {isPermit && pm?.primary_contact && (
          <a
            href={`https://www.google.com/search?q=${encodeURIComponent(
              `"${pm.primary_contact}" ${opp.address ?? ""} general contractor`
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-orange-700 border border-orange-200 rounded-lg hover:bg-orange-50 transition-colors"
          >
            <Search className="h-3.5 w-3.5" /> Find GC
          </a>
        )}
        <button
          onClick={() => onReachOut()}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
          <MessageSquare className="h-3.5 w-3.5" /> Reach Out
        </button>
      </div>
    </div>
  );
}
