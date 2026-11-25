import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const unsubscribe = vi.fn();
let authListener: ((event: string, session: unknown) => void) | undefined;
const auth = {
  getSession: vi.fn(),
  onAuthStateChange: vi.fn((cb: (e: string, s: unknown) => void) => {
    authListener = cb;
    return { data: { subscription: { unsubscribe } } };
  }),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
};
vi.mock("@/lib/supabase", () => ({ getSupabase: () => ({ auth }) }));

import { AuthProvider, friendlyAuthError, useAuth } from "@/features/auth/auth-provider";

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;
const session = { access_token: "tok-1", user: { id: "u1", email: "a@b.co" } };

beforeEach(() => {
  for (const fn of Object.values(auth)) fn.mockReset();
  auth.onAuthStateChange.mockImplementation((cb: (e: string, s: unknown) => void) => {
    authListener = cb;
    return { data: { subscription: { unsubscribe } } };
  });
  auth.getSession.mockResolvedValue({ data: { session: null } });
  unsubscribe.mockReset();
});

describe("friendlyAuthError", () => {
  const cases: [string, RegExp][] = [
    ["Invalid login credentials", /incorrect email or password/i],
    ["Email not confirmed", /confirm your email/i],
    ["Email rate limit exceeded", /too many attempts/i],
    ["For security purposes, too many requests", /too many attempts/i],
    ["Password is too weak", /too easy to guess/i],
    ["New password should be different from the old password (same password)", /different from your current/i],
    ["TypeError: Failed to fetch", /cannot reach the server/i],
    ["a network problem occurred", /cannot reach the server/i],
  ];
  it.each(cases)("maps %j", (raw, expected) => expect(friendlyAuthError(raw)).toMatch(expected));

  it("never echoes unknown backend text", () => {
    expect(friendlyAuthError("duplicate key value violates constraint users_pkey")).toBe("Something went wrong. Please try again.");
  });
});

describe("AuthProvider session handling", () => {
  it("starts loading, then reports no user when signed out", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(await result.current.getAccessToken()).toBeNull();
  });

  it("restores a stored session and exposes the user and a fresh access token", async () => {
    auth.getSession.mockResolvedValue({ data: { session } });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.user?.id).toBe("u1"));
    expect(await result.current.getAccessToken()).toBe("tok-1");
  });

  it("follows sign-in and sign-out events from Supabase", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => authListener!("SIGNED_IN", session));
    expect(result.current.user?.email).toBe("a@b.co");
    act(() => authListener!("SIGNED_OUT", null));
    expect(result.current.user).toBeNull();
  });

  it("unsubscribes from auth events on unmount", async () => {
    const { unmount, result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it("useAuth outside a provider is a programming error", () => {
    expect(() => renderHook(() => useAuth())).toThrow(/inside <AuthProvider>/);
  });
});

describe("AuthProvider actions", () => {
  const setup = async () => {
    const hook = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    return hook.result;
  };

  it("signIn passes the credentials and returns a friendly error on failure", async () => {
    auth.signInWithPassword.mockResolvedValueOnce({ error: null });
    const r = await setup();
    expect(await r.current.signIn("a@b.co", "pw")).toEqual({});
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: "a@b.co", password: "pw" });
    auth.signInWithPassword.mockResolvedValueOnce({ error: { message: "Invalid login credentials" } });
    expect((await r.current.signIn("a@b.co", "bad")).error).toBe("Incorrect email or password.");
  });

  it("signUp sends the full name and a confirmation redirect to this site", async () => {
    auth.signUp.mockResolvedValue({ data: { session: null }, error: null });
    const r = await setup();
    await r.current.signUp("Asha K", "a@b.co", "pw12345678");
    expect(auth.signUp).toHaveBeenCalledWith({
      email: "a@b.co", password: "pw12345678",
      options: { data: { full_name: "Asha K" }, emailRedirectTo: `${window.location.origin}/login` },
    });
  });

  it("signUp reports whether email confirmation is still needed", async () => {
    const r = await setup();
    auth.signUp.mockResolvedValueOnce({ data: { session: null }, error: null });
    expect(await r.current.signUp("N", "a@b.co", "pw12345678")).toEqual({ needsConfirmation: true });
    auth.signUp.mockResolvedValueOnce({ data: { session }, error: null });
    expect(await r.current.signUp("N", "a@b.co", "pw12345678")).toEqual({ needsConfirmation: false });
    auth.signUp.mockResolvedValueOnce({ data: { session: null }, error: { message: "Password is too weak" } });
    expect((await r.current.signUp("N", "a@b.co", "123")).error).toMatch(/too easy to guess/i);
  });

  it("signOut calls Supabase", async () => {
    auth.signOut.mockResolvedValue({ error: null });
    const r = await setup();
    await r.current.signOut();
    expect(auth.signOut).toHaveBeenCalled();
  });

  it("password reset points the email link at this site and hides whether the account exists", async () => {
    const r = await setup();
    auth.resetPasswordForEmail.mockResolvedValueOnce({ error: { message: "User not found" } });
    expect(await r.current.sendPasswordReset("ghost@example.com")).toEqual({});
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith("ghost@example.com", { redirectTo: `${window.location.origin}/reset-password` });
    auth.resetPasswordForEmail.mockResolvedValueOnce({ error: { message: "Email rate limit exceeded" } });
    expect((await r.current.sendPasswordReset("a@b.co")).error).toMatch(/too many attempts/i);
    auth.resetPasswordForEmail.mockResolvedValueOnce({ error: null });
    expect(await r.current.sendPasswordReset("a@b.co")).toEqual({});
  });

  it("updatePassword maps errors and passes the new password", async () => {
    const r = await setup();
    auth.updateUser.mockResolvedValueOnce({ error: null });
    expect(await r.current.updatePassword("new-password-1")).toEqual({});
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "new-password-1" });
    auth.updateUser.mockResolvedValueOnce({ error: { message: "New password should be different from the old password. same password" } });
    expect((await r.current.updatePassword("old")).error).toMatch(/different from your current/i);
  });
});
