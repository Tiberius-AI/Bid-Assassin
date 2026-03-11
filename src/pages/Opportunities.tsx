import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "@/context/SessionContext";
import {
  useOpportunities,
  DEFAULT_FILTERS,
  type OpportunityFilters,
  type OpportunityMatch,
} from "@/hooks/useOpportunities";
import { useWebPush } from "@/hooks/useWebPush";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,h
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  ExternalLink,
  FileText,
  ThumbsDown,
  Star,
  Loader2,
  Telescope,
  MapPin,
  Calendar,
  Building2,
  Phone,
  Mail,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Bell,
  X,
} from "lucide-react";
import toast from "react-hot-toast";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreBadge(score: number) {
  if (score >= 80)
    return (
      <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full bg-red-100 text-red-700">
        <span className="w-1.5 h-1.5 rounded-full bg-red-600 inline-block" />
        {score}% Match
      </span>
    );
  if (score >= 60)
    return (
      <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full bg-amber-100 text-amber-700">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
        {score}% Match
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full bg-slate-100 text-slate-600">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 inline-block" />
      {score}% Match
    </span>
  );
}

function formatDeadline(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.ceil((d.getTime() - now.getTime()) / 86_400_000);
  const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  if (diffDays < 0) return { label, urgent: false, expired: true };
  if (diffDays <= 7) return { label, urgent: true, expired: false };
  return { label, urgent: false, expired: false };
}

function primaryContact(contacts: OpportunityMatch["opportunity"]["contacts"]) {
  if (!contacts || contacts.length === 0) return null;
  return contacts.find((c) => c.type === "primary") ?? contacts[0];
}

// ---------------------------------------------------------------------------
// Opportunity Card
// ---------------------------------------------------------------------------

