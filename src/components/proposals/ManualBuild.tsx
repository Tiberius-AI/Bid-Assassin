import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { generateProposal } from "@/services/ai";
import ProposalReview from "./ProposalReview";
import { Loader2, Sparkles } from "lucide-react";
import type { Company, AISuggestions } from "@/types";

interface OpportunityPrefill {
  projectName?: string;
  clientName?: string;
  clientEmail?: string;
  clientCompany?: string;
  projectAddress?: string;
  solicitationNumber?: string;
  setAside?: string;
  sourceRef?: string;
  deadline?: string | null;
}

interface ManualBuildProps {
  company: Company;
  initialValues?: OpportunityPrefill;
  onSave: (data: {
    projectName: string;
    clientName: string;
    clientEmail: string;
    clientCompany: string;
    projectAddress: string;
    aiSuggestions: AISuggestions;
    paymentTerms: string;
    warrantyTerms: string;
    buildMode: "manual";
  }) => Promise<void>;
}

export default function ManualBuild({ company, initialValues, onSave }: ManualBuildProps) {
  const [step, setStep] = useState<"form" | "review">("form");
  const [generating, setGenerating] = useState(false);

  // Form state — seeded from opportunity pre-fill if present
  const [projectName, setProjectName] = useState(initialValues?.projectName ?? "");
  const [clientName, setClientName] = useState(initialValues?.clientName ?? "");
  const [clientEmail, setClientEmail] = useState(initialValues?.clientEmail ?? "");
  const [clientCompany, setClientCompany] = useState(initialValues?.clientCompany ?? "");
  const [projectAddress, setProjectAddress] = useState(initialValues?.projectAddress ?? "");
  const [tradeType, setTradeType] = useState(company.trades[0] || "");
  const [scopeNotes, setScopeNotes] = useState(
    initialValues?.solicitationNumber
      ? `Solicitation: ${initialValues.solicitationNumber}\n${initialValues.setAside ? `Set-Aside: ${initialValues.setAside}\n` : ""}${initialValues.sourceRef ? `Source: ${initialValues.sourceRef}\n` : ""}${initialValues.deadline ? `Response Deadline: ${new Date(initialValues.deadline).toLocaleDateString()}\n` : ""}\n`
      : ""
  );
  const [paymentTerms, setPaymentTerms] = useState(company.default_payment_terms);
  const [warrantyTerms, setWarrantyTerms] = useState(company.default_warranty_terms);

  // Generated data
  const [aiSuggestions, setAiSuggestions] = useState<AISuggestions | null>(null);

  const handleGenerate = async () => {
    if (!scopeNotes.trim()) return;
    setGenerating(true);
    try {
      const result = await generateProposal(company, scopeNotes, {
        projectName,
        clientName,
        clientCompany,
        projectAddress,
        tradeType,
      });
      setAiSuggestions(result);
      setStep("review");
    } catch (err) {
      const error = err as Error;
      alert(error.message || "Failed to generate proposal");
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!aiSuggestions) return;
    await onSave({
      projectName,
      clientName,
      clientEmail,
      clientCompany,
      projectAddress,
      aiSuggestions,
      paymentTerms,
      warrantyTerms,
      buildMode: "manual",
    });
  };

  if (step === "review" && aiSuggestions) {
    return (
      <ProposalReview
        company={company}
        projectName={projectName}
        clientName={clientName}
        clientCompany={clientCompany}
        clientEmail={clientEmail}
        projectAddress={projectAddress}
        aiSuggestions={aiSuggestions}
        paymentTerms={paymentTerms}
        warrantyTerms={warrantyTerms}
        onUpdateSuggestions={setAiSuggestions}
        onUpdatePaymentTerms={setPaymentTerms}
        onUpdateWarrantyTerms={setWarrantyTerms}
        onSave={handleSave}
        onBack={() => setStep("form")}
        buildMode="manual"
      />
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto">
      {initialValues?.sourceRef && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800 flex items-center gap-2">
          <span className="font-semibold">Federal Opportunity Pre-filled</span>
          <span className="text-red-600">&mdash;</span>
          <span className="text-red-700">{initialValues.sourceRef}</span>
        </div>
      )}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Project Details</h2>
          <p className="text-sm text-gray-500">
            Fill in the details and we'll generate a professional proposal.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="projectName">Project Name</Label>
            <Input
              id="projectName"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Office Building Repaint"
            />
          </div>
          <div>
            <Label htmlFor="tradeType">Trade Type</Label>
            <select
              id="tradeType"
              value={tradeType}
              onChange={(e) => setTradeType(e.target.value)}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
            >
              {company.trades.map((trade) => (
                <option key={trade} value={trade}>
                  {trade}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="clientName">Client Contact Name</Label>
            <Input
              id="clientName"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Jane Doe"
            />
          </div>
          <div>
            <Label htmlFor="clientCompany">Client Company</Label>
            <Input
              id="clientCompany"
              value={clientCompany}
              onChange={(e) => setClientCompany(e.target.value)}
              placeholder="ABC Property Management"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="clientEmail">Client Email</Label>
            <Input
              id="clientEmail"
              type="email"
              value={clientEmail}
              onChange={(e) => setClientEmail(e.target.value)}
              placeholder="jane@abcpm.com"
            />
          </div>
          <div>
            <Label htmlFor="projectAddress">Project Address</Label>
            <Input
              id="projectAddress"
              value={projectAddress}
              onChange={(e) => setProjectAddress(e.target.value)}
              placeholder="1234 Commerce St, Dallas TX"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="scopeNotes">
            Scope Notes / Job Details *
          </Label>
          <Textarea
            id="scopeNotes"
            value={scopeNotes}
            onChange={(e) => setScopeNotes(e.target.value)}
            placeholder="Walk-through notes, scope details, measurements, special conditions... Paste RFP text here if you have one."
            rows={8}
          />
          <p className="text-xs text-gray-400 mt-1">
            The more detail you provide, the better the AI-generated proposal will be.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="paymentTerms">Payment Terms</Label>
            <Input
              id="paymentTerms"
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="warrantyTerms">Warranty Terms</Label>
            <Input
              id="warrantyTerms"
              value={warrantyTerms}
              onChange={(e) => setWarrantyTerms(e.target.value)}
            />
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t border-gray-100">
          <Button
            onClick={handleGenerate}
            disabled={generating || !scopeNotes.trim()}
            className="gap-2 bg-red-600 hover:bg-red-700"
          >
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Generating...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" /> Generate Proposal
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
