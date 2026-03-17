import { useEffect, useState } from "react";
import { X, FileText, Loader2 } from "lucide-react";
import supabase from "@/supabase";
import { useSession } from "@/context/SessionContext";
import type { Proposal } from "@/types";

interface Props {
  onSelect: (proposalId: string, proposalName: string) => void;
  onClose: () => void;
}

export default function ProposalSelector({ onSelect, onClose }: Props) {
  const { company } = useSession();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!company?.id) return;
    supabase
      .from("proposals")
      .select("id, project_name, client_name, total_amount, created_at, status")
      .eq("company_id", company.id)
      .order("created_at", { ascending: false })
      .limit(30)
      .then(({ data }) => {
        setProposals((data || []) as Proposal[]);
        setLoading(false);
      });
  }, [company?.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Attach a Proposal</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 text-gray-400 animate-spin" />
            </div>
          ) : proposals.length === 0 ? (
            <div className="text-center py-12 text-sm text-gray-500">
              No proposals found. Create one in the Proposals tab first.
            </div>
          ) : (
            proposals.map((p) => (
              <button
                key={p.id}
                onClick={() => onSelect(p.id, p.project_name || "Unnamed Project")}
                className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50 border-b border-gray-100 last:border-0 text-left"
              >
                <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                  <FileText className="h-4 w-4 text-gray-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {p.project_name || "Unnamed Project"}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{p.client_name || "No client"}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-medium text-gray-900">
                    ${p.total_amount.toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-400 capitalize">{p.status}</p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
