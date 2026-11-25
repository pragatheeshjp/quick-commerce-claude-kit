import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";

const replace = vi.fn();
let nextParam: string | null = null;
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  useSearchParams: () => ({ get: () => nextParam }),
}));

const auth = {
  user: null as unknown,
  loading: false,
  signUp: vi.fn(),
  sendPasswordReset: vi.fn(),
  updatePassword: vi.fn(),
  signOut: vi.fn(),
  getAccessToken: vi.fn(),
};
vi.mock("@/features/auth/auth-provider", () => ({ useAuth: () => auth }));
const api = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: (...a: unknown[]) => api(...a) }));

import { AccountPanel } from "@/features/auth/account-panel";
import { ForgotPasswordForm } from "@/features/auth/forgot-password-form";
import { RequireAuth } from "@/features/auth/require-auth";
import { ResetPasswordForm } from "@/features/auth/reset-password-form";
import { SignupForm } from "@/features/auth/signup-form";

beforeEach(() => {
  replace.mockReset();
  api.mockReset();
  nextParam = null;
  Object.assign(auth, { user: null, loading: false });
  for (const k of ["signUp", "sendPasswordReset", "updatePassword", "signOut", "getAccessToken"] as const) auth[k].mockReset();
  auth.getAccessToken.mockResolvedValue("tok");
});

