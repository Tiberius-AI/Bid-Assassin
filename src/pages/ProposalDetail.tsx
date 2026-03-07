import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useSession } from "@/context/SessionContext";
import { useProposal } from "@/hooks/useProposals";
import supabase from "@/supabase";
import { pdf } from "@react-pdf/renderer";
import ProposalPDF from "@/components/proposals/ProposalPDF";
import { Button } from "@/components/ui/button";
import { toast } from "react-hot-toast";
import {
  ArrowLeft,
  Download,
  Edit,
  Loader2,
  AlertCircle,
  FileText,
  DollarSign,
  Clock,
  CheckCircle2,
  Send,
  Eye,
  XCircle,
  ChevronDown,
  BookmarkPlus,
} from "lucide-react";
import type { AISuggestions, Proposal } from "@/types";

// --- Status config -----------------------------------------------------------

type StatusKey = Proposal["status"];

const STATUS_LABEL: Record<StatusKey, string> = {
  draft: "Draft",
  sent: "Sent",
  viewed: "Viewed",
  accepted: "Accepted",
  rejected: "Declined",
  expired: "Expired",
};

const STATUS_CONFIG: Record<
  StatusKey,
  { color: string; bg: string; icon: typeof Clock }
> = {
  draft:    { color: "text-gray-600",  bg: "bg-gray-100",  icon: Edit       },
  sent:     { color: "text-blue-700",  bg: "bg-blue-100",  icon: Send       },
  viewed:   { color: "text-yellow-700",bg: "bg-yellow-100",icon: Eye        },
  accepted: { color: "text-green-700", bg: "bg-green-100", icon: CheckCircle2 },
  rejected: { color: "text-red-700",   bg: "bg-red-100",   icon: XCircle   },
  expired:  { color: "text-gray-500",  bg: "bg-gray-100",  icon: Clock     },
};

// Allowed forward transitions from each status
const TRANSITIONS: Record<StatusKey, { to: StatusKey; label: string }[]> = {
  draft:    [{ to: "sent",     label: "Mark as Sent"     }],
  sent:     [{ to: "viewed",   label: "Mark as Viewed"   },
             { to: "accepted", label: "Mark as Accepted" },
             { to: "rejected", label: "Mark as Declined" }],
  viewed:   [{ to: "accepted", label: "Mark as Accepted" },
             { to: "rejected", label: "Mark as Declined" }],
  accepted: [],
  rejected: [],
  expired:  [],
};

// Proposals can only be edited while still in draft
const isEditable = (status: StatusKey) => status === "draft";

// ---------------------------------------------------------------------------

