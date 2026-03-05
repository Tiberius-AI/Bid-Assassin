import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { agentIntakeChat, researchClient, generateProposal } from "@/services/ai";
import ProposalReview from "./ProposalReview";
import {
  Loader2,
  Send,
  Bot,
  User,
  CheckCircle2,
  Circle,
  Search,
} from "lucide-react";
import type { Company, AISuggestions, ChatMessage, ClientResearch } from "@/types";

interface AgentBuildProps {
  company: Company;
  onSave: (data: {
    projectName: string;
    clientName: string;
    clientEmail: string;
    clientCompany: string;
    projectAddress: string;
    aiSuggestions: AISuggestions;
    paymentTerms: string;
    warrantyTerms: string;
    buildMode: "agent";
    clientResearch?: ClientResearch;
    agentConversation?: ChatMessage[];
    intakeAnswers?: Record<string, string>;
  }) => Promise<void>;
}

type Phase = "intake" | "researching" | "generating" | "review";

interface ResearchStep {
  label: string;
  done: boolean;
}

export default function AgentBuild({ company, onSave }: AgentBuildProps) {
  const [phase, setPhase] = useState<Phase>("intake");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: `Hi! I'm your proposal assistant for ${company.name}. I'll help you build a tailored proposal.\n\nLet's start -- who is the potential client? (Company name, contact name, and email if you have it)`,
      timestamp: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [intakeData, setIntakeData] = useState<Record<string, string>>({});

  // Research state
  const [researchSteps, setResearchSteps] = useState<ResearchStep[]>([]);
  const [clientResearch, setClientResearch] = useState<ClientResearch | null>(null);

  // Proposal state
  const [aiSuggestions, setAiSuggestions] = useState<AISuggestions | null>(null);
  const [paymentTerms, setPaymentTerms] = useState(company.default_payment_terms);
  const [warrantyTerms, setWarrantyTerms] = useState(company.default_warranty_terms);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || sending) return;
    const userMsg: ChatMessage = {
      role: "user",
      content: input.trim(),
      timestamp: new Date().toISOString(),
    };

    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setSending(true);

    try {
      const result = await agentIntakeChat(company, messages, userMsg.content);

      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: result.reply || "Got it! Let me process that...",
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);

      if (result.intakeComplete && result.intakeData) {
        setIntakeData(result.intakeData);
        // Start research phase
        await startResearch(result.intakeData, [...updatedMessages, assistantMsg]);
      }
    } catch (err) {
      console.error("AgentBuild intake error:", err);
      const errDetail = err instanceof Error ? err.message : String(err);
      const errorMsg: ChatMessage = {
        role: "assistant",
        content: `Sorry, I hit an error: ${errDetail}`,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setSending(false);
    }
  };

  const startResearch = async (
    intake: Record<string, string>,
    _conversation: ChatMessage[]
  ) => {
    setPhase("researching");
    const steps: ResearchStep[] = [
      { label: "Searching for company info", done: false },
      { label: "Checking online presence", done: false },
      { label: "Analyzing project context", done: false },
      { label: "Building your proposal", done: false },
    ];
    setResearchSteps(steps);

    try {
      // Research client
      setResearchSteps((prev) =>
        prev.map((s, i) => (i === 0 ? { ...s, done: true } : s))
      );

      const rawResearch = await researchClient(
        intake.client_name || "",
        intake.client_company || "",
        intake.project_address || ""
      );

      setResearchSteps((prev) =>
        prev.map((s, i) => (i <= 1 ? { ...s, done: true } : s))
      );

      let research: ClientResearch;
      try {
        const cleaned = rawResearch
          .replace(/```json\n?/g, "")
          .replace(/```\n?/g, "")
          .trim();
        research = JSON.parse(cleaned);
      } catch {
        research = {
          company_overview: rawResearch,
          google_business: null,
          website_summary: "",
          social_media: null,
          tailoring_insights: [],
        };
      }
      setClientResearch(research);

      setResearchSteps((prev) =>
        prev.map((s, i) => (i <= 2 ? { ...s, done: true } : s))
      );

      // Generate proposal
      setPhase("generating");
      const scopeNotes = `
Client: ${intake.client_company} (${intake.client_name})
Project Address: ${intake.project_address}
Trade: ${intake.trade_type}
Scope Notes: ${intake.scope_notes || "General scope as discussed"}
Special Requirements: ${intake.special_requirements || "None specified"}
Additional Notes: ${intake.additional_notes || "None"}

Client Research Insights:
${research.company_overview}
${research.tailoring_insights?.map((t) => `- ${t}`).join("\n") || ""}
      `.trim();

      const result = await generateProposal(company, scopeNotes, {
        projectName: `${intake.trade_type || company.trades[0]} - ${intake.client_company}`,
        clientName: intake.client_name || "",
        clientCompany: intake.client_company || "",
        projectAddress: intake.project_address || "",
        tradeType: intake.trade_type || company.trades[0] || "",
      });

      setResearchSteps((prev) => prev.map((s) => ({ ...s, done: true })));

      setAiSuggestions(result);
      setPhase("review");
    } catch {
      setPhase("intake");
      const errorMsg: ChatMessage = {
        role: "assistant",
        content:
          "I ran into an issue during research. Let me try a different approach -- could you provide a bit more detail about the project scope?",
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    }
  };

  const handleSave = async () => {
    if (!aiSuggestions) return;
    await onSave({
      projectName:
        intakeData.project_name ||
        `${intakeData.trade_type || company.trades[0]} - ${intakeData.client_company}`,
      clientName: intakeData.client_name || "",
      clientEmail: intakeData.client_email || "",
      clientCompany: intakeData.client_company || "",
      projectAddress: intakeData.project_address || "",
      aiSuggestions,
      paymentTerms,
      warrantyTerms,
      buildMode: "agent",
      clientResearch: clientResearch || undefined,
      agentConversation: messages,
      intakeAnswers: intakeData,
    });
  };

  // Research/Generating phase
  if (phase === "researching" || phase === "generating") {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="max-w-md w-full bg-white rounded-lg border border-gray-200 shadow-sm p-8">
          <div className="flex items-center gap-3 mb-6">
            <Search className="h-6 w-6 text-red-600 animate-pulse" />
            <h2 className="text-lg font-semibold text-gray-900">
              {phase === "researching"
                ? "Researching client..."
                : "Building your proposal..."}
            </h2>
          </div>
          <div className="space-y-3">
            {researchSteps.map((step, i) => (
              <div key={i} className="flex items-center gap-3">
                {step.done ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                ) : i === researchSteps.findIndex((s) => !s.done) ? (
                  <Loader2 className="h-5 w-5 text-red-600 animate-spin shrink-0" />
                ) : (
                  <Circle className="h-5 w-5 text-gray-300 shrink-0" />
                )}
                <span
                  className={`text-sm ${
                    step.done ? "text-gray-900" : "text-gray-400"
                  }`}
                >
                  {step.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Review phase
  if (phase === "review" && aiSuggestions) {
    return (
      <ProposalReview
        company={company}
        projectName={
          intakeData.project_name ||
          `${intakeData.trade_type || company.trades[0]} - ${intakeData.client_company}`
        }
        clientName={intakeData.client_name || ""}
        clientCompany={intakeData.client_company || ""}
        clientEmail={intakeData.client_email || ""}
        projectAddress={intakeData.project_address || ""}
        aiSuggestions={aiSuggestions}
        paymentTerms={paymentTerms}
        warrantyTerms={warrantyTerms}
        onUpdateSuggestions={setAiSuggestions}
        onUpdatePaymentTerms={setPaymentTerms}
        onUpdateWarrantyTerms={setWarrantyTerms}
        onSave={handleSave}
        onBack={() => setPhase("intake")}
        buildMode="agent"
        clientResearch={clientResearch}
        agentConversation={messages}
      />
    );
  }

  // Intake phase - Chat UI
  return (
    <div className="flex flex-col h-full max-w-3xl mx-auto">
      {/* Chat Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex gap-3 ${
              msg.role === "user" ? "flex-row-reverse" : ""
            }`}
          >
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                msg.role === "assistant"
                  ? "bg-red-100 text-red-600"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {msg.role === "assistant" ? (
                <Bot className="h-4 w-4" />
              ) : (
                <User className="h-4 w-4" />
              )}
            </div>
            <div
              className={`max-w-[80%] rounded-lg px-4 py-3 text-sm ${
                msg.role === "assistant"
                  ? "bg-white border border-gray-200 text-gray-800"
                  : "bg-red-600 text-white"
              }`}
            >
              <p className="whitespace-pre-wrap">{msg.content}</p>
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0">
              <Bot className="h-4 w-4" />
            </div>
            <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
              <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 bg-white p-4">
        <div className="flex gap-2 max-w-3xl mx-auto">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
            placeholder="Type your response..."
            disabled={sending}
            className="flex-1"
          />
          <Button
            onClick={sendMessage}
            disabled={sending || !input.trim()}
            className="bg-red-600 hover:bg-red-700 px-3"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