function OpportunityCard({
  match,
  onPass,
  onInterested,
  onBuildProposal,
}: {
  match: OpportunityMatch;
  onPass: () => void;
  onInterested: () => void;
  onBuildProposal: () => void;
}) {
  const opp = match.opportunity;
  const deadline = formatDeadline(opp.response_deadline);
  const contact = primaryContact(opp.contacts);
  const location = [opp.place_of_performance?.city, opp.place_of_performance?.state]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5 hover:border-gray-300 transition-colors">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          {scoreBadge(match.fit_score)}
          {match.status === "interested" && (
            <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700 font-medium">
              Interested
            </span>
          )}
          {match.status === "new" && (
            <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700 font-medium">
              New
            </span>
          )}
        </div>
        {deadline && (
          <span
            className={`text-xs font-medium shrink-0 ${
              deadline.expired
                ? "text-gray-400"
                : deadline.urgent
                ? "text-red-600"
                : "text-gray-500"
            }`}
          >
            <Calendar className="h-3 w-3 inline mr-1" />
            {deadline.expired ? "Expired" : `Due ${deadline.label}`}
          </span>
        )}
      </div>

      {/* Title */}
      <h3 className="font-semibold text-gray-900 mb-1 leading-snug">{opp.title}</h3>

      {/* Agency */}
      <p className="text-sm text-gray-500 mb-3 flex items-center gap-1">
        <Building2 className="h-3.5 w-3.5 shrink-0" />
        {[opp.department, opp.sub_tier || opp.office].filter(Boolean).join(" / ")}
      </p>

      {/* Meta row */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mb-3">
        {location && (
          <span className="flex items-center gap-1">
            <MapPin className="h-3 w-3" /> {location}
          </span>
        )}
        {opp.naics_code && (
          <span>NAICS {opp.naics_code}</span>
        )}
        {opp.set_aside_description && (
          <span className="text-blue-600 font-medium">{opp.set_aside_description}</span>
        )}
        {opp.solicitation_number && (
          <span className="font-mono">{opp.solicitation_number}</span>
        )}
      </div>

      {/* Contact */}
      {contact && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 border-t border-gray-100 pt-3 mb-4">
          {contact.fullName && (
            <span className="font-medium text-gray-700">{contact.fullName}</span>
          )}
          {contact.email && (
            <a
              href={`mailto:${contact.email}`}
              className="flex items-center gap-1 text-red-600 hover:text-red-700"
            >
              <Mail className="h-3 w-3" /> {contact.email}
            </a>
          )}
          {contact.phone && (
            <span className="flex items-center gap-1">
              <Phone className="h-3 w-3" /> {contact.phone}
            </span>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          className="bg-red-600 hover:bg-red-700 text-white gap-1.5"
          onClick={onBuildProposal}
        >
          <FileText className="h-3.5 w-3.5" /> Build Proposal
        </Button>
        <a
          href={`https://sam.gov/opp/${opp.source_id}/view`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button size="sm" variant="outline" className="gap-1.5">
            <ExternalLink className="h-3.5 w-3.5" /> View on SAM.gov
          </Button>
        </a>
        {match.status !== "interested" && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-blue-600 border-blue-200 hover:bg-blue-50"
            onClick={onInterested}
          >
            <Star className="h-3.5 w-3.5" /> Interested
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="gap-1.5 text-gray-400 hover:text-gray-600"
          onClick={onPass}
        >
          <ThumbsDown className="h-3.5 w-3.5" /> Pass
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filter bar
// ---------------------------------------------------------------------------

function FilterBar({
  filters,
  onChange,
}: {
  filters: OpportunityFilters;
  onChange: (f: OpportunityFilters) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm mb-4">
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4" /> Filters & Sort
        </span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {open && (
        <div className="border-t border-gray-100 px-4 pb-4 pt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Min score slider */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-2 block">
              Min Score: {filters.minScore}%
            </label>
            <Slider
              min={50}
              max={100}
              step={5}
              value={[filters.minScore]}
              onValueChange={([v]) => onChange({ ...filters, minScore: v })}
              className="w-full"
            />
          </div>

          {/* Status */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-2 block">Status</label>
            <Select
              value={filters.status}
              onValueChange={(v) => onChange({ ...filters, status: v })}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Active</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="viewed">Viewed</SelectItem>
                <SelectItem value="interested">Interested</SelectItem>
                <SelectItem value="passed">Passed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* State */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-2 block">State</label>
            <Select
              value={filters.state}
              onValueChange={(v) => onChange({ ...filters, state: v })}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All States</SelectItem>
                {["TX","OK","LA","AR","NM","FL","GA","CA","NY","CO","AZ","VA","MD","DC","PA","OH","IL","NC","SC","TN"].map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Set-aside */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-2 block">Set-Aside</label>
            <Select
              value={filters.setAside}
              onValueChange={(v) => onChange({ ...filters, setAside: v })}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="SBA">Small Business</SelectItem>
                <SelectItem value="8A">8(a)</SelectItem>
                <SelectItem value="HUBZone">HUBZone</SelectItem>
                <SelectItem value="SDVOSBC">SDVOSB</SelectItem>
                <SelectItem value="WOSB">WOSB</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Deadline */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-2 block">Deadline</label>
            <Select
              value={filters.deadline}
              onValueChange={(v) => onChange({ ...filters, deadline: v })}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Deadlines</SelectItem>
                <SelectItem value="week">This Week</SelectItem>
                <SelectItem value="two_weeks">Next 2 Weeks</SelectItem>
                <SelectItem value="month">Next 30 Days</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Sort */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-2 block">Sort By</label>
            <Select
              value={filters.sortBy}
              onValueChange={(v) => onChange({ ...filters, sortBy: v })}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fit_score">Best Match First</SelectItem>
                <SelectItem value="deadline">Deadline Soonest</SelectItem>
                <SelectItem value="posted_date">Newest First</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Push permission banner
// ---------------------------------------------------------------------------

function PushPermissionBanner({
  onEnable,
  onDismiss,
}: {
  onEnable: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4 text-sm">
      <Bell className="h-4 w-4 text-red-600 shrink-0" />
      <p className="flex-1 text-gray-700">
        <span className="font-medium text-gray-900">Get instant alerts</span> — enable browser
        notifications for hot matches (80%+).
      </p>
      <Button
        size="sm"
        className="bg-red-600 hover:bg-red-700 text-white shrink-0"
        onClick={onEnable}
      >
        Enable
      </Button>
      <button
        onClick={onDismiss}
        className="text-gray-400 hover:text-gray-600 shrink-0"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Opportunities() {
  const { session } = useSession();
  const navigate = useNavigate();
  const userId = session?.user?.id;

  const [filters, setFilters] = useState<OpportunityFilters>(DEFAULT_FILTERS);
  const { matches, loading, hasMore, loadMore, updateStatus } = useOpportunities(
    userId,
    filters
  );

  const { status: pushStatus, subscribe: subscribePush } = useWebPush(userId);
  const [pushDismissed, setPushDismissed] = useState(false);

  const handleEnablePush = async () => {
    await subscribePush();
    if (Notification.permission === "granted") {
      toast.success("Push notifications enabled!");
    } else {
      toast.error("Notifications blocked. Check your browser settings.");
    }
  };

  const handlePass = async (match: OpportunityMatch) => {
    await updateStatus(match.id, "passed");
    toast.success("Passed — we'll tune your matches.");
  };

  const handleInterested = async (match: OpportunityMatch) => {
    await updateStatus(match.id, "interested");
    toast.success("Saved as interested.");
  };

  const handleBuildProposal = (match: OpportunityMatch) => {
    const opp = match.opportunity;
    const contact = primaryContact(opp.contacts);
    const pop = opp.place_of_performance;

    // Pass opportunity data via location state so ProposalBuilder can pre-fill
    navigate("/proposals/new", {
      state: {
        fromOpportunity: {
          matchId: match.id,
          opportunityId: opp.id,
          projectName: opp.title,
          clientName: [opp.department, opp.office].filter(Boolean).join(" — "),
          clientContactName: contact?.fullName ?? "",
          clientEmail: contact?.email ?? "",
          clientPhone: contact?.phone ?? "",
          projectAddress: [
            pop?.street_address,
            pop?.city,
            pop?.state,
            pop?.zip,
          ]
            .filter(Boolean)
            .join(", "),
          solicitationNumber: opp.solicitation_number ?? "",
          setAside: opp.set_aside_description ?? "",
          sourceRef: `SAM.gov — ${opp.source_id}`,
          deadline: opp.response_deadline,
        },
      },
    });
  };

  const newCount = matches.filter((m) => m.status === "new").length;

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold text-gray-900">Opportunities</h1>
          {newCount > 0 && (
            <span className="inline-flex items-center justify-center text-xs font-bold px-2 py-0.5 rounded-full bg-red-600 text-white min-w-[20px]">
              {newCount}
            </span>
          )}
        </div>
        <p className="text-gray-500 text-sm">
          Federal contracts matched to your profile by The Prospector.
        </p>
      </div>

      {/* Push permission banner — show once until dismissed or subscribed */}
      {pushStatus === "prompt" && !pushDismissed && (
        <PushPermissionBanner
          onEnable={handleEnablePush}
          onDismiss={() => setPushDismissed(true)}
        />
      )}

      {/* Filters */}
      <FilterBar
        filters={filters}
        onChange={setFilters}
      />

      {/* Results */}
      {loading && matches.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : matches.length === 0 ? (
        <div className="text-center py-20">
          <Telescope className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 font-medium mb-1">No matches yet</p>
          <p className="text-sm text-gray-400">
            The Prospector runs every 4 hours. Check back soon or adjust your filters.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {matches.map((match) => (
            <OpportunityCard
              key={match.id}
              match={match}
              onPass={() => handlePass(match)}
              onInterested={() => handleInterested(match)}
              onBuildProposal={() => handleBuildProposal(match)}
            />
          ))}

          {hasMore && (
            <div className="text-center pt-2">
              <Button
                variant="outline"
                onClick={loadMore}
                disabled={loading}
                className="gap-2"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Load More
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
