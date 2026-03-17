import { useState, useCallback } from "react";
import supabase from "@/supabase";

export interface CoachMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ProposalContext {
  project_name: string | null;
  client_name: string | null;
  trade: string | null;
  project_type: string | null;
  total_amount: number;
  line_items: Array<{
    description: string;
    quantity: number;
    unit: string;
    unit_price: number;
    total: number;
  }>;
}

export function useCoachChat(coachType = "estimator") {
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [proposalContext, setProposalContext] = useState<ProposalContext | null>(null);

  const loadConversation = useCallback(async (convId: string) => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from("coach_messages")
        .select("*")
        .eq("conversation_id", convId)
        .order("created_at", { ascending: true });

      if (fetchError) throw fetchError;

      setMessages((data || []).map((m: { role: "user" | "assistant"; content: string }) => ({
        role: m.role,
        content: m.content,
      })));
      setConversationId(convId);

      const { data: conv } = await supabase
        .from("coach_conversations")
        .select("proposal_id")
        .eq("id", convId)
        .single();

      if (conv?.proposal_id) {
        await loadProposalContext(conv.proposal_id);
      } else {
        setProposalContext(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load conversation");
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadProposalContext = useCallback(async (proposalId: string) => {
    const { data, error: fetchError } = await supabase
      .from("proposals")
      .select("*, line_items(*)")
      .eq("id", proposalId)
      .single();

    if (!fetchError && data) {
      setProposalContext({
        project_name: data.project_name,
        client_name: data.client_name,
        trade: data.trade,
        project_type: data.project_type,
        total_amount: data.total_amount,
        line_items: (data.line_items || []).map((li: {
          description: string;
          quantity: number;
          unit: string;
          unit_price: number;
          total_price: number;
        }) => ({
          description: li.description,
          quantity: li.quantity,
          unit: li.unit,
          unit_price: li.unit_price,
          total: li.total_price,
        })),
      });
    }
  }, []);

  const linkProposalToConversation = useCallback(async (proposalId: string, convId: string) => {
    await supabase
      .from("coach_conversations")
      .update({ proposal_id: proposalId })
      .eq("id", convId);
  }, []);

  const attachProposal = useCallback(async (proposalId: string) => {
    await loadProposalContext(proposalId);
    if (conversationId) {
      await linkProposalToConversation(proposalId, conversationId);
    }
  }, [conversationId, loadProposalContext, linkProposalToConversation]);

  const detachProposal = useCallback(async () => {
    setProposalContext(null);
    if (conversationId) {
      await supabase
        .from("coach_conversations")
        .update({ proposal_id: null })
        .eq("id", conversationId);
    }
  }, [conversationId]);

  const sendMessage = useCallback(
    async (userMessage: string) => {
      if (!userMessage.trim()) return;

      setError(null);
      const newMessages: CoachMessage[] = [...messages, { role: "user", content: userMessage }];
      setMessages(newMessages);
      setLoading(true);

      try {
        let convId = conversationId;
        if (!convId) {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) throw new Error("Not authenticated");

          const { data: newConv, error: convError } = await supabase
            .from("coach_conversations")
            .insert({
              user_id: user.id,
              coach_type: coachType,
              title: userMessage.slice(0, 80),
            })
            .select()
            .single();

          if (convError) throw convError;
          convId = newConv.id;
          setConversationId(convId);

          // If we already have proposal context, link it now
          if (proposalContext) {
            // We'll link after we know the ID from the select call above
            // but we need the proposal ID from supabase — skip if not tracked separately
          }
        }

        await supabase.from("coach_messages").insert({
          conversation_id: convId,
          role: "user",
          content: userMessage,
        });

        const { data: fnData, error: fnError } = await supabase.functions.invoke("ai-coach", {
          body: {
            coach_type: coachType,
            messages: newMessages,
            proposal_context: proposalContext,
            conversation_id: convId,
          },
        });

        if (fnError) throw new Error(fnError.message);
        const data = fnData;
        const updatedMessages: CoachMessage[] = [
          ...newMessages,
          { role: "assistant", content: data.message },
        ];
        setMessages(updatedMessages);

        await supabase.from("coach_messages").insert({
          conversation_id: convId,
          role: "assistant",
          content: data.message,
          tokens_used: data.usage,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to send message");
        setMessages(messages);
      } finally {
        setLoading(false);
      }
    },
    [messages, conversationId, coachType, proposalContext]
  );

  const newConversation = useCallback(() => {
    setMessages([]);
    setConversationId(null);
    setProposalContext(null);
    setError(null);
  }, []);

  return {
    messages,
    loading,
    error,
    conversationId,
    proposalContext,
    sendMessage,
    loadConversation,
    loadProposalContext,
    attachProposal,
    detachProposal,
    newConversation,
  };
}
