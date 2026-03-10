import { useState, useEffect, useCallback } from "react";
import supabase from "@/supabase";

const PAGE_SIZE = 20;

export interface OpportunityMatch {
  id: string;
  fit_score: number;
  score_breakdown: {
    trade: number;
    location: number;
    certification: number;
    freshness: number;
    engagement: number;
  };
  status: string;
  viewed_at: string | null;
  opportunity: {
    id: string;
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
      city?: string | null;
      state?: string | null;
      zip?: string | null;
      street_address?: string | null;
    } | null;
    contacts: Array<{
      type?: string;
      fullName?: string;
      email?: string;
      phone?: string;
      title?: string;
    }> | null;
    notice_type: string | null;
    source_id: string;
  };
}

export interface OpportunityFilters {
  minScore: number;
  status: string;       // "all" | "new" | "viewed" | "interested" | "passed"
  state: string;        // "all" | state code
  setAside: string;     // "all" | set-aside code
  deadline: string;     // "all" | "week" | "two_weeks" | "month"
  sortBy: string;       // "fit_score" | "deadline" | "posted_date"
}

export const DEFAULT_FILTERS: OpportunityFilters = {
  minScore: 50,
  status: "all",
  state: "all",
  setAside: "all",
  deadline: "all",
  sortBy: "fit_score",
};

export function useOpportunities(userId: string | undefined, filters: OpportunityFilters) {
  const [matches, setMatches] = useState<OpportunityMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);

  const fetchMatches = useCallback(
    async (pageIndex: number, replace: boolean) => {
      if (!userId) return;
      setLoading(true);

      let query = supabase
        .from("opportunity_matches")
        .select(
          `id, fit_score, score_breakdown, status, viewed_at,
           opportunity:opportunities (
             id, title, solicitation_number, department, sub_tier, office,
             posted_date, response_deadline, naics_code, set_aside_type,
             set_aside_description, place_of_performance, contacts,
             notice_type, source_id
           )`
        )
        .eq("member_id", userId)
        .gte("fit_score", filters.minScore);

      // Status filter — default view hides passed
      if (filters.status === "all") {
        query = query.neq("status", "passed");
      } else {
        query = query.eq("status", filters.status);
      }

      // Sort
      if (filters.sortBy === "fit_score") {
        query = query.order("fit_score", { ascending: false });
      } else if (filters.sortBy === "deadline") {
        query = query.order("fit_score", { ascending: false }); // secondary
      } else {
        query = query.order("fit_score", { ascending: false });
      }

      query = query.range(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE - 1);

      const { data, error } = await query;

      if (error) {
        console.error("useOpportunities error:", error.message);
        setLoading(false);
        return;
      }

      let results = (data ?? []) as unknown as OpportunityMatch[];

      // Client-side filters that can't be done via foreign table filters easily
      if (filters.state !== "all") {
        results = results.filter(
          (m) =>
            m.opportunity?.place_of_performance?.state?.toUpperCase() ===
            filters.state.toUpperCase()
        );
      }

      if (filters.setAside !== "all") {
        results = results.filter(
          (m) =>
            m.opportunity?.set_aside_type?.toUpperCase() ===
            filters.setAside.toUpperCase()
        );
      }

      if (filters.deadline !== "all") {
        const now = new Date();
        const cutoffDays =
          filters.deadline === "week" ? 7 :
          filters.deadline === "two_weeks" ? 14 : 30;
        const cutoff = new Date(now.getTime() + cutoffDays * 86_400_000);
        results = results.filter((m) => {
          if (!m.opportunity?.response_deadline) return true;
          return new Date(m.opportunity.response_deadline) <= cutoff;
        });
      }

      // Client-side sort for deadline/posted_date since those require joining
      if (filters.sortBy === "deadline") {
        results.sort((a, b) => {
          const da = a.opportunity?.response_deadline ? new Date(a.opportunity.response_deadline).getTime() : Infinity;
          const db = b.opportunity?.response_deadline ? new Date(b.opportunity.response_deadline).getTime() : Infinity;
          return da - db;
        });
      } else if (filters.sortBy === "posted_date") {
        results.sort((a, b) => {
          const da = a.opportunity?.posted_date ? new Date(a.opportunity.posted_date).getTime() : 0;
          const db = b.opportunity?.posted_date ? new Date(b.opportunity.posted_date).getTime() : 0;
          return db - da;
        });
      }

      setMatches((prev) => (replace ? results : [...prev, ...results]));
      setHasMore(results.length === PAGE_SIZE);
      setLoading(false);
    },
    [userId, filters]
  );

  // Reset to page 0 when filters change
  useEffect(() => {
    setPage(0);
    fetchMatches(0, true);
  }, [fetchMatches]);

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    fetchMatches(next, false);
  };

  const updateStatus = async (matchId: string, newStatus: string) => {
    const { error } = await supabase
      .from("opportunity_matches")
      .update({
        status: newStatus,
        ...(newStatus === "viewed" ? { viewed_at: new Date().toISOString() } : {}),
        ...(["interested", "passed"].includes(newStatus) ? { action_at: new Date().toISOString() } : {}),
      })
      .eq("id", matchId);

    if (!error) {
      setMatches((prev) =>
        prev.map((m) =>
          m.id === matchId ? { ...m, status: newStatus } : m
        )
      );
    }
  };

  return { matches, loading, hasMore, loadMore, updateStatus };
}

export function useNewMatchCount(userId: string | undefined) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!userId) return;

    supabase
      .from("opportunity_matches")
      .select("id", { count: "exact", head: true })
      .eq("member_id", userId)
      .eq("status", "new")
      .then(({ count: c }: { count: number | null }) => setCount(c ?? 0));
  }, [userId]);

  return count;
}
