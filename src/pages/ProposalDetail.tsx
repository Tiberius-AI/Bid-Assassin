import { useParams, useNavigate, Link } from "react-router-dom";
import { useSession } from "@/context/SessionContext";
import { useProposal } from "@/hooks/useProposals";
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
} from "lucide-react";
import type { AISuggestions } from "@/types";

const STATUS_CONFIG: Record<
  string,
  { color: string; bg: string; icon: typeof Clock }
> = {
  draft: { color: "text-gray-600", bg: "bg-gray-100", icon: Edit },
  sent: { color: "text-blue-700", bg: "bg-blue-100", icon: Send },
  viewed: { color: "text-yellow-700", bg: "bg-yellow-100", icon: FileText },
  accepted: {
    color: "text-green-700",
    bg: "bg-green-100",
    icon: CheckCircle2,
  },
  rejected: { color: "text-red-700", bg: "bg-red-100", icon: AlertCircle },
  expired: { color: "text-gray-500", bg: "bg-gray-100", icon: Clock },
};

export default function ProposalDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { company } = useSession();
  const { proposal, loading, error, updateProposal } = useProposal(id);

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

  const handleMarkSent = async () => {
    if (!proposal) return;
    try {
      await updateProposal({
        status: "sent",
        sent_at: new Date().toISOString(),
      });
      toast.success("Proposal marked as sent");
    } catch {
      toast.error("Failed to update status");
    }
  };

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

  const statusConfig = STATUS_CONFIG[proposal.status] || STATUS_CONFIG.draft;
  const ai = proposal.ai_suggestions as AISuggestions;
  const lineItems = ai?.line_items || [];
  const StatusIcon = statusConfig.icon;

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
        <div className="flex gap-2">
          {proposal.status === "draft" && (
            <Button
              variant="outline"
              onClick={handleMarkSent}
              className="gap-1"
            >
              <Send className="h-4 w-4" /> Mark as Sent
            </Button>
          )}
          <Link to={`/proposals/${proposal.id}/edit`}>
            <Button variant="outline" className="gap-1">
              <Edit className="h-4 w-4" /> Edit
            </Button>
          </Link>
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
                <p className="text-sm text-gray-500 mt-1">
                  {proposal.proposal_number}
                </p>
              </div>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1 rounded-full ${statusConfig.bg} ${statusConfig.color}`}
            >
              <StatusIcon className="h-3.5 w-3.5" />
              {proposal.status.charAt(0).toUpperCase() +
                proposal.status.slice(1)}
            </span>
          </div>
        </div>

        {/* Client & Project */}
        <div className="border-b border-gray-200 p-6 grid grid-cols-2 gap-6">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase mb-1">
              Client
            </p>
            <p className="text-sm font-medium text-gray-900">
              {proposal.client_name}
            </p>
            <p className="text-sm text-gray-600">{proposal.client_company}</p>
            {proposal.client_email && (
              <p className="text-sm text-gray-600">{proposal.client_email}</p>
            )}
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase mb-1">
              Project
            </p>
            <p className="text-sm font-medium text-gray-900">
              {proposal.project_name}
            </p>
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
                  <th className="text-left py-2 font-medium text-gray-500">
                    Description
                  </th>
                  <th className="text-right py-2 font-medium text-gray-500">
                    Qty
                  </th>
                  <th className="text-center py-2 font-medium text-gray-500">
                    Unit
                  </th>
                  <th className="text-right py-2 font-medium text-gray-500">
                    Unit Price
                  </th>
                  <th className="text-right py-2 font-medium text-gray-500">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-2 text-gray-800">{item.description}</td>
                    <td className="py-2 text-right text-gray-600">
                      {item.quantity}
                    </td>
                    <td className="py-2 text-center text-gray-600">
                      {item.unit}
                    </td>
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
                  <td
                    colSpan={4}
                    className="py-3 text-right font-semibold text-gray-900"
                  >
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
            <h3 className="text-sm font-semibold text-gray-900 mb-2">
              Inclusions
            </h3>
            {proposal.inclusions ? (
              <ul className="space-y-1">
                {proposal.inclusions
                  .split("\n")
                  .filter(Boolean)
                  .map((item, i) => (
                    <li key={i} className="text-sm text-gray-700">
                      &bull; {item}
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-400">None specified</p>
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-2">
              Exclusions
            </h3>
            {proposal.exclusions ? (
              <ul className="space-y-1">
                {proposal.exclusions
                  .split("\n")
                  .filter(Boolean)
                  .map((item, i) => (
                    <li key={i} className="text-sm text-gray-700">
                      &bull; {item}
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-400">None specified</p>
            )}
          </div>
        </div>

        {/* Terms */}
        <div className="p-6 grid grid-cols-3 gap-6">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">
              Timeline
            </h3>
            <p className="text-sm text-gray-700">
              {proposal.timeline_description || "Not specified"}
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">
              Payment Terms
            </h3>
            <p className="text-sm text-gray-700">
              {proposal.payment_terms || "Not specified"}
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">
              Warranty
            </h3>
            <p className="text-sm text-gray-700">
              {proposal.warranty_terms || "Not specified"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
