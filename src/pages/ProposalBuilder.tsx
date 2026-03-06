import { useState } from "react";
import { useSession } from "@/context/SessionContext";
import { useProposals } from "@/hooks/useProposals";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "react-hot-toast";
import ManualBuild from "@/components/proposals/ManualBuild";
import AgentBuild from "@/components/proposals/AgentBuild";
import { PenLine, Bot } from "lucide-react";
import type { AISuggestions, ChatMessage, ClientResearch } from "@/types";

export default function ProposalBuilder() {
  const { id } = useParams();
  const { company } = useSession();
  const { createProposal, updateProposal } = useProposals(company?.id);
  const navigate = useNavigate();
  const [mode, setMode] = useState<"manual" | "agent">("agent");

  const handleSave = async (data: {
    projectName: string;
    clientName: string;
    clientEmail: string;
    clientCompany: string;
    projectAddress: string;
    aiSuggestions: AISuggestions;
    paymentTerms: string;
    warrantyTerms: string;
    buildMode: "manual" | "agent";
    clientResearch?: ClientResearch;
    agentConversation?: ChatMessage[];
    intakeAnswers?: Record<string, string>;
  }) => {
    try {
      const proposalData = {
        project_name: data.projectName,
        client_name: data.clientName,
        client_email: data.clientEmail,
        client_company: data.clientCompany,
        project_address: data.projectAddress,
        scope_of_work: data.aiSuggestions.scope_of_work,
        exclusions: data.aiSuggestions.exclusions.join("\n"),
        inclusions: data.aiSuggestions.inclusions.join("\n"),
        timeline_description: data.aiSuggestions.timeline,
        total_amount: data.aiSuggestions.total_amount,
        payment_terms: data.paymentTerms,
        warranty_terms: data.warrantyTerms,
        status: "draft" as const,
        build_mode: data.buildMode,
        ai_suggestions: data.aiSuggestions,
        client_research: data.clientResearch || {},
        agent_conversation: data.agentConversation || [],
        intake_answers: data.intakeAnswers || {},
      };

      if (id) {
        await updateProposal(id, proposalData);
        toast.success("Proposal updated!");
        navigate(`/proposals/${id}`);
      } else {
        const newProposal = await createProposal(proposalData);
        toast.success("Proposal created!");
        navigate(`/proposals/${newProposal.id}`);
      }
    } catch (err) {
      console.error("Proposal save failed:", err);
      toast.error("Failed to save proposal. Please try again.");
    }
  };

  if (!company) {
    return (
      <div className="p-6 text-center text-gray-500">
        Loading company data...
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Mode Selector */}
      {!id && (
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-xl font-bold text-gray-900 mb-4">
              New Proposal
            </h1>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setMode("manual")}
                className={`flex flex-col items-center gap-2 p-6 rounded-lg border-2 transition-all ${
                  mode === "manual"
                    ? "border-red-600 bg-red-50"
                    : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                }`}
              >
                <PenLine
                  className={`h-8 w-8 ${
                    mode === "manual" ? "text-red-600" : "text-gray-400"
                  }`}
                />
                <span
                  className={`font-semibold text-lg ${
                    mode === "manual" ? "text-red-600" : "text-gray-700"
                  }`}
                >
                  Manual Build
                </span>
                <span className="text-sm text-gray-500 text-center">
                  I'll enter the details myself
                </span>
              </button>

              <button
                onClick={() => setMode("agent")}
                className={`flex flex-col items-center gap-2 p-6 rounded-lg border-2 transition-all ${
                  mode === "agent"
                    ? "border-red-600 bg-red-50"
                    : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                }`}
              >
                <Bot
                  className={`h-8 w-8 ${
                    mode === "agent" ? "text-red-600" : "text-gray-400"
                  }`}
                />
                <span
                  className={`font-semibold text-lg ${
                    mode === "agent" ? "text-red-600" : "text-gray-700"
                  }`}
                >
                  AI Agent
                </span>
                <span className="text-sm text-gray-500 text-center">
                  Let AI research & build the proposal
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Build Mode Content */}
      <div className="flex-1 overflow-hidden">
        {mode === "manual" ? (
          <ManualBuild company={company} onSave={handleSave} />
        ) : (
          <AgentBuild company={company} onSave={handleSave} />
        )}
      </div>
    </div>
  );
}
