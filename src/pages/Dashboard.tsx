import { useSession } from "@/context/SessionContext";
import { useProposals } from "@/hooks/useProposals";
import { Link } from "react-router-dom";
import {
  FileText,
  TrendingUp,
  DollarSign,
  Plus,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Dashboard() {
  const { profile, company } = useSession();
  const { proposals, loading } = useProposals(company?.id);

  const activeProposals = proposals.filter(
    (p) => p.status === "draft" || p.status === "sent" || p.status === "viewed"
  );
  const wonProposals = proposals.filter((p) => p.status === "accepted");
  const decidedProposals = proposals.filter(
    (p) => p.status === "accepted" || p.status === "rejected"
  );
  const totalPipeline = activeProposals.reduce(
    (sum, p) => sum + (p.total_amount || 0),
    0
  );
  const winRate =
    decidedProposals.length > 0
      ? Math.round((wonProposals.length / decidedProposals.length) * 100)
      : 0;

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Welcome */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {profile?.full_name?.split(" ")[0] || "there"}
        </h1>
        <p className="text-gray-500 mt-1">
          Here's what's happening with your proposals.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Active Proposals</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {loading ? "-" : activeProposals.length}
              </p>
            </div>
            <div className="w-10 h-10 bg-red-50 rounded-lg flex items-center justify-center">
              <FileText className="h-5 w-5 text-red-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Win Rate</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {loading ? "-" : `${winRate}%`}
              </p>
            </div>
            <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Pipeline Value</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {loading
                  ? "-"
                  : `$${totalPipeline.toLocaleString()}`}
              </p>
            </div>
            <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-blue-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions + Recent Proposals */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Actions */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Quick Actions</h2>
          <div className="space-y-2">
            <Link to="/proposals/new">
              <Button className="w-full justify-start gap-2 bg-red-600 hover:bg-red-700">
                <Plus className="h-4 w-4" /> New Proposal
              </Button>
            </Link>
          </div>
        </div>

        {/* Recent Proposals */}
        <div className="lg:col-span-2 bg-white rounded-lg border border-gray-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Recent Proposals</h2>
            <Link
              to="/proposals"
              className="text-sm text-red-600 hover:text-red-700 flex items-center gap-1"
            >
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            </div>
          ) : proposals.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">No proposals yet.</p>
              <Link to="/proposals/new">
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 gap-1"
                >
                  <Plus className="h-3 w-3" /> Create your first proposal
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {proposals.slice(0, 5).map((proposal) => (
                <Link
                  key={proposal.id}
                  to={`/proposals/${proposal.id}`}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors border border-gray-100"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {proposal.project_name || "Untitled Proposal"}
                    </p>
                    <p className="text-xs text-gray-500">
                      {proposal.client_company || proposal.client_name || "No client"} &middot;{" "}
                      {proposal.proposal_number}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900">
                      ${(proposal.total_amount || 0).toLocaleString()}
                    </p>
                    <span
                      className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${
                        proposal.status === "accepted"
                          ? "bg-green-100 text-green-700"
                          : proposal.status === "sent"
                          ? "bg-blue-100 text-blue-700"
                          : proposal.status === "viewed"
                          ? "bg-yellow-100 text-yellow-700"
                          : proposal.status === "rejected"
                          ? "bg-red-100 text-red-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {proposal.status === "rejected"
                        ? "Declined"
                        : proposal.status.charAt(0).toUpperCase() + proposal.status.slice(1)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
