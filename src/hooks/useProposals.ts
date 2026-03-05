import { useState, useEffect, useCallback } from "react";
import supabase from "@/supabase";
import type { Proposal } from "@/types";

export function useProposals(companyId: string | undefined) {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchProposals = useCallback(async () => {
    if (!companyId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const { data, error: err } = await supabase
        .from("proposals")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });

      if (err) throw err;
      setProposals((data || []) as Proposal[]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load proposals";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [companyId, refreshKey]);

  useEffect(() => {
    fetchProposals();
  }, [fetchProposals]);

  const createProposal = async (proposalData: Partial<Proposal>) => {
    if (!companyId) throw new Error("No company found");
    const { data, error: err } = await supabase
      .from("proposals")
      .insert({ ...proposalData, company_id: companyId })
      .select()
      .single();
    if (err) throw err;
    const newProposal = data as Proposal;
    setProposals((prev) => [newProposal, ...prev]);
    return newProposal;
  };

  const updateProposal = async (id: string, updates: Partial<Proposal>) => {
    const { error: err } = await supabase
      .from("proposals")
      .update(updates)
      .eq("id", id);
    if (err) throw err;
    setProposals((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...updates } : p))
    );
  };

  const deleteProposal = async (id: string) => {
    const { error: err } = await supabase
      .from("proposals")
      .delete()
      .eq("id", id);
    if (err) throw err;
    setProposals((prev) => prev.filter((p) => p.id !== id));
  };

  const refresh = () => setRefreshKey((k) => k + 1);

  return {
    proposals,
    loading,
    error,
    createProposal,
    updateProposal,
    deleteProposal,
    refresh,
  };
}

export function useProposal(proposalId: string | undefined) {
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!proposalId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const fetch = async () => {
      try {
        setLoading(true);
        setError(null);
        const { data, error: err } = await supabase
          .from("proposals")
          .select("*")
          .eq("id", proposalId)
          .single();

        if (err) throw err;
        if (!cancelled) setProposal(data as Proposal);
      } catch (err: unknown) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "Failed to load proposal";
          setError(message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetch();
    return () => { cancelled = true; };
  }, [proposalId]);

  const updateProposal = async (updates: Partial<Proposal>) => {
    if (!proposalId) return;
    const { error: err } = await supabase
      .from("proposals")
      .update(updates)
      .eq("id", proposalId);
    if (err) throw err;
    setProposal((prev) => (prev ? { ...prev, ...updates } : prev));
  };

  return { proposal, setProposal, loading, error, updateProposal };
}
