import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
let nextParam: string | null = null;
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => ({ get: () => nextParam }),
}));
const signIn = vi.fn();
vi.mock("@/features/auth/auth-provider", () => ({ useAuth: () => ({ signIn }) }));

import { LoginForm } from "@/features/auth/login-form";

beforeEach(() => {
  replace.mockReset();
  signIn.mockReset();
  nextParam = null;
});

describe("LoginForm", () => {
  it("shows inline errors and does not call the API when fields are empty", async () => {
    render(<LoginForm />);
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));
    expect(await screen.findByText("Enter your email")).toBeInTheDocument();
    expect(screen.getByText("Enter your password")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
    expect(signIn).not.toHaveBeenCalled();
  });

  it("signs in and redirects to a safe next path", async () => {
    nextParam = "/account";
    signIn.mockResolvedValue({});
    render(<LoginForm />);
    await userEvent.type(screen.getByLabelText("Email"), "a@b.co");
    await userEvent.type(screen.getByLabelText("Password"), "secret");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/account"));
    expect(signIn).toHaveBeenCalledWith("a@b.co", "secret");
  });

  it("ignores an unsafe next parameter", async () => {
    nextParam = "https://evil.example";
    signIn.mockResolvedValue({});
    render(<LoginForm />);
    await userEvent.type(screen.getByLabelText("Email"), "a@b.co");
    await userEvent.type(screen.getByLabelText("Password"), "secret");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });

  it("shows the server's friendly error and stays on the page", async () => {
    signIn.mockResolvedValue({ error: "Incorrect email or password." });
    render(<LoginForm />);
    await userEvent.type(screen.getByLabelText("Email"), "a@b.co");
    await userEvent.type(screen.getByLabelText("Password"), "wrong");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect email or password.");
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Log in" })).toBeEnabled();
  });
});
