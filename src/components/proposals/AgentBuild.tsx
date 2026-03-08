import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { agentIntakeChat, researchClient, generateProposal } from "@/services/ai";
import ProposalReview from "./ProposalReview";
import supabase from "@/supabase";
import { toast } from "react-hot-toast";
import {
  Loader2,
  Send,
  Bot,
  User,
  CheckCircle2,
  Circle,
  Search,
  Upload,
  ImageIcon,
  X,
  CheckCircle,
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
    projectPhotos?: string[];
  }) => Promise<void>;
}

type Phase = "intake" | "assets" | "researching" | "generating" | "review";

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

  // Assets state (logo + photos collected before research)
  const [localLogoUrl, setLocalLogoUrl] = useState<string | null>(company.logo_url);
  const [logoUploading, setLogoUploading] = useState(false);
  const [pendingPhotos, setPendingPhotos] = useState<string[]>([]);
  const [photosUploading, setPhotosUploading] = useState(false);
  // Stable key for pending photo uploads — won't change across renders
  const pendingKeyRef = useRef(`pending-${Date.now()}`);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const savedIntakeRef = useRef<Record<string, string>>({});
  const savedMessagesRef = useRef<ChatMessage[]>([]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // --- Intake chat -----------------------------------------------------------

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
        savedIntakeRef.current = result.intakeData;
        savedMessagesRef.current = [...updatedMessages, assistantMsg];
        // Go to assets phase before research
        setPhase("assets");
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

  // --- Assets: logo upload ---------------------------------------------------

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      toast.error("Only PNG and JPG files are allowed");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Logo must be under 2MB");
      return;
    }
    setLogoUploading(true);
    try {
      const ext = file.type === "image/png" ? "png" : "jpg";
      const path = `${company.id}/logo.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("company-logos")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("company-logos").getPublicUrl(path);
      const url = `${data.publicUrl}?t=${Date.now()}`;
      await supabase.from("companies").update({ logo_url: url }).eq("id", company.id);
      setLocalLogoUrl(url);
      toast.success("Logo uploaded!");
    } catch {
      toast.error("Failed to upload logo");
    } finally {
      setLogoUploading(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  };

  // --- Assets: photo upload --------------------------------------------------

  const handlePhotosUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const valid = files.filter((f) => ["image/png", "image/jpeg"].includes(f.type));
    if (valid.length !== files.length) toast.error("Only PNG/JPG files accepted");
    if (!valid.length) return;

    setPhotosUploading(true);
    try {
      const uploaded: string[] = [];
      for (const file of valid) {
        const ext = file.type === "image/png" ? "png" : "jpg";
        const path = `${pendingKeyRef.current}/photos/${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("proposal-assets")
          .upload(path, file, { contentType: file.type });
        if (upErr) { toast.error(`Failed to upload ${file.name}`); continue; }
        const { data } = supabase.storage.from("proposal-assets").getPublicUrl(path);
        uploaded.push(data.publicUrl);
      }
      setPendingPhotos((prev) => [...prev, ...uploaded]);
      if (uploaded.length)
        toast.success(`${uploaded.length} photo${uploaded.length > 1 ? "s" : ""} added`);
    } finally {
      setPhotosUploading(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  };

  const removePhoto = (url: string) =>
    setPendingPhotos((prev) => prev.filter((p) => p !== url));

  // --- Research + generation ------------------------------------------------

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
      setResearchSteps((prev) => prev.map((s, i) => (i === 0 ? { ...s, done: true } : s)));

      const rawResearch = await researchClient(
        intake.client_name || "",
        intake.client_company || "",
        intake.project_address || ""
      );

      setResearchSteps((prev) => prev.map((s, i) => (i <= 1 ? { ...s, done: true } : s)));

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

      setResearchSteps((prev) => prev.map((s, i) => (i <= 2 ? { ...s, done: true } : s)));

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

  // --- Save ------------------------------------------------------------------

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
      projectPhotos: pendingPhotos,
    });
  };

  // --- Phases: researching / generating -------------------------------------

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
                <span className={`text-sm ${step.done ? "text-gray-900" : "text-gray-400"}`}>
                  {step.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // --- Phase: review --------------------------------------------------------

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
        onBack={() => setPhase("assets")}
        buildMode="agent"
        clientResearch={clientResearch}
        agentConversation={messages}
      />
    );
  }

  // --- Phase: assets --------------------------------------------------------

  if (phase === "assets") {
    return (
      <div className="flex flex-col h-full max-w-3xl mx-auto p-6 overflow-y-auto">
        {/* Agent message */}
        <div className="flex gap-3 mb-6">
          <div className="w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0">
            <Bot className="h-4 w-4" />
          </div>
          <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-800 max-w-[85%]">
            <p>
              Great — I have everything I need to build the proposal. Before I start, let's add a few
              finishing touches that will make it look polished and professional.
            </p>
          </div>
        </div>

        {/* Logo card */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5 mb-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Company Logo</h3>
          <p className="text-xs text-gray-500 mb-4">
            Your logo appears in the proposal header and PDF.
          </p>

          {localLogoUrl ? (
            <div className="flex items-center gap-4">
              <img
                src={localLogoUrl}
                alt="Company logo"
                className="h-12 w-auto max-w-[120px] object-contain rounded border border-gray-200 bg-gray-50 p-1"
              />
              <div className="flex items-center gap-2 text-green-600 text-sm font-medium">
                <CheckCircle className="h-4 w-4" />
                Logo is set
              </div>
              <button
                type="button"
                onClick={() => logoInputRef.current?.click()}
                className="text-xs text-gray-400 hover:text-gray-600 underline ml-auto"
              >
                Replace
              </button>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpeg"
                className="hidden"
                onChange={handleLogoUpload}
              />
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <div className="h-12 w-28 rounded border-2 border-dashed border-gray-300 flex items-center justify-center bg-gray-50 text-gray-400 text-xs">
                No logo
              </div>
              <div>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/jpeg"
                  className="hidden"
                  onChange={handleLogoUpload}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={logoUploading}
                  onClick={() => logoInputRef.current?.click()}
                  className="gap-2"
                >
                  {logoUploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  {logoUploading ? "Uploading..." : "Upload Logo"}
                </Button>
                <p className="text-xs text-gray-400 mt-1">PNG or JPG, max 2MB</p>
              </div>
            </div>
          )}
        </div>

        {/* Photos card */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5 mb-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Project Photos</h3>
          <p className="text-xs text-gray-500 mb-4">
            Before/after shots, reference work, or portfolio images. These appear in the proposal
            and PDF — great for visual trades like landscaping.
          </p>

          {pendingPhotos.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-4">
              {pendingPhotos.map((url) => (
                <div key={url} className="relative group aspect-square">
                  <img
                    src={url}
                    alt="Project photo"
                    className="w-full h-full object-cover rounded-lg border border-gray-200"
                  />
                  <button
                    type="button"
                    onClick={() => removePhoto(url)}
                    className="absolute top-1 right-1 h-5 w-5 rounded-full bg-red-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-700"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/png,image/jpeg"
              multiple
              className="hidden"
              onChange={handlePhotosUpload}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={photosUploading}
              onClick={() => photoInputRef.current?.click()}
              className="gap-2"
            >
              {photosUploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ImageIcon className="h-4 w-4" />
              )}
              {photosUploading ? "Uploading..." : "Add Photos"}
            </Button>
            <span className="text-xs text-gray-400 ml-3">PNG or JPG, multiple files OK</span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3 justify-end">
          <Button
            variant="outline"
            onClick={() => startResearch(savedIntakeRef.current, savedMessagesRef.current)}
            className="text-gray-500"
          >
            Skip, build now
          </Button>
          <Button
            onClick={() => startResearch(savedIntakeRef.current, savedMessagesRef.current)}
            disabled={logoUploading || photosUploading}
            className="bg-red-600 hover:bg-red-700 gap-2"
          >
            {logoUploading || photosUploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            Build My Proposal
          </Button>
        </div>
      </div>
    );
  }

  // --- Phase: intake (chat) -------------------------------------------------

  return (
    <div className="flex flex-col h-full max-w-3xl mx-auto">
      {/* Chat Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
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
