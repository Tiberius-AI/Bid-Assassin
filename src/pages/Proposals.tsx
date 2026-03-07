import { useSession } from "@/context/SessionContext";
import { useProposals } from "@/hooks/useProposals";
import { Link } from "react-router-dom";
import { Plus, FileText, Loader2, AlertCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "react-hot-toast";
import { useState } from "react";

const STATUS_STYLE: Record<string, string> = {
  draft:    "bg-gray-100 text-gray-600",
  sent:     "bg-blue-100 text-blue-700",
  viewed:   "bg-yellow-100 text-yellow-700",
  accepted: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  expired:  "bg-gray-100 text-gray-500",
};

const STATUS_LABEL: Record<string, string> = {
  draft:    "Draft",
  sent:     "Sent",
  viewed:   "Viewed",
  accepted: "Accepted",
  rejected: "Declined",
  expired:  "Expired",
};

export default function Proposals() {
  const { company } = useSession();
  const { proposals, loading, error, deleteProposal } = useProposals(company?.id);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Delete this proposal? This cannot be undone.")) return;
    setDeletingId(id);
    try {
      await deleteProposal(id);
      toast.success("Proposal deleted");
    } catch {
      toast.error("Failed to delete proposal");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Proposals</h1>
          <p className="text-sm text-gray-500 mt-1">
            Create and manage your bid proposals.
          </p>
        </div>
        <Link to="/proposals/new">
          <Button className="gap-2 bg-red-600 hover:bg-red-700">
            <Plus className="h-4 w-4" /> New Proposal
          </Button>
        </Link>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : proposals.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-lg border border-gray-200">
          <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No proposals yet
          </h3>
          <p className="text-sm text-gray-500 mb-4">
            Create your first proposal to get started.
          </p>
          <Link to="/proposals/new">
            <Button className="gap-2 bg-red-600 hover:bg-red-700">
              <Plus className="h-4 w-4" /> Create Proposal
            </Button>
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                  Proposal
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase hidden md:table-cell">
                  Client
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">
                  Amount
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase hidden lg:table-cell">
                  Date
                </th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody>
              {proposals.map((proposal) => (
                <tr
                  key={proposal.id}
                  className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <Link
                      to={`/proposals/${proposal.id}`}
                      className="block"
                    >
                      <p className="text-sm font-medium text-gray-900">
                        {proposal.project_name || "Untitled"}
                      </p>
                      <p className="text-xs text-gray-500">
                        {proposal.proposal_number}
                      </p>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 hidden md:table-cell">
                    {proposal.client_company || proposal.client_name || "-"}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 hidden sm:table-cell">
                    ${(proposal.total_amount || 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${
                        STATUS_STYLE[proposal.status] ?? STATUS_STYLE.draft
                      }`}
                    >
                      {STATUS_LABEL[proposal.status] ?? proposal.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 hidden lg:table-cell">
                    {new Date(proposal.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={(e) => handleDelete(proposal.id, e)}
                      disabled={deletingId === proposal.id}
                      className="text-gray-400 hover:text-red-500 transition-colors p-1"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
