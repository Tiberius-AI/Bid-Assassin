import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { agentChat } from "@/services/ai";
import {
  Save,
  ArrowLeft,
  Send,
  Bot,
  User,
  Loader2,
  DollarSign,
  FileText,
  MessageSquare,
  X,
} from "lucide-react";
import type { Company, AISuggestions, ChatMessage, ClientResearch } from "@/types";

interface ProposalReviewProps {
  company: Company;
  projectName: string;
  clientName: string;
  clientCompany: string;
  clientEmail: string;
  projectAddress: string;
  aiSuggestions: AISuggestions;
  paymentTerms: string;
  warrantyTerms: string;
  onUpdateSuggestions: (s: AISuggestions) => void;
  onUpdatePaymentTerms: (s: string) => void;
  onUpdateWarrantyTerms: (s: string) => void;
  onSave: () => Promise<void>;
  onBack: () => void;
  buildMode: "manual" | "agent";
  clientResearch?: ClientResearch | null;
  agentConversation?: ChatMessage[];
}

export default function ProposalReview({
  company,
  projectName,
  clientName,
  clientCompany,
  clientEmail,
  projectAddress,
  aiSuggestions,
  paymentTerms,
  warrantyTerms,
  onUpdateSuggestions,
  onUpdatePaymentTerms,
  onUpdateWarrantyTerms,
  onSave,
  onBack,
  buildMode,
  clientResearch,
  agentConversation = [],
}: ProposalReviewProps) {
  const [saving, setSaving] = useState(false);
  const [chatOpen, setChatOpen] = useState(buildMode === "agent");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(
    agentConversation.length > 0
      ? [
          ...agentConversation,
          {
            role: "assistant" as const,
            content:
              "Your proposal is ready! You can review it on the left and ask me to make any changes.",
            timestamp: new Date().toISOString(),
          },
        ]
      : [
          {
            role: "assistant" as const,
            content:
              "I've generated your proposal. Review it on the left, or tell me what changes you'd like.",
            timestamp: new Date().toISOString(),
          },
        ]
  );
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const sendChatMessage = async () => {
    if (!chatInput.trim() || chatSending) return;
    const userMsg: ChatMessage = {
      role: "user",
      content: chatInput.trim(),
      timestamp: new Date().toISOString(),
    };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput("");
    setChatSending(true);

    try {
      const result = await agentChat(
        company,
        chatMessages,
        {
          aiSuggestions,
          projectName,
          clientName,
          clientCompany,
          projectAddress,
          paymentTerms,
          warrantyTerms,
          clientResearch,
        },
        userMsg.content
      );

      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: result.reply,
        timestamp: new Date().toISOString(),
      };
      setChatMessages((prev) => [...prev, assistantMsg]);

      if (result.proposalUpdates) {
        onUpdateSuggestions({
          ...aiSuggestions,
          ...result.proposalUpdates,
        });
      }
    } catch {
      setChatMessages((prev) => [
        ...prev,
        {
          role: "assistant" as const,
          content: "Sorry, I had trouble processing that. Could you try again?",
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setChatSending(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // 30s timeout so the button can't spin forever
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Save timed out")), 30000)
      );
      await Promise.race([onSave(), timeout]);
    } catch (err) {
      console.error("Save error in ProposalReview:", err);
    } finally {
      setSaving(false);
    }
  };

  const updateLineItem = (
    index: number,
    field: string,
    value: string | number
  ) => {
    const items = [...aiSuggestions.line_items];
    items[index] = { ...items[index], [field]: value };
    if (field === "quantity" || field === "unit_price") {
      items[index].total_price =
        Number(items[index].quantity) * Number(items[index].unit_price);
    }
    const total = items.reduce((sum, item) => sum + item.total_price, 0);
    onUpdateSuggestions({ ...aiSuggestions, line_items: items, total_amount: total });
  };

  return (
    <div className="flex h-full">
      {/* Left: Proposal Preview */}
      <div className={`flex-1 overflow-y-auto p-6 ${chatOpen ? "lg:mr-96" : ""}`}>
        {/* Top Actions */}
        <div className="flex items-center justify-between mb-6">
          <Button variant="outline" onClick={onBack} className="gap-1">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setChatOpen(!chatOpen)}
              className="gap-1"
            >
              <MessageSquare className="h-4 w-4" />
              {chatOpen ? "Hide Chat" : "Chat with AI"}
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="gap-1 bg-teal-700 hover:bg-teal-800"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {saving ? "Saving..." : "Save Proposal"}
            </Button>
          </div>
        </div>

        {/* Proposal Document */}
        <div className="max-w-3xl mx-auto bg-white rounded-lg border border-gray-200 shadow-sm">
          {/* Header */}
          <div className="border-b border-gray-200 p-6">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-xl font-bold text-gray-900">
                  {company.name}
                </h1>
                <p className="text-sm text-gray-500 mt-1">
                  {[company.address, company.city, company.state, company.zip]
                    .filter(Boolean)
                    .join(", ")}
                </p>
                {company.phone && (
                  <p className="text-sm text-gray-500">{company.phone}</p>
                )}
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">PROPOSAL</p>
                <p className="text-xs text-gray-500 mt-1">
                  Date: {new Date().toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>

          {/* Client & Project Info */}
          <div className="border-b border-gray-200 p-6 grid grid-cols-2 gap-6">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase mb-1">
                Prepared For
              </p>
              <p className="text-sm font-medium text-gray-900">{clientName}</p>
              <p className="text-sm text-gray-600">{clientCompany}</p>
              {clientEmail && (
                <p className="text-sm text-gray-600">{clientEmail}</p>
              )}
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase mb-1">
                Project
              </p>
              <p className="text-sm font-medium text-gray-900">{projectName}</p>
              <p className="text-sm text-gray-600">{projectAddress}</p>
            </div>
          </div>

          {/* Scope of Work */}
          <div className="border-b border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <FileText className="h-4 w-4" /> Scope of Work
            </h3>
            <Textarea
              value={aiSuggestions.scope_of_work}
              onChange={(e) =>
                onUpdateSuggestions({
                  ...aiSuggestions,
                  scope_of_work: e.target.value,
                })
              }
              rows={6}
              className="text-sm"
            />
          </div>

          {/* Line Items */}
          <div className="border-b border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <DollarSign className="h-4 w-4" /> Pricing
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 pr-2 font-medium text-gray-500">
                      Description
                    </th>
                    <th className="text-right py-2 px-2 font-medium text-gray-500 w-16">
                      Qty
                    </th>
                    <th className="text-left py-2 px-2 font-medium text-gray-500 w-20">
                      Unit
                    </th>
                    <th className="text-right py-2 px-2 font-medium text-gray-500 w-24">
                      Unit Price
                    </th>
                    <th className="text-right py-2 pl-2 font-medium text-gray-500 w-24">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {aiSuggestions.line_items.map((item, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="py-2 pr-2">
                        <Input
                          value={item.description}
                          onChange={(e) =>
                            updateLineItem(i, "description", e.target.value)
                          }
                          className="text-sm h-8"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <Input
                          type="number"
                          value={item.quantity}
                          onChange={(e) =>
                            updateLineItem(i, "quantity", Number(e.target.value))
                          }
                          className="text-sm text-right h-8 w-16"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <Input
                          value={item.unit}
                          onChange={(e) =>
                            updateLineItem(i, "unit", e.target.value)
                          }
                          className="text-sm h-8 w-20"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <Input
                          type="number"
                          value={item.unit_price}
                          onChange={(e) =>
                            updateLineItem(
                              i,
                              "unit_price",
                              Number(e.target.value)
                            )
                          }
                          className="text-sm text-right h-8 w-24"
                        />
                      </td>
                      <td className="py-2 pl-2 text-right font-medium text-gray-900">
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
                      ${aiSuggestions.total_amount.toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {aiSuggestions.pricing_confidence && (
              <p className="text-xs text-gray-400 mt-2">
                Pricing confidence: {aiSuggestions.pricing_confidence} | Market
                range: ${aiSuggestions.market_range?.low?.toLocaleString()} -{" "}
                ${aiSuggestions.market_range?.high?.toLocaleString()}
              </p>
            )}
          </div>

          {/* Inclusions / Exclusions */}
          <div className="border-b border-gray-200 p-6 grid grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">
                Inclusions
              </h3>
              <Textarea
                value={aiSuggestions.inclusions.join("\n")}
                onChange={(e) =>
                  onUpdateSuggestions({
                    ...aiSuggestions,
                    inclusions: e.target.value.split("\n").filter(Boolean),
                  })
                }
                rows={4}
                className="text-sm"
              />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">
                Exclusions
              </h3>
              <Textarea
                value={aiSuggestions.exclusions.join("\n")}
                onChange={(e) =>
                  onUpdateSuggestions({
                    ...aiSuggestions,
                    exclusions: e.target.value.split("\n").filter(Boolean),
                  })
                }
                rows={4}
                className="text-sm"
              />
            </div>
          </div>

          {/* Timeline */}
          <div className="border-b border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">
              Timeline
            </h3>
            <Input
              value={aiSuggestions.timeline}
              onChange={(e) =>
                onUpdateSuggestions({
                  ...aiSuggestions,
                  timeline: e.target.value,
                })
              }
              className="text-sm"
            />
          </div>

          {/* Terms */}
          <div className="p-6 grid grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">
                Payment Terms
              </h3>
              <Input
                value={paymentTerms}
                onChange={(e) => onUpdatePaymentTerms(e.target.value)}
                className="text-sm"
              />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">
                Warranty
              </h3>
              <Input
                value={warrantyTerms}
                onChange={(e) => onUpdateWarrantyTerms(e.target.value)}
                className="text-sm"
              />
            </div>
          </div>

          {/* AI Suggestions */}
          {aiSuggestions.suggestions?.length > 0 && (
            <div className="p-6 bg-yellow-50 border-t border-yellow-200 rounded-b-lg">
              <h3 className="text-sm font-semibold text-yellow-800 mb-2">
                AI Suggestions
              </h3>
              <ul className="space-y-1">
                {aiSuggestions.suggestions.map((s, i) => (
                  <li key={i} className="text-sm text-yellow-700">
                    &bull; {s}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Right: Chat Panel */}
      {chatOpen && (
        <div className="fixed right-0 top-14 bottom-0 w-96 bg-white border-l border-gray-200 flex flex-col z-30">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-teal-700" />
              <span className="font-medium text-gray-900 text-sm">
                Proposal Assistant
              </span>
            </div>
            <button
              onClick={() => setChatOpen(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div
            ref={chatScrollRef}
            className="flex-1 overflow-y-auto p-4 space-y-3"
          >
            {chatMessages.slice(-20).map((msg, i) => (
              <div
                key={i}
                className={`flex gap-2 ${
                  msg.role === "user" ? "flex-row-reverse" : ""
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                    msg.role === "assistant"
                      ? "bg-teal-100 text-teal-700"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <Bot className="h-3 w-3" />
                  ) : (
                    <User className="h-3 w-3" />
                  )}
                </div>
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    msg.role === "assistant"
                      ? "bg-gray-50 text-gray-800"
                      : "bg-teal-700 text-white"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}
            {chatSending && (
              <div className="flex gap-2">
                <div className="w-6 h-6 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center shrink-0">
                  <Bot className="h-3 w-3" />
                </div>
                <div className="bg-gray-50 rounded-lg px-3 py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-gray-200 p-3">
            <div className="flex gap-2">
              <Input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" && !e.shiftKey && sendChatMessage()
                }
                placeholder="Ask for changes..."
                disabled={chatSending}
                className="text-sm"
              />
              <Button
                onClick={sendChatMessage}
                disabled={chatSending || !chatInput.trim()}
                size="sm"
                className="bg-teal-700 hover:bg-teal-800 px-2"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
