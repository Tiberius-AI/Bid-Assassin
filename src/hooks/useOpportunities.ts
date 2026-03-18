import { useState, useEffect, useCallback } from "react";
import supabase from "@/supabase";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type OppStatus =
  | "new" | "saved" | "dismissed" | "reached_out"
  | "responded" | "proposal_sent" | "won" | "lost";

export interface PermitMetadata {
  permit_number: string;
  permit_type: string;
  work_type: string | null;
  declared_valuation: number;
  area_sf: number;
  primary_contact: string | null;
  date_submitted: string | null;
  date_issued: string | null;
  council_district: string | null;
  related_permits?: { permit_number: string; permit_type: string; valuation: number }[];
  related_count?: number;
}

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
  // Permit
  permit_metadata:   PermitMetadata | null;
}

export interface OpportunitySettings {
  trades:       string[];
  radius_miles: number;
  center_lat:   number | null;
  center_lng:   number | null;
  rotation_index: number;
  permits_enabled:      boolean;
  permit_min_valuation: number;
}

// ─────────────────────────────────────────────────────────────
// Main hook
// ─────────────────────────────────────────────────────────────

export function useOpportunities(companyId: string | undefined, dateFilter: "today" | "week" | "all" = "today") {
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

    let query = supabase
      .from("opportunities")
      .select("*")
      .eq("company_id", companyId)
      .neq("status", "dismissed");

    if (dateFilter === "today") {
      query = query.eq("shown_date", today);
    } else if (dateFilter === "week") {
      const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().split("T")[0];
      query = query.gte("shown_date", weekAgo);
    }
    // "all" — no date filter

    const { data, error: err } = await query
      .order("source", { ascending: true })
      .order("match_score", { ascending: false });

    if (err) {
      setError(err.message);
    } else {
      setOpportunities((data ?? []) as DbOpportunity[]);
    }
    setLoading(false);
  }, [companyId, today, dateFilter]);

  // ── Load opportunity_settings ─────────────────────────────
  const loadSettings = useCallback(async () => {
    if (!companyId) return;

    // Select base columns first; permits columns added in migration 009
    const { data, error: settingsErr } = await supabase
      .from("opportunity_settings")
      .select("trades, radius_miles, center_lat, center_lng, rotation_index, permits_enabled, permit_min_valuation")
      .eq("company_id", companyId)
      .single();

    if (settingsErr) {
      console.warn("[useOpportunities] loadSettings error (migration 009 may not have run):", settingsErr.message);
    }

    // Always set settings (use defaults for missing permit columns)
    if (data || settingsErr) {
      setSettings({
        trades:               data?.trades        ?? [],
        radius_miles:         data?.radius_miles  ?? 50,
        center_lat:           data?.center_lat    ?? null,
        center_lng:           data?.center_lng    ?? null,
        rotation_index:       data?.rotation_index ?? 0,
        permits_enabled:      data?.permits_enabled ?? true,
        permit_min_valuation: data?.permit_min_valuation ?? 50000,
      });
    }
  }, [companyId]);

  // ── Generate today's batch via edge functions ─────────────
  // Step 1: generate-opportunities (geocodes center if needed, then Places API)
  // Step 2: after geocoding is done, run permit functions (they need center_lat/lng)
  const generate = useCallback(async (forceRefresh = false) => {
    if (!companyId) return;
    setGenerating(true);
    setError(null);

    try {
      // Run generate-opportunities first so geocoding saves center_lat/lng before permits run
      const oppResult = await supabase.functions.invoke("generate-opportunities", {
        body: { company_id: companyId, force_refresh: forceRefresh },
      });

      const { data: fnData, error: fnErr } = oppResult;
      if (fnErr) {
        const detail = fnData?.error || fnErr.message || "Failed to generate opportunities";
        setError(detail);
        console.error("generate-opportunities error:", detail, fnErr);
      } else {
        // Now run both permit functions in parallel (center_lat/lng is now set in DB)
        await Promise.all([
          supabase.functions.invoke("fetch-permits-sa", {
            body: { company_id: companyId },
          }),
          supabase.functions.invoke("fetch-permits-austin", {
            body: { company_id: companyId },
          }),
        ]).catch((e) => console.warn("Permit functions error (non-fatal):", e));

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

  // ── Insert client-side permits to DB ──────────────────────
  const insertPermits = useCallback(async (permits: DbOpportunity[]) => {
    if (!companyId || permits.length === 0) return;
    // Strip the local fake id so Postgres generates a real UUID
    const rows = permits.map(({ id: _id, ...rest }) => ({ ...rest, company_id: companyId }));
    const { error: err } = await supabase.from("opportunities").insert(rows);
    if (err) {
      console.warn("[useOpportunities] insertPermits error:", err.message);
    } else {
      await loadOpportunities();
    }
  }, [companyId, loadOpportunities]);

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
    insertPermits,
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