describe("RequireAuth", () => {
  it("shows a loading state and does not redirect while the session is being restored", () => {
    auth.loading = true;
    render(<RequireAuth><p>private</p></RequireAuth>);
    expect(screen.getByRole("status")).toHaveTextContent("Loading");
    expect(screen.queryByText("private")).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("sends signed-out visitors to login and remembers where they were going", async () => {
    window.history.pushState({}, "", "/account/addresses");
    render(<RequireAuth><p>private</p></RequireAuth>);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login?next=%2Faccount%2Faddresses"));
    expect(screen.queryByText("private")).not.toBeInTheDocument();
  });

  it("renders the protected content for a signed-in user", () => {
    auth.user = { id: "u1" };
    render(<RequireAuth><p>private</p></RequireAuth>);
    expect(screen.getByText("private")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("AccountPanel", () => {
  const me = (role: string) => ({ data: { id: "u1", email: "asha@example.com", role, profile: { full_name: "Asha K", phone: null } } });

  it("loads /me with the user's token and shows name, email and role", async () => {
    api.mockResolvedValue(me("customer"));
    render(<AccountPanel />);
    expect(await screen.findByText("asha@example.com")).toBeInTheDocument();
    expect(screen.getByText("Asha K")).toBeInTheDocument();
    expect(screen.getByText("customer")).toBeInTheDocument();
    expect(api).toHaveBeenCalledWith("/me", expect.objectContaining({ token: "tok" }));
  });

  it("links to orders and addresses, and shows the admin console link only for admins", async () => {
    api.mockResolvedValueOnce(me("customer"));
    const { unmount } = render(<AccountPanel />);
    expect(await screen.findByRole("link", { name: "Your orders" })).toHaveAttribute("href", "/orders");
    expect(screen.getByRole("link", { name: "Saved addresses" })).toHaveAttribute("href", "/account/addresses");
    expect(screen.queryByRole("link", { name: /admin console/i })).not.toBeInTheDocument();
    unmount();
    api.mockResolvedValueOnce(me("admin"));
    render(<AccountPanel />);
    expect(await screen.findByRole("link", { name: /admin console/i })).toHaveAttribute("href", "/admin");
  });

  it("shows an em dash when there is no name on file", async () => {
    api.mockResolvedValue({ data: { id: "u1", email: "a@b.co", role: "customer", profile: null } });
    render(<AccountPanel />);
    expect(await screen.findByText("—")).toBeInTheDocument();
  });

  it("logs out and returns to the home page", async () => {
    api.mockResolvedValue(me("customer"));
    auth.signOut.mockResolvedValue(undefined);
    render(<AccountPanel />);
    await userEvent.click(await screen.findByRole("button", { name: "Log out" }));
    expect(auth.signOut).toHaveBeenCalled();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });

  it("shows an error notice if the account cannot be loaded", async () => {
    api.mockRejectedValue(new ApiError(500, "INTERNAL", "x"));
    render(<AccountPanel />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load your account/i);
  });
});

describe("SignupForm", () => {
  const fill = async (over: Partial<Record<"name" | "email" | "pw" | "confirm", string>> = {}) => {
    await userEvent.type(screen.getByLabelText("Full name"), over.name ?? "  Asha K  ");
    await userEvent.type(screen.getByLabelText("Email"), over.email ?? "asha@example.com");
    await userEvent.type(screen.getByLabelText("Password"), over.pw ?? "longenough1");
    await userEvent.type(screen.getByLabelText("Confirm password"), over.confirm ?? over.pw ?? "longenough1");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
  };

  it("shows inline errors and calls nothing for an empty form", async () => {
    render(<SignupForm />);
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText("Enter your name")).toBeInTheDocument();
    expect(screen.getByText("Enter your email")).toBeInTheDocument();
    expect(screen.getByText("Use at least 8 characters")).toBeInTheDocument();
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it("flags mismatched passwords", async () => {
    render(<SignupForm />);
    await fill({ pw: "longenough1", confirm: "different99" });
    expect(await screen.findByText("Passwords do not match")).toBeInTheDocument();
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it("creates the account with trimmed values and goes to the safe next page when signed in immediately", async () => {
    nextParam = "/cart";
    auth.signUp.mockResolvedValue({ needsConfirmation: false });
    render(<SignupForm />);
    await fill();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/cart"));
    expect(auth.signUp).toHaveBeenCalledWith("Asha K", "asha@example.com", "longenough1");
  });

  it("ignores an unsafe next parameter", async () => {
    nextParam = "//evil.example";
    auth.signUp.mockResolvedValue({ needsConfirmation: false });
    render(<SignupForm />);
    await fill();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });

  it("tells the user to check their email when confirmation is required", async () => {
    auth.signUp.mockResolvedValue({ needsConfirmation: true });
    render(<SignupForm />);
    await fill();
    expect(await screen.findByText("Check your email")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "log in" })).toHaveAttribute("href", "/login");
    expect(replace).not.toHaveBeenCalled();
  });

  it("shows the server's friendly error and keeps the form usable", async () => {
    auth.signUp.mockResolvedValue({ error: "That password is too easy to guess. Try a longer one." });
    render(<SignupForm />);
    await fill();
    expect(await screen.findByRole("alert")).toHaveTextContent(/too easy to guess/i);
    expect(screen.getByRole("button", { name: "Create account" })).toBeEnabled();
  });
});

describe("ForgotPasswordForm", () => {
  it("validates the email locally", async () => {
    render(<ForgotPasswordForm />);
    await userEvent.type(screen.getByLabelText("Email"), "nope");
    await userEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(await screen.findByText("Enter a valid email address")).toBeInTheDocument();
    expect(auth.sendPasswordReset).not.toHaveBeenCalled();
  });

  it("always shows the same neutral confirmation (no account enumeration)", async () => {
    auth.sendPasswordReset.mockResolvedValue({});
    render(<ForgotPasswordForm />);
    await userEvent.type(screen.getByLabelText("Email"), "anyone@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(await screen.findByRole("status")).toHaveTextContent(/if an account exists/i);
    expect(auth.sendPasswordReset).toHaveBeenCalledWith("anyone@example.com");
  });

  it("surfaces rate-limit errors", async () => {
    auth.sendPasswordReset.mockResolvedValue({ error: "Too many attempts. Please wait a minute and try again." });
    render(<ForgotPasswordForm />);
    await userEvent.type(screen.getByLabelText("Email"), "a@b.co");
    await userEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/too many attempts/i);
  });
});

describe("ResetPasswordForm", () => {
  it("waits for the recovery session to load", () => {
    auth.loading = true;
    render(<ResetPasswordForm />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading");
  });

  it("explains an invalid or expired link when there is no recovery session", () => {
    render(<ResetPasswordForm />);
    expect(screen.getByRole("alert")).toHaveTextContent(/invalid or has expired/i);
    expect(screen.getByRole("link", { name: /request a new one/i })).toHaveAttribute("href", "/forgot-password");
  });

  it("validates length and confirmation", async () => {
    auth.user = { id: "u1" };
    render(<ResetPasswordForm />);
    await userEvent.type(screen.getByLabelText("New password"), "short");
    await userEvent.type(screen.getByLabelText("Confirm new password"), "short");
    await userEvent.click(screen.getByRole("button", { name: "Set new password" }));
    expect(await screen.findByText("Use at least 8 characters")).toBeInTheDocument();
    expect(auth.updatePassword).not.toHaveBeenCalled();
  });

  it("sets the new password and continues to the account page", async () => {
    auth.user = { id: "u1" };
    auth.updatePassword.mockResolvedValue({});
    render(<ResetPasswordForm />);
    await userEvent.type(screen.getByLabelText("New password"), "brand-new-pw1");
    await userEvent.type(screen.getByLabelText("Confirm new password"), "brand-new-pw1");
    await userEvent.click(screen.getByRole("button", { name: "Set new password" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/account"));
    expect(auth.updatePassword).toHaveBeenCalledWith("brand-new-pw1");
  });

  it("shows an error from the server and stays put", async () => {
    auth.user = { id: "u1" };
    auth.updatePassword.mockResolvedValue({ error: "Choose a password different from your current one." });
    render(<ResetPasswordForm />);
    await userEvent.type(screen.getByLabelText("New password"), "brand-new-pw1");
    await userEvent.type(screen.getByLabelText("Confirm new password"), "brand-new-pw1");
    await userEvent.click(screen.getByRole("button", { name: "Set new password" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/different from your current/i);
    expect(replace).not.toHaveBeenCalled();
  });
});
