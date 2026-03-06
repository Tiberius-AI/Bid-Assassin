import { createContext, useContext, useEffect, useState, useCallback } from "react";
import supabase from "../supabase";
import LoadingPage from "../pages/LoadingPage";
import { Session } from "@supabase/supabase-js";
import type { Profile, Company } from "@/types";

interface SessionContextType {
  session: Session | null;
  profile: Profile | null;
  company: Company | null;
  setProfile: React.Dispatch<React.SetStateAction<Profile | null>>;
  setCompany: React.Dispatch<React.SetStateAction<Company | null>>;
  refreshProfile: () => Promise<void>;
  refreshCompany: () => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionContextType>({
  session: null,
  profile: null,
  company: null,
  setProfile: () => {},
  setCompany: () => {},
  refreshProfile: async () => {},
  refreshCompany: async () => {},
  signOut: async () => {},
});

export const useSession = () => {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return context;
};

type Props = { children: React.ReactNode };
export const SessionProvider = ({ children }: Props) => {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (error) {
      console.error("fetchProfile error:", error.message, error.details, error.code);
    }

    // Only create a fallback profile if we got a "no rows" error (PGRST116)
    if (!data && error?.code === "PGRST116") {
      console.warn("No profile found — creating fallback profile for", userId);
      // Use session data instead of getUser() to avoid potential deadlock
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      const user = currentSession?.user;
      const { data: newProfile, error: insertError } = await supabase
        .from("profiles")
        .insert({
          id: userId,
          email: user?.email ?? "",
          full_name: user?.user_metadata?.full_name ?? "",
          onboarding_completed: false,
        })
        .select()
        .single();

      if (insertError) {
        console.error("Failed to create fallback profile:", insertError.message);
        return null;
      }
      if (newProfile) setProfile(newProfile as Profile);
      return newProfile as Profile | null;
    }

    if (data) setProfile(data as Profile);
    return data as Profile | null;
  }, []);

  const fetchCompany = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from("companies")
      .select("*")
      .eq("profile_id", userId)
      .single();
    if (error && error.code !== "PGRST116") {
      // PGRST116 = "no rows returned" which is expected if no company yet
      console.error("fetchCompany error:", error.message, error.details);
    }
    if (data) setCompany(data as Company);
    return data as Company | null;
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session?.user?.id) await fetchProfile(session.user.id);
  }, [session?.user?.id, fetchProfile]);

  const refreshCompany = useCallback(async () => {
    if (session?.user?.id) await fetchCompany(session.user.id);
  }, [session?.user?.id, fetchCompany]);

  const signOut = useCallback(async () => {
    setProfile(null);
    setCompany(null);
    setSession(null);
    await supabase.auth.signOut();
  }, []);

  // Effect 1: Listen for auth changes — ONLY set session, never await Supabase calls
  useEffect(() => {
    let mounted = true;

    // Read cached session from localStorage (no network call)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (mounted) {
        setSession(session);
        setIsLoading(false);
      }
    });

    // Listen for auth changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        console.log("Auth event:", _event, session ? "has session" : "no session");
        if (mounted) {
          setSession(session);
          setIsLoading(false);
        }
      }
    );

    // Safety timeout
    const timeout = setTimeout(() => {
      if (mounted) setIsLoading(false);
    }, 5000);

    return () => {
      mounted = false;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  // Effect 2: Load profile and company whenever session changes
  useEffect(() => {
    if (!session?.user?.id) {
      setProfile(null);
      setCompany(null);
      return;
    }

    const userId = session.user.id;
    let cancelled = false;

    const loadUserData = async () => {
      try {
        const [profileData, companyData] = await Promise.all([
          fetchProfile(userId),
          fetchCompany(userId),
        ]);
        if (cancelled) return;
        // fetchProfile/fetchCompany already call setProfile/setCompany internally
        console.log("User data loaded:", profileData ? "profile ok" : "no profile", companyData ? "company ok" : "no company");
      } catch (err) {
        console.error("Error loading user data:", err);
      }
    };

    loadUserData();

    return () => { cancelled = true; };
  }, [session?.user?.id, fetchProfile, fetchCompany]);

  return (
    <SessionContext.Provider
      value={{
        session,
        profile,
        company,
        setProfile,
        setCompany,
        refreshProfile,
        refreshCompany,
        signOut,
      }}
    >
      {isLoading ? <LoadingPage /> : children}
    </SessionContext.Provider>
  );
};
