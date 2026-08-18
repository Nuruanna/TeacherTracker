import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase, supabaseConfigurationError } from "../lib/supabase";

const AuthContext = createContext(null);

const friendlyAuthError = (error) => {
  if (!error) return "Unable to sign in. Please try again.";
  if (/invalid login credentials/i.test(error.message || ""))
    return "The email or password is incorrect.";
  if (/fetch|network|failed to fetch/i.test(error.message || ""))
    return "Unable to reach the sign in service. Check your connection and try again.";
  return "Unable to sign in. Please check your details and try again.";
};

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(Boolean(supabase));

  useEffect(() => {
    if (!supabase) return undefined;
    let active = true;
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active) return;
        setSession(error ? null : data.session);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setSession(null);
        setLoading(false);
      });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setLoading(false);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(
    () => ({
      session,
      loading,
      configurationError: supabaseConfigurationError,
      async signIn(email, password) {
        if (!supabase) return { error: supabaseConfigurationError };
        try {
          const { error } = await supabase.auth.signInWithPassword({ email, password });
          return { error: error ? friendlyAuthError(error) : null };
        } catch (error) {
          return { error: friendlyAuthError(error) };
        }
      },
      async signOut() {
        if (!supabase) return { error: supabaseConfigurationError };
        try {
          const { error } = await supabase.auth.signOut();
          return {
            error: error
              ? "Unable to log out right now. Check your connection and try again."
              : null,
          };
        } catch {
          return {
            error: "Unable to log out right now. Check your connection and try again.",
          };
        }
      },
    }),
    [session, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider.");
  return context;
}
