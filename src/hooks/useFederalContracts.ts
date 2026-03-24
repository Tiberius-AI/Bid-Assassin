import { useState, useEffect, useCallback } from "react";
import supabase from "@/supabase";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type FederalMatchStatus =
  | "new" | "viewed" | "interested" | "passed"
  | "proposal_started" | "proposal_sent";

export interface FederalContact {
  type?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  title?: string;
}

export interface FederalContract {
  match_id: string;
  opportunity_id: string;
  fit_score: number;
  score_breakdown: {
    trade: number;
    location: number;
    certification: number;
    freshness: number;
    engagement: number;
  };
  status: FederalMatchStatus;
  notified_at: string | null;
  proposal_id: string | null;
  // from sam_opportunities
  source_id: string;        // SAM.gov noticeId — used to build the SAM.gov URL
  title: string;
  solicitation_number: string | null;
  department: string | null;
  sub_tier: string | null;
  office: string | null;
  posted_date: string | null;
  response_deadline: string | null;
  naics_code: string | null;
  set_aside_type: string | null;
  set_aside_description: string | null;
  place_of_performance: {
    city?: string;
    state?: string;
    zip?: string;
    street_address?: string;
  } | null;
  contacts: FederalContact[] | null;
  notice_type: string | null;
}

// ─────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────

export function useFederalContracts(userId: string | undefined) {
  const [contracts, setContracts] = useState<FederalContract[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    const { data, error: err } = await supabase
      .from("opportunity_matches")
      .select(`
        id,
        opportunity_id,
        fit_score,
        score_breakdown,
        status,
        notified_at,
        proposal_id,
        sam_opportunities (
          source_id,
          title,
          solicitation_number,
          department,
          sub_tier,
          office,
          posted_date,
          response_deadline,
          naics_code,
          set_aside_type,
          set_aside_description,
          place_of_performance,
          contacts,
          notice_type
        )
      `)
      .eq("member_id", userId)
      .neq("status", "passed")
      .order("fit_score", { ascending: false });

    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }

    const mapped: FederalContract[] = (data ?? [])
      .filter((row: Record<string, unknown>) => row.sam_opportunities)
      .map((row: Record<string, unknown>) => {
        const opp = row.sam_opportunities as Record<string, unknown>;
        return {
          match_id:             row.id as string,
          opportunity_id:       row.opportunity_id as string,
          fit_score:            row.fit_score as number,
          score_breakdown:      row.score_breakdown as FederalContract["score_breakdown"],
          status:               row.status as FederalMatchStatus,
          notified_at:          row.notified_at as string | null,
          proposal_id:          row.proposal_id as string | null,
          source_id:            opp.source_id as string,
          title:                opp.title as string,
          solicitation_number:  opp.solicitation_number as string | null,
          department:           opp.department as string | null,
          sub_tier:             opp.sub_tier as string | null,
          office:               opp.office as string | null,
          posted_date:          opp.posted_date as string | null,
          response_deadline:    opp.response_deadline as string | null,
          naics_code:           opp.naics_code as string | null,
          set_aside_type:       opp.set_aside_type as string | null,
          set_aside_description: opp.set_aside_description as string | null,
          place_of_performance: opp.place_of_performance as FederalContract["place_of_performance"],
          contacts:             opp.contacts as FederalContact[] | null,
          notice_type:          opp.notice_type as string | null,
        };
      });

    setContracts(mapped);
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const updateStatus = useCallback(async (matchId: string, status: FederalMatchStatus) => {
    // Optimistic update
    setContracts((prev) =>
      status === "passed"
        ? prev.filter((c) => c.match_id !== matchId)
        : prev.map((c) => c.match_id === matchId ? { ...c, status } : c)
    );

    await supabase
      .from("opportunity_matches")
      .update({ status, action_at: new Date().toISOString() })
      .eq("id", matchId);
  }, []);

  const markViewed = useCallback(async (matchId: string) => {
    const contract = contracts.find((c) => c.match_id === matchId);
    if (!contract || contract.status !== "new") return;
    await updateStatus(matchId, "viewed");
  }, [contracts, updateStatus]);

  return { contracts, loading, error, reload: load, updateStatus, markViewed };
}
