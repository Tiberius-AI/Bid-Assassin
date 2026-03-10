import { useState } from "react";
import { useSession } from "@/context/SessionContext";
import { useProposals } from "@/hooks/useProposals";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { toast } from "react-hot-toast";
import supabase from "@/supabase";
import ManualBuild from "@/components/proposals/ManualBuild";
import AgentBuild from "@/components/proposals/AgentBuild";
import { PenLine, Bot } from "lucide-react";
import type { AISuggestions, ChatMessage, ClientResearch } from "@/types";

interface OpportunityRouteState {
  fromOpportunity?: {
    matchId: string;
    opportunityId: string;
    projectName: string;
    clientName: string;
    clientEmail: string;
    clientPhone: string;
    clientContactName: string;
    projectAddress: string;
    solicitationNumber: string;
    setAside: string;
    sourceRef: string;
    deadline: string | null;
  };
}

export default function ProposalBuilder() {
  const { id } = useParams();
  const { company } = useSession();
  const { createProposal, updateProposal } = useProposals(company?.id);
  const navigate = useNavigate();
  const location = useLocation();

  const fromOpportunity = (location.state as OpportunityRouteState | null)?.fromOpportunity;

  const [mode, setMode] = useState<"manual" | "agent">(fromOpportunity ? "manual" : "agent");

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
    projectPhotos?: string[];
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
        project_photos: data.projectPhotos || [],
      };

      if (id) {
        await updateProposal(id, proposalData);
        toast.success("Proposal updated!");
        navigate(`/proposals/${id}`);
      } else {
        const newProposal = await createProposal(proposalData);

        // Auto-create Client record if none exists for this company/contact
        const clientKey = data.clientCompany?.trim() || data.clientName?.trim();
        if (clientKey && company) {
          const matchField = data.clientCompany?.trim() ? "company_name" : "name";
          const { data: existing } = await supabase
            .from("clients")
            .select("id")
            .eq("company_id", company.id)
            .eq(matchField, clientKey)
            .maybeSingle();

          if (!existing) {
            await supabase.from("clients").insert({
              company_id: company.id,
              name: data.clientName || data.clientCompany,
              company_name: data.clientCompany || null,
              email: data.clientEmail || null,
              type: "gc",
              relationship_status: "warm",
            });
          }
        }

        // Auto-create Project record linked to this proposal
        if (company) {
          await supabase.from("projects").insert({
            company_id: company.id,
            proposal_id: newProposal.id,
            name: data.projectName || `${data.clientCompany || data.clientName} Bid`,
            client_name: data.clientName || null,
            client_company: data.clientCompany || null,
            estimated_value: data.aiSuggestions.total_amount || 0,
            status: "reviewing",
          });
        }

        // Link back to the opportunity match if this came from The Prospector
        if (fromOpportunity?.matchId) {
          await supabase
            .from("opportunity_matches")
            .update({ proposal_id: newProposal.id, status: "proposal_started" })
            .eq("id", fromOpportunity.matchId);
        }

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
              {fromOpportunity ? "Build Proposal from Opportunity" : "New Proposal"}
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
          <ManualBuild
            company={company}
            onSave={handleSave}
            initialValues={fromOpportunity ? {
              projectName: fromOpportunity.projectName,
              clientName: fromOpportunity.clientContactName,
              clientEmail: fromOpportunity.clientEmail,
              clientCompany: fromOpportunity.clientName,
              projectAddress: fromOpportunity.projectAddress,
              solicitationNumber: fromOpportunity.solicitationNumber,
              setAside: fromOpportunity.setAside,
              sourceRef: fromOpportunity.sourceRef,
              deadline: fromOpportunity.deadline,
            } : undefined}
          />
        ) : (
          <AgentBuild company={company} onSave={handleSave} />
        )}
      </div>
    </div>
  );
}
