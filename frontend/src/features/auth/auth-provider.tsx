"use client";

import type { Session, User } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getSupabase } from "@/lib/supabase";

type Result = { error?: string };
type SignUpResult = Result & { needsConfirmation?: boolean };

interface AuthContextValue {
  user: User | null;
  /** True until the stored session has been read; guards must wait for this. */
  loading: boolean;
  /** Fresh access token for API calls (auto-refreshed by supabase-js), or null when signed out. */
  getAccessToken: () => Promise<string | null>;
  signIn: (email: string, password: string) => Promise<Result>;
  signUp: (fullName: string, email: string, password: string) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<Result>;
  updatePassword: (password: string) => Promise<Result>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Turns Supabase error messages into safe, friendly copy. Never reveals whether an email exists. */
export function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "Incorrect email or password.";
  if (m.includes("email not confirmed")) return "Please confirm your email first. Check your inbox for the link.";
  if (m.includes("rate limit") || m.includes("too many")) return "Too many attempts. Please wait a minute and try again.";
  if (m.includes("password") && m.includes("weak")) return "That password is too easy to guess. Try a longer one.";
  if (m.includes("same password")) return "Choose a password different from your current one.";
  if (m.includes("fetch") || m.includes("network")) return "Cannot reach the server. Check your connection.";
  return "Something went wrong. Please try again.";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabase();
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const getAccessToken = useCallback(async () => {
    const { data } = await getSupabase().auth.getSession();
    return data.session?.access_token ?? null;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      loading,
      getAccessToken,
      async signIn(email, password) {
        const { error } = await getSupabase().auth.signInWithPassword({ email, password });
        return error ? { error: friendlyAuthError(error.message) } : {};
      },
      async signUp(fullName, email, password) {
        const { data, error } = await getSupabase().auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName }, emailRedirectTo: `${window.location.origin}/login` },
        });
        if (error) return { error: friendlyAuthError(error.message) };
        return { needsConfirmation: !data.session };
      },
      async signOut() {
        await getSupabase().auth.signOut();
      },
      async sendPasswordReset(email) {
        const { error } = await getSupabase().auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        // Rate-limit errors are shown; everything else is hidden so we never reveal which emails exist.
        return error && /rate|too many/i.test(error.message) ? { error: friendlyAuthError(error.message) } : {};
      },
      async updatePassword(password) {
        const { error } = await getSupabase().auth.updateUser({ password });
        return error ? { error: friendlyAuthError(error.message) } : {};
      },
    }),
    [session, loading, getAccessToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