export default function ProposalDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { company, refreshCompany } = useSession();
  const { proposal, loading, error, updateProposal } = useProposal(id);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [showTransitions, setShowTransitions] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);

  const handleDownloadPDF = async () => {
    if (!proposal || !company) return;
    try {
      const blob = await pdf(
        <ProposalPDF proposal={proposal} company={company} />
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${proposal.proposal_number || "proposal"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("PDF downloaded!");
    } catch {
      toast.error("Failed to generate PDF");
    }
  };

  const handleStatusChange = async (next: StatusKey) => {
    if (!proposal) return;
    const isTerminal = next === "accepted" || next === "rejected";
    if (isTerminal) {
      const label = STATUS_LABEL[next];
      if (!confirm(`Mark this proposal as ${label}? This cannot be undone.`)) return;
    }
    setStatusUpdating(true);
    setShowTransitions(false);
    try {
      const updates: Partial<Proposal> = { status: next };
      if (next === "sent") updates.sent_at = new Date().toISOString();
      await updateProposal(updates);

      // Sync linked project status
      const projectStatusMap: Partial<Record<StatusKey, string>> = {
        sent: "bid_submitted",
        accepted: "won",
        rejected: "lost",
      };
      const projectStatus = projectStatusMap[next];
      if (projectStatus && proposal) {
        await supabase
          .from("projects")
          .update({ status: projectStatus })
          .eq("proposal_id", proposal.id);
      }

      toast.success(`Proposal marked as ${STATUS_LABEL[next]}`);
    } catch {
      toast.error("Failed to update status");
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleSaveTemplate = async () => {
    if (!proposal || !company) return;
    setSavingTemplate(true);
    try {
      const updates: Record<string, string | null> = {};
      if (proposal.about_us) updates.company_bio = proposal.about_us;
      if (proposal.terms_and_conditions) updates.default_terms = proposal.terms_and_conditions;
      if (proposal.payment_terms) updates.default_payment_terms = proposal.payment_terms;
      if (proposal.warranty_terms) updates.default_warranty_terms = proposal.warranty_terms;

      const { error } = await supabase
        .from("companies")
        .update(updates)
        .eq("id", company.id);
      if (error) throw error;

      await refreshCompany();
      toast.success("Template saved! Future proposals will use these defaults.");
    } catch {
      toast.error("Failed to save template");
    } finally {
      setSavingTemplate(false);
    }
  };

  // --- Loading / error states -----------------------------------------------
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error || !proposal) {
    return (
      <div className="p-6 text-center">
        <AlertCircle className="h-10 w-10 text-red-400 mx-auto mb-3" />
        <p className="text-gray-500">{error || "Proposal not found"}</p>
        <Button
          variant="outline"
          onClick={() => navigate("/proposals")}
          className="mt-4"
        >
          Back to Proposals
        </Button>
      </div>
    );
  }

  const status = proposal.status as StatusKey;
  const statusConfig = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
  const StatusIcon = statusConfig.icon;
  const transitions = TRANSITIONS[status] ?? [];
  const ai = proposal.ai_suggestions as AISuggestions;
  const lineItems = ai?.line_items || [];

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      {/* Top Actions */}
      <div className="flex items-center justify-between mb-6">
        <Button
          variant="outline"
          onClick={() => navigate("/proposals")}
          className="gap-1"
        >
          <ArrowLeft className="h-4 w-4" /> Proposals
        </Button>

        <div className="flex gap-2 items-center">
          {/* Status transition controls */}
          {transitions.length > 0 && (
            <div className="relative">
              {transitions.length === 1 ? (
                <Button
                  variant="outline"
                  onClick={() => handleStatusChange(transitions[0].to)}
                  disabled={statusUpdating}
                  className="gap-1"
                >
                  {statusUpdating
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Send className="h-4 w-4" />}
                  {transitions[0].label}
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    onClick={() => setShowTransitions((v) => !v)}
                    disabled={statusUpdating}
                    className="gap-1"
                  >
                    {statusUpdating
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <ChevronDown className="h-4 w-4" />}
                    Update Status
                  </Button>
                  {showTransitions && (
                    <div className="absolute right-0 top-full mt-1 z-10 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[180px]">
                      {transitions.map((t) => (
                        <button
                          key={t.to}
                          onClick={() => handleStatusChange(t.to)}
                          className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${
                            t.to === "accepted"
                              ? "text-green-700"
                              : t.to === "rejected"
                              ? "text-red-600"
                              : "text-gray-700"
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Edit — only available on draft */}
          {isEditable(status) && (
            <Link to={`/proposals/${proposal.id}/edit`}>
              <Button variant="outline" className="gap-1">
                <Edit className="h-4 w-4" /> Edit
              </Button>
            </Link>
          )}

          <Button
            variant="outline"
            onClick={handleSaveTemplate}
            disabled={savingTemplate}
            className="gap-1"
            title="Save About Us, Terms, and payment/warranty defaults back to your company profile"
          >
            {savingTemplate ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <BookmarkPlus className="h-4 w-4" />
            )}
            Save as Template
          </Button>

          <Button
            onClick={handleDownloadPDF}
            className="gap-1 bg-red-600 hover:bg-red-700"
          >
            <Download className="h-4 w-4" /> Download PDF
          </Button>
        </div>
      </div>

      {/* Proposal Card */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
        {/* Header */}
        <div className="border-b border-gray-200 p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              {company?.logo_url && (
                <img
                  src={company.logo_url}
                  alt={`${company.name} logo`}
                  className="h-12 w-auto max-w-[120px] object-contain rounded"
                />
              )}
              <div>
                <h1 className="text-xl font-bold text-gray-900">
                  {proposal.project_name || "Untitled Proposal"}
                </h1>
                <p className="text-sm text-gray-500 mt-0.5">
                  {proposal.proposal_number}
                </p>
                {proposal.sent_at && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    Sent {new Date(proposal.sent_at).toLocaleDateString()}
                  </p>
                )}
                {proposal.expires_at && (
                  <p className={`text-xs mt-0.5 ${new Date(proposal.expires_at) < new Date() ? "text-red-500 font-medium" : "text-gray-400"}`}>
                    Valid until {new Date(proposal.expires_at).toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1 rounded-full ${statusConfig.bg} ${statusConfig.color}`}
            >
              <StatusIcon className="h-3.5 w-3.5" />
              {STATUS_LABEL[status]}
            </span>
          </div>
        </div>

        {/* Client & Project */}
        <div className="border-b border-gray-200 p-6 grid grid-cols-2 gap-6">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase mb-1">Client</p>
            {proposal.client_logo_url && (
              <img
                src={proposal.client_logo_url}
                alt="Client logo"
                className="h-10 w-auto max-w-[100px] object-contain mb-2"
              />
            )}
            <p className="text-sm font-medium text-gray-900">{proposal.client_name}</p>
            <p className="text-sm text-gray-600">{proposal.client_company}</p>
            {proposal.client_email && (
              <p className="text-sm text-gray-600">{proposal.client_email}</p>
            )}
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase mb-1">Project</p>
            <p className="text-sm font-medium text-gray-900">{proposal.project_name}</p>
            <p className="text-sm text-gray-600">{proposal.project_address}</p>
          </div>
        </div>

        {/* Scope */}
        {proposal.scope_of_work && (
          <div className="border-b border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <FileText className="h-4 w-4" /> Scope of Work
            </h3>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">
              {proposal.scope_of_work}
            </p>
          </div>
        )}

        {/* Line Items */}
        {lineItems.length > 0 && (
          <div className="border-b border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <DollarSign className="h-4 w-4" /> Pricing
            </h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 font-medium text-gray-500">Description</th>
                  <th className="text-right py-2 font-medium text-gray-500">Qty</th>
                  <th className="text-center py-2 font-medium text-gray-500">Unit</th>
                  <th className="text-right py-2 font-medium text-gray-500">Unit Price</th>
                  <th className="text-right py-2 font-medium text-gray-500">Total</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-2 text-gray-800">{item.description}</td>
                    <td className="py-2 text-right text-gray-600">{item.quantity}</td>
                    <td className="py-2 text-center text-gray-600">{item.unit}</td>
                    <td className="py-2 text-right text-gray-600">
                      ${item.unit_price.toLocaleString()}
                    </td>
                    <td className="py-2 text-right font-medium text-gray-900">
                      ${item.total_price.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-300">
                  <td colSpan={4} className="py-3 text-right font-semibold text-gray-900">
                    Total
                  </td>
                  <td className="py-3 text-right font-bold text-lg text-gray-900">
                    ${(proposal.total_amount || 0).toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* Inclusions / Exclusions */}
        <div className="border-b border-gray-200 p-6 grid grid-cols-2 gap-6">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Inclusions</h3>
            {proposal.inclusions ? (
              <ul className="space-y-1">
                {proposal.inclusions.split("\n").filter(Boolean).map((item, i) => (
                  <li key={i} className="text-sm text-gray-700">&bull; {item}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-400">None specified</p>
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Exclusions</h3>
            {proposal.exclusions ? (
              <ul className="space-y-1">
                {proposal.exclusions.split("\n").filter(Boolean).map((item, i) => (
                  <li key={i} className="text-sm text-gray-700">&bull; {item}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-400">None specified</p>
            )}
          </div>
        </div>

        {/* Terms */}
        <div className="border-b border-gray-200 p-6 grid grid-cols-3 gap-6">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Timeline</h3>
            <p className="text-sm text-gray-700">
              {proposal.timeline_description || "Not specified"}
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Payment Terms</h3>
            <p className="text-sm text-gray-700">
              {proposal.payment_terms || "Not specified"}
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Warranty</h3>
            <p className="text-sm text-gray-700">
              {proposal.warranty_terms || "Not specified"}
            </p>
          </div>
        </div>

        {/* Project Photos */}
        {(proposal.project_photos || []).length > 0 && (
          <div className="border-b border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Project Photos</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {(proposal.project_photos || []).map((url, i) => (
                <div key={i} className="aspect-square rounded-lg overflow-hidden border border-gray-200">
                  <img src={url} alt={`Project photo ${i + 1}`} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* About Us */}
        {proposal.about_us && (
          <div className="border-b border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">About Us</h3>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{proposal.about_us}</p>
          </div>
        )}

        {/* Terms & Conditions */}
        {proposal.terms_and_conditions && (
          <div className="border-b border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Terms &amp; Conditions</h3>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{proposal.terms_and_conditions}</p>
          </div>
        )}

        {/* Signature / Acceptance Block */}
        <div className="p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">
            Authorization &amp; Acceptance
          </h3>
          <p className="text-xs text-gray-500 mb-5">
            By signing below, both parties agree to the terms and scope outlined in this proposal.
            {proposal.expires_at && (
              <> This proposal is valid until <span className="font-medium">{new Date(proposal.expires_at).toLocaleDateString()}</span>.</>
            )}
          </p>
          <div className="grid grid-cols-2 gap-10">
            {/* Client */}
            <div className="space-y-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Client / Authorized Representative</p>
              <div>
                <div className="border-b border-gray-400 h-8 mb-1" />
                <p className="text-xs text-gray-400">Printed Name</p>
              </div>
              <div>
                <div className="border-b border-gray-400 h-8 mb-1" />
                <p className="text-xs text-gray-400">Title</p>
              </div>
              <div>
                <div className="border-b border-gray-400 h-8 mb-1" />
                <p className="text-xs text-gray-400">Signature</p>
              </div>
              <div>
                <div className="border-b border-gray-400 h-8 mb-1" />
                <p className="text-xs text-gray-400">Date</p>
              </div>
            </div>
            {/* Contractor */}
            <div className="space-y-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Contractor ({company?.name})</p>
              <div>
                <div className="border-b border-gray-400 h-8 mb-1" />
                <p className="text-xs text-gray-400">Printed Name</p>
              </div>
              <div>
                <div className="border-b border-gray-400 h-8 mb-1" />
                <p className="text-xs text-gray-400">Title</p>
              </div>
              <div>
                <div className="border-b border-gray-400 h-8 mb-1" />
                <p className="text-xs text-gray-400">Signature</p>
              </div>
              <div>
                <div className="border-b border-gray-400 h-8 mb-1" />
                <p className="text-xs text-gray-400">Date</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
