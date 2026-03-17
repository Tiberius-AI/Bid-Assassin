import { useState, useEffect, useCallback } from "react";
import supabase from "@/supabase";

export interface CoachConversation {
  id: string;
  title: string | null;
  coach_type: string;
  updated_at: string;
  proposal_id: string | null;
}

export function useCoachConversations(coachType = "estimator") {
  const [conversations, setConversations] = useState<CoachConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConversations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error: fetchError } = await supabase
        .from("coach_conversations")
        .select("id, title, coach_type, updated_at, proposal_id")
        .eq("user_id", user.id)
        .eq("coach_type", coachType)
        .order("updated_at", { ascending: false })
        .limit(50);

      if (fetchError) throw fetchError;
      setConversations(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load conversations");
    } finally {
      setLoading(false);
    }
  }, [coachType]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const deleteConversation = useCallback(async (convId: string) => {
    const { error: delError } = await supabase
      .from("coach_conversations")
      .delete()
      .eq("id", convId);

    if (!delError) {
      setConversations((prev) => prev.filter((c) => c.id !== convId));
    }
  }, []);

  const renameConversation = useCallback(async (convId: string, newTitle: string) => {
    const { error: updateError } = await supabase
      .from("coach_conversations")
      .update({ title: newTitle })
      .eq("id", convId);

    if (!updateError) {
      setConversations((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, title: newTitle } : c))
      );
    }
  }, []);

  const addConversation = useCallback((conv: CoachConversation) => {
    setConversations((prev) => [conv, ...prev]);
  }, []);

  const updateConversationTimestamp = useCallback((convId: string) => {
    setConversations((prev) =>
      prev
        .map((c) => (c.id === convId ? { ...c, updated_at: new Date().toISOString() } : c))
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    );
  }, []);

  return {
    conversations,
    loading,
    error,
    fetchConversations,
    deleteConversation,
    renameConversation,
    addConversation,
    updateConversationTimestamp,
  };
}
