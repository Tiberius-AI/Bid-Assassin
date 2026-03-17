import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Plus, Trash2, Pencil, FileText, MoreHorizontal } from "lucide-react";
import type { CoachConversation } from "@/hooks/useCoachConversations";

interface Props {
  conversations: CoachConversation[];
  activeId: string | null;
  onSelect: (convId: string) => void;
  onNew: () => void;
  onDelete: (convId: string) => void;
  onRename: (convId: string, title: string) => void;
}

export default function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onRename,
}: Props) {
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const startRename = (conv: CoachConversation) => {
    setEditingId(conv.id);
    setEditTitle(conv.title || "");
    setMenuOpen(null);
  };

  const commitRename = (convId: string) => {
    if (editTitle.trim()) {
      onRename(convId, editTitle.trim());
    }
    setEditingId(null);
  };

  return (
    <div className="w-[280px] shrink-0 bg-white border-r border-gray-200 flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-4 border-b border-gray-200">
        <button
          onClick={onNew}
          className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg px-4 py-2.5 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Chat
        </button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto py-2">
        {conversations.length === 0 ? (
          <p className="text-xs text-gray-400 text-center px-4 py-6">
            No conversations yet. Start a new chat!
          </p>
        ) : (
          conversations.map((conv) => (
            <div
              key={conv.id}
              className={`group relative flex items-center gap-2 px-3 py-2.5 mx-2 rounded-lg cursor-pointer transition-colors ${
                conv.id === activeId
                  ? "bg-red-50 border-l-2 border-red-600 pl-2.5"
                  : "hover:bg-gray-50"
              }`}
              onClick={() => {
                if (editingId !== conv.id) onSelect(conv.id);
              }}
            >
              {editingId === conv.id ? (
                <input
                  autoFocus
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onBlur={() => commitRename(conv.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename(conv.id);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="flex-1 text-xs border border-blue-400 rounded px-1 py-0.5 outline-none"
                />
              ) : (
                <>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-800 truncate">
                      {conv.title || "New conversation"}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] text-gray-400">
                        {formatDistanceToNow(new Date(conv.updated_at), { addSuffix: true })}
                      </span>
                      {conv.proposal_id && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full">
                          <FileText className="h-2.5 w-2.5" />
                          Proposal
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions menu trigger */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(menuOpen === conv.id ? null : conv.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-gray-200 text-gray-500 shrink-0"
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </button>
                </>
              )}

              {/* Dropdown menu */}
              {menuOpen === conv.id && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={(e) => { e.stopPropagation(); setMenuOpen(null); }}
                  />
                  <div className="absolute right-0 top-8 z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-36">
                    <button
                      onClick={(e) => { e.stopPropagation(); startRename(conv); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                    >
                      <Pencil className="h-3.5 w-3.5" /> Rename
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpen(null);
                        onDelete(conv.id);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
