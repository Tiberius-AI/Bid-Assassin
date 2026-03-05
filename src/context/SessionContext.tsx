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
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();
    if (data) setProfile(data as Profile);
    return data as Profile | null;
  }, []);

  const fetchCompany = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from("companies")
      .select("*")
      .eq("profile_id", userId)
      .single();
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

  useEffect(() => {
    let resolved = false;
    const done = () => {
      if (!resolved) {
        resolved = true;
        setIsLoading(false);
      }
    };

    // Safety net: never stay stuck loading for more than 5 seconds
    const timeout = setTimeout(() => {
      if (!resolved) {
        console.warn("Session load timed out — proceeding without session");
        done();
      }
    }, 5000);

    // Initial session check
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      if (session?.user?.id) {
        try {
          await fetchProfile(session.user.id);
          await fetchCompany(session.user.id);
        } catch (err) {
          console.error("Error loading user data:", err);
        }
      }
      done();
    }).catch((err) => {
      console.error("getSession failed:", err);
      done();
    });

    const authStateListener = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        if (session?.user?.id) {
          try {
            await fetchProfile(session.user.id);
            await fetchCompany(session.user.id);
          } catch (err) {
            console.error("Error loading user data:", err);
          }
        } else {
          setProfile(null);
          setCompany(null);
        }
        done();
      }
    );

    return () => {
      clearTimeout(timeout);
      authStateListener.data.subscription.unsubscribe();
    };
  }, [fetchProfile, fetchCompany]);

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
