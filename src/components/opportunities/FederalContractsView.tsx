/**
 * FederalContractsView — SAM.gov matched federal contract opportunities
 * Shows opportunity_matches joined with sam_opportunities, scored per member profile.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  MapPin, Calendar, Mail, Phone, ExternalLink,
  Loader2, RefreshCw, Building2, FileText, ThumbsDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFederalContracts, type FederalContract } from "@/hooks/useFederalContracts";

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function scoreBadge(score: number) {
  if (score >= 80) return { bg: "bg-red-600",   text: "text-white", border: "border-red-600",   label: "Hot Match" };
  if (score >= 60) return { bg: "bg-amber-500", text: "text-white", border: "border-amber-500", label: "Good Match" };
  return               { bg: "bg-slate-400",  text: "text-white", border: "border-slate-400",  label: "Possible" };
}

function formatDeadline(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const dateStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  if (diffDays < 0)  return { label: `${dateStr} (expired)`, urgent: false, expired: true };
  if (diffDays <= 3) return { label: `${dateStr} — ${diffDays}d left`, urgent: true, expired: false };
  if (diffDays <= 7) return { label: `${dateStr} — ${diffDays}d left`, urgent: false, expired: false };
  return { label: dateStr, urgent: false, expired: false };
}

function primaryContact(contacts: FederalContract["contacts"]) {
  if (!contacts || contacts.length === 0) return null;
  return contacts.find((c) => c.type === "primary") ?? contacts[0];
}

// ─────────────────────────────────────────────────────────────
// Card
// ─────────────────────────────────────────────────────────────

function FederalContractCard({
  contract,
  onPass,
  onInterested,
  onBuildProposal,
}: {
  contract: FederalContract;
  onPass: () => void;
  onInterested: () => void;
  onBuildProposal: () => void;
}) {
  const badge    = scoreBadge(contract.fit_score);
  const deadline = formatDeadline(contract.response_deadline);
  const contact  = primaryContact(contract.contacts);
  const location = [
    contract.place_of_performance?.city,
    contract.place_of_performance?.state,
  ].filter(Boolean).join(", ");

  const agency = [contract.department, contract.office]
    .filter(Boolean).join(" / ");

  const samUrl = `https://sam.gov/opp/${contract.source_id}/view`;

  const isInterested = contract.status === "interested";

  return (
    <div className={`bg-white border rounded-xl shadow-sm hover:shadow-md transition-shadow p-4 ${
      contract.fit_score >= 80 ? "border-red-200" : "border-gray-200"
    }`}>
      {/* Header row */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
          <Building2 className="h-5 w-5 text-blue-600" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              {contract.status === "new" && (
                <span className="inline-block text-[10px] font-bold bg-teal-700 text-white px-1.5 py-0.5 rounded mr-1.5 align-middle">
                  NEW
                </span>
              )}
              <span className="font-semibold text-gray-900 text-sm leading-snug">
                {contract.title}
              </span>
            </div>
            <span className={`flex-shrink-0 text-xs font-bold px-2.5 py-1 rounded-full border ${badge.bg} ${badge.text} ${badge.border}`}>
              {contract.fit_score}%
            </span>
          </div>

          {/* Agency */}
          {agency && (
            <p className="text-xs text-gray-500 mt-0.5 truncate">{agency}</p>
          )}
        </div>
      </div>

      {/* Details */}
      <div className="mt-3 space-y-1.5">
        {/* Location */}
        {location && (
          <div className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
            <span className="text-xs text-gray-600">{location}</span>
            {contract.naics_code && (
              <>
                <span className="text-gray-300">·</span>
                <span className="text-xs text-gray-500">NAICS {contract.naics_code}</span>
              </>
            )}
          </div>
        )}

        {/* Deadline */}
        {deadline && (
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
            <span className={`text-xs ${deadline.expired ? "text-gray-400 line-through" : deadline.urgent ? "text-red-600 font-semibold" : "text-gray-600"}`}>
              Due: {deadline.label}
            </span>
          </div>
        )}

        {/* Set-aside */}
        {contract.set_aside_description && (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded">
              {contract.set_aside_description}
            </span>
          </div>
        )}

        {/* Contact */}
        {contact && (
          <div className="flex items-center gap-3 flex-wrap">
            {contact.fullName && (
              <span className="text-xs text-gray-600 font-medium">{contact.fullName}</span>
            )}
            {contact.email && (
              <a href={`mailto:${contact.email}`}
                className="flex items-center gap-1 text-xs text-teal-700 hover:text-teal-800 transition-colors">
                <Mail className="h-3.5 w-3.5" />
                {contact.email}
              </a>
            )}
            {contact.phone && (
              <a href={`tel:${contact.phone}`}
                className="flex items-center gap-1 text-xs text-gray-600 hover:text-teal-700 transition-colors">
                <Phone className="h-3.5 w-3.5" />
                {contact.phone}
              </a>
            )}
          </div>
        )}

        {/* Solicitation number */}
        {contract.solicitation_number && (
          <p className="text-[10px] text-gray-400">Solicitation: {contract.solicitation_number}</p>
        )}
      </div>

      {/* Score breakdown (collapsed) */}
      <div className="mt-3 flex gap-1.5 flex-wrap">
        {Object.entries(contract.score_breakdown ?? {}).map(([key, val]) => (
          <span key={key} className="text-[10px] text-gray-500 bg-gray-50 border border-gray-200 px-1.5 py-0.5 rounded capitalize">
            {key}: {val}
          </span>
        ))}
      </div>

      {/* Action buttons */}
      <div className="mt-3 flex gap-2 flex-wrap">
        <button
          onClick={onPass}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <ThumbsDown className="h-3.5 w-3.5" /> Pass
        </button>

        <button
          onClick={onInterested}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-lg transition-colors ${
            isInterested
              ? "border-teal-300 bg-teal-50 text-teal-700"
              : "border-gray-200 text-gray-600 hover:bg-gray-50"
          }`}
        >
          {isInterested ? "Interested ✓" : "Interested"}
        </button>

        <a
          href={samUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
        >
          <ExternalLink className="h-3.5 w-3.5" /> SAM.gov
        </a>

        <button
          onClick={onBuildProposal}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
        >
          <FileText className="h-3.5 w-3.5" /> Build Proposal
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main view
// ─────────────────────────────────────────────────────────────

type FedFilter = "all" | "hot" | "new" | "interested";

export default function FederalContractsView({ userId }: { userId: string | undefined }) {
  const navigate = useNavigate();
  const { contracts, loading, error, reload, updateStatus, markViewed } = useFederalContracts(userId);
  const [filter, setFilter] = useState<FedFilter>("all");

  const hotCount        = contracts.filter((c) => c.fit_score >= 80).length;
  const newCount        = contracts.filter((c) => c.status === "new").length;
  const interestedCount = contracts.filter((c) => c.status === "interested").length;

  const filtered = contracts.filter((c) => {
    if (filter === "hot")       return c.fit_score >= 80;
    if (filter === "new")       return c.status === "new";
    if (filter === "interested") return c.status === "interested";
    return true;
  });

  const handleBuildProposal = (contract: FederalContract) => {
    const contact = primaryContact(contract.contacts);
    navigate("/proposals/new", {
      state: {
        prefill: {
          project_title:        contract.title,
          client_name:          [contract.department, contract.office].filter(Boolean).join(" / "),
          client_contact_name:  contact?.fullName ?? null,
          client_contact_email: contact?.email ?? null,
          client_contact_phone: contact?.phone ?? null,
          project_location:     [
            contract.place_of_performance?.city,
            contract.place_of_performance?.state,
            contract.place_of_performance?.zip,
          ].filter(Boolean).join(", "),
          solicitation_number:  contract.solicitation_number,
          set_aside:            contract.set_aside_description,
          bid_deadline:         contract.response_deadline,
          source_reference:     `SAM.gov — ${contract.source_id}`,
          naics_code:           contract.naics_code,
          match_id:             contract.match_id,
        },
      },
    });
    updateStatus(contract.match_id, "proposal_started");
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="h-6 w-6 text-teal-700 animate-spin" />
        <p className="text-sm text-gray-500">Loading federal contracts…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-center px-4">
        <p className="text-sm font-semibold text-gray-900">Couldn't load federal contracts</p>
        <p className="text-xs text-gray-500 max-w-sm">{error}</p>
        <Button onClick={reload} size="sm" variant="outline">Try Again</Button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      {/* Filter chips + reload */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {([
          { key: "all",       label: `All (${contracts.length})` },
          { key: "hot",       label: `Hot 80+ (${hotCount})` },
          { key: "new",       label: `New (${newCount})` },
          { key: "interested", label: `Interested (${interestedCount})` },
        ] as { key: FedFilter; label: string }[]).map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              filter === f.key
                ? "bg-gray-900 text-white border-gray-900"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
            }`}
          >
            {f.label}
          </button>
        ))}
        <button
          onClick={reload}
          className="ml-auto p-1.5 rounded-lg border border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
          title="Reload"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Empty state */}
      {contracts.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <Building2 className="h-10 w-10 mx-auto mb-3 text-gray-300" />
          <p className="font-medium text-gray-500">No federal contracts matched yet</p>
          <p className="text-sm mt-1 max-w-xs mx-auto">
            The scraper runs every 4 hours. Once SAM.gov opportunities are fetched and scored against your profile, they'll appear here.
          </p>
        </div>
      )}

      {filtered.length === 0 && contracts.length > 0 && (
        <div className="text-center py-10 text-gray-400">
          <p className="text-sm">No contracts in this filter</p>
        </div>
      )}

      {/* Contract cards */}
      <div className="space-y-3">
        {filtered.map((contract) => (
          <FederalContractCard
            key={contract.match_id}
            contract={contract}
            onPass={() => updateStatus(contract.match_id, "passed")}
            onInterested={() => {
              updateStatus(contract.match_id, "interested");
              markViewed(contract.match_id);
            }}
            onBuildProposal={() => handleBuildProposal(contract)}
          />
        ))}
      </div>
    </div>
  );
}
