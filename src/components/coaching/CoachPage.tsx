import { useState } from "react";
import { ArrowLeft, Menu, X } from "lucide-react";
import ConversationSidebar from "./ConversationSidebar";
import ChatArea from "./ChatArea";
import { useCoachChat } from "@/hooks/useCoachChat";
import { useCoachConversations } from "@/hooks/useCoachConversations";
import { useSession } from "@/context/SessionContext";

const COACH_NAMES: Record<string, string> = {
  estimator: "The Estimator",
  prospector: "The Prospector",
  closer: "The Closer",
  gc_whisperer: "The GC Whisperer",
};

interface Props {
  coachType?: string;
  onBack: () => void;
}

export default function CoachPage({ coachType = "estimator", onBack }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [lastSentMessage, setLastSentMessage] = useState<string>("");
  const { company } = useSession();

  const companyContext = company ? {
    name: company.name,
    trades: company.trades ?? [],
    city: company.city,
    state: company.state,
    certifications: company.certifications ?? [],
    company_bio: company.company_bio,
  } : null;

  const {
    messages,
    loading,
    error,
    conversationId,
    proposalContext,
    sendMessage,
    loadConversation,
    attachProposal,
    detachProposal,
    newConversation,
  } = useCoachChat(coachType, companyContext);

  const {
    conversations,
    deleteConversation,
    renameConversation,
    updateConversationTimestamp,
    fetchConversations,
  } = useCoachConversations(coachType);

  const handleSend = async (message: string) => {
    setLastSentMessage(message);
    await sendMessage(message);
    fetchConversations();
    if (conversationId) updateConversationTimestamp(conversationId);
  };

  const handleSelectConversation = async (convId: string) => {
    await loadConversation(convId);
    setSidebarOpen(false);
  };

  const handleNewConversation = () => {
    newConversation();
    setSidebarOpen(false);
  };

  const handleDelete = async (convId: string) => {
    await deleteConversation(convId);
    if (conversationId === convId) newConversation();
  };

  const handleAttachProposal = async (proposalId: string, _proposalName: string) => {
    await attachProposal(proposalId);
  };

  const handleRetry = () => {
    if (lastSentMessage) sendMessage(lastSentMessage);
  };

  const sidebarEl = (
    <ConversationSidebar
      conversations={conversations}
      activeId={conversationId}
      onSelect={handleSelectConversation}
      onNew={handleNewConversation}
      onDelete={handleDelete}
      onRename={renameConversation}
    />
  );

  return (
    <div className="h-full flex overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex">
        {sidebarEl}
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/30 z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-50 lg:hidden flex flex-col">
            <div className="relative">
              <button
                onClick={() => setSidebarOpen(false)}
                className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 z-10"
              >
                <X className="h-4 w-4" />
              </button>
              {sidebarEl}
            </div>
          </div>
        </>
      )}

      {/* Main chat column */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <div className="bg-white border-b border-gray-200 px-4 h-12 flex items-center gap-3 shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden text-gray-500 hover:text-gray-800"
          >
            <Menu className="h-5 w-5" />
          </button>
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">AI Coaches</span>
          </button>
          <span className="text-gray-300 hidden sm:inline">/</span>
          <span className="text-sm font-medium text-gray-900">
            {COACH_NAMES[coachType] ?? coachType}
          </span>
        </div>

        {/* Chat area */}
        <ChatArea
          coachType={coachType}
          messages={messages}
          loading={loading}
          error={error}
          proposalContext={proposalContext}
          onSend={handleSend}
          onAttachProposal={handleAttachProposal}
          onDetachProposal={detachProposal}
          onRetry={handleRetry}
        />
      </div>
    </div>
  );
}
