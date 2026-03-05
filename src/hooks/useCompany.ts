import { useState, useEffect, useCallback } from "react";
import supabase from "@/supabase";
import type { Company } from "@/types";

export function useCompany(userId: string | undefined) {
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCompany = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const { data, error: err } = await supabase
        .from("companies")
        .select("*")
        .eq("profile_id", userId)
        .single();

      if (err && err.code !== "PGRST116") throw err; // PGRST116 = no rows
      setCompany(data as Company | null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load company";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchCompany();
  }, [fetchCompany]);

  const createCompany = async (companyData: Partial<Company>) => {
    if (!userId) throw new Error("Not authenticated");
    const { data, error: err } = await supabase
      .from("companies")
      .insert({ ...companyData, profile_id: userId })
      .select()
      .single();
    if (err) throw err;
    setCompany(data as Company);
    return data as Company;
  };

  const updateCompany = async (updates: Partial<Company>) => {
    if (!company) throw new Error("No company found");
    const { error: err } = await supabase
      .from("companies")
      .update(updates)
      .eq("id", company.id);
    if (err) throw err;
    setCompany((prev) => (prev ? { ...prev, ...updates } : prev));
  };

  return { company, setCompany, loading, error, createCompany, updateCompany, refetch: fetchCompany };
}
