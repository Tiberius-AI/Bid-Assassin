import { useEffect, useRef, useState } from "react";
import { Send, Paperclip, X, AlertCircle, RefreshCw } from "lucide-react";
import ChatMessageBubble, { TypingIndicator } from "./ChatMessage";
import StarterPrompts from "./StarterPrompts";
import ProposalSelector from "./ProposalSelector";
import type { CoachMessage, ProposalContext } from "@/hooks/useCoachChat";

interface Props {
  coachType: string;
  messages: CoachMessage[];
  loading: boolean;
  error: string | null;
  proposalContext: ProposalContext | null;
  onSend: (message: string) => void;
  onAttachProposal: (proposalId: string, proposalName: string) => void;
  onDetachProposal: () => void;
  onRetry: () => void;
}

export default function ChatArea({
  coachType,
  messages,
  loading,
  error,
  proposalContext,
  onSend,
  onAttachProposal,
  onDetachProposal,
  onRetry,
}: Props) {
  const [input, setInput] = useState("");
  const [showProposalSelector, setShowProposalSelector] = useState(false);
  const [attachedProposalName, setAttachedProposalName] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync attached name when context is removed externally
  useEffect(() => {
    if (!proposalContext) setAttachedProposalName(null);
  }, [proposalContext]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 96)}px`;
    }
  }, [input]);

  const handleSend = () => {
    if (!input.trim() || loading) return;
    onSend(input.trim());
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleProposalSelect = (proposalId: string, proposalName: string) => {
    setAttachedProposalName(proposalName);
    onAttachProposal(proposalId, proposalName);
    setShowProposalSelector(false);
  };

  const handleDetach = () => {
    setAttachedProposalName(null);
    onDetachProposal();
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-gray-50 overflow-hidden">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <StarterPrompts coachType={coachType} onSelect={(prompt) => onSend(prompt)} />
        ) : (
          <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
            {messages.map((msg, idx) => (
              <ChatMessageBubble key={idx} message={msg} />
            ))}
            {loading && <TypingIndicator />}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-4 mb-2 flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button
            onClick={onRetry}
            className="flex items-center gap-1 text-xs font-medium hover:underline"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </button>
        </div>
      )}

      {/* Input area */}
      <div className="bg-white border-t border-gray-200 px-4 py-3">
        {/* Proposal banner */}
        {attachedProposalName && (
          <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 mb-2 text-xs text-blue-700">
            <span>Reviewing: <strong>{attachedProposalName}</strong></span>
            <button onClick={handleDetach} className="ml-2 text-blue-400 hover:text-blue-700">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <div className="flex items-end gap-2">
          <div className="flex-1 border border-gray-200 rounded-xl bg-white focus-within:border-gray-400 transition-colors">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask The Estimator anything..."
              rows={1}
              className="w-full resize-none px-4 py-3 text-sm text-gray-900 placeholder-gray-400 bg-transparent outline-none rounded-xl"
              style={{ maxHeight: "96px" }}
            />
          </div>

          <button
            onClick={() => setShowProposalSelector(true)}
            title="Attach a proposal for review"
            className="p-3 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
          >
            <Paperclip className="h-4 w-4" />
          </button>

          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className="p-3 rounded-xl bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>

        <p className="text-[10px] text-gray-400 text-center mt-2">
          Press Enter to send · Shift+Enter for new line
        </p>
      </div>

      {showProposalSelector && (
        <ProposalSelector
          onSelect={handleProposalSelect}
          onClose={() => setShowProposalSelector(false)}
        />
      )}
    </div>
  );
}
