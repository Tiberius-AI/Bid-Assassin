import { useState, useEffect, useCallback } from "react";
import supabase from "@/supabase";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type OppStatus =
  | "new" | "saved" | "dismissed" | "reached_out"
  | "responded" | "proposal_sent" | "won" | "lost";

export interface DbOpportunity {
  id: string;
  card_type: "company" | "person";
  source: string;
  source_id: string | null;
  status: OppStatus;
  match_score: number;
  match_reason: string | null;
  is_new: boolean;
  shown_date: string;
  // Company
  business_name:     string | null;
  business_type:     string | null;
  business_category: string | null;
  address:           string | null;
  distance_miles:    number | null;
  phone:             string | null;
  website:           string | null;
  google_rating:     number | null;
  google_reviews:    number | null;
  // Person
  person_name:     string | null;
  person_title:    string | null;
  person_company:  string | null;
  linkedin_url:    string | null;
  person_location: string | null;
}

export interface OpportunitySettings {
  trades:       string[];
  radius_miles: number;
  center_lat:   number | null;
  center_lng:   number | null;
  rotation_index: number;
}

// ─────────────────────────────────────────────────────────────
// Main hook
// ─────────────────────────────────────────────────────────────

export function useOpportunities(companyId: string | undefined) {
  const [opportunities, setOpportunities] = useState<DbOpportunity[]>([]);
  const [settings, setSettings]           = useState<OpportunitySettings | null>(null);
  const [loading, setLoading]             = useState(true);
  const [generating, setGenerating]       = useState(false);
  const [error, setError]                 = useState<string | null>(null);

  const today = new Date().toISOString().split("T")[0];

  // ── Load today's opportunities from DB ────────────────────
  const loadOpportunities = useCallback(async () => {
    if (!companyId) { setLoading(false); return; }
    setLoading(true);
    setError(null);

    const { data, error: err } = await supabase
      .from("opportunities")
      .select("*")
      .eq("company_id", companyId)
      .eq("shown_date", today)
      .neq("status", "dismissed")
      .order("match_score", { ascending: false });

    if (err) {
      setError(err.message);
    } else {
      setOpportunities((data ?? []) as DbOpportunity[]);
    }
    setLoading(false);
  }, [companyId, today]);

  // ── Load opportunity_settings ─────────────────────────────
  const loadSettings = useCallback(async () => {
    if (!companyId) return;

    const { data } = await supabase
      .from("opportunity_settings")
      .select("trades, radius_miles, center_lat, center_lng, rotation_index")
      .eq("company_id", companyId)
      .single();

    if (data) {
      setSettings({
        trades:         data.trades        ?? [],
        radius_miles:   data.radius_miles  ?? 50,
        center_lat:     data.center_lat    ?? null,
        center_lng:     data.center_lng    ?? null,
        rotation_index: data.rotation_index ?? 0,
      });
    }
  }, [companyId]);

  // ── Generate today's batch via edge function ──────────────
  const generate = useCallback(async (forceRefresh = false) => {
    if (!companyId) return;
    setGenerating(true);
    setError(null);

    try {
      const { error: fnErr } = await supabase.functions.invoke("generate-opportunities", {
        body: { company_id: companyId, force_refresh: forceRefresh },
      });

      if (fnErr) {
        setError(fnErr.message || "Failed to generate opportunities");
      } else {
        await loadOpportunities();
        await loadSettings();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setGenerating(false);
    }
  }, [companyId, loadOpportunities, loadSettings]);

  // ── Save settings ─────────────────────────────────────────
  const saveSettings = useCallback(async (updates: Partial<OpportunitySettings>) => {
    if (!companyId) return;

    const { error: err } = await supabase
      .from("opportunity_settings")
      .upsert({
        company_id: companyId,
        ...updates,
        updated_at: new Date().toISOString(),
      }, { onConflict: "company_id" });

    if (!err) {
      setSettings((prev) => prev ? { ...prev, ...updates } : (updates as OpportunitySettings));
    }
  }, [companyId]);

  // ── Update card status ────────────────────────────────────
  const updateStatus = useCallback(async (id: string, status: OppStatus) => {
    // Optimistic update
    setOpportunities((prev) =>
      prev.map((o) => (o.id === id ? { ...o, status } : o)),
    );

    const updates: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };
    if (status === "reached_out") {
      updates.outreach_date = new Date().toISOString();
    }

    const { error: err } = await supabase
      .from("opportunities")
      .update(updates)
      .eq("id", id);

    if (err) {
      console.error("updateStatus error:", err.message);
      // Revert on failure
      await loadOpportunities();
    }
  }, [loadOpportunities]);

  // ── Bootstrap ─────────────────────────────────────────────
  useEffect(() => {
    if (!companyId) return;

    const init = async () => {
      await Promise.all([loadOpportunities(), loadSettings()]);
    };
    init();
  }, [companyId, loadOpportunities, loadSettings]);

  // Auto-generate if today's batch is empty after initial load
  useEffect(() => {
    if (!loading && !generating && companyId && opportunities.length === 0) {
      generate(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  return {
    opportunities,
    settings,
    loading,
    generating,
    error,
    generate,
    saveSettings,
    updateStatus,
    reload: loadOpportunities,
  };
}

// ─────────────────────────────────────────────────────────────
// Sidebar badge count (kept for AppLayout compatibility)
// ─────────────────────────────────────────────────────────────

export function useNewMatchCount(userId: string | undefined) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!userId) return;
    const today = new Date().toISOString().split("T")[0];

    // First resolve company_id, then count new opportunities
    supabase
      .from("companies")
      .select("id")
      .eq("profile_id", userId)
      .single()
      .then(({ data: co }) => {
        if (!co?.id) return;
        supabase
          .from("opportunities")
          .select("id", { count: "exact", head: true })
          .eq("company_id", co.id)
          .eq("shown_date", today)
          .eq("status", "new")
          .then(({ count: c }) => setCount(c ?? 0));
      });
  }, [userId]);

  return count;
}
