import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeToggle } from "@/components/theme-toggle";
import { getTheme, setTheme, themeInitScript } from "@/lib/theme";

const html = document.documentElement;

function mockSystemDark(dark: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({ matches: dark }) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  localStorage.clear();
  html.setAttribute("data-theme", "light");
});

describe("ThemeToggle", () => {
  it("switches to dark and back, saving the choice", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole("button", { name: "Switch to dark theme" }));
    expect(html).toHaveAttribute("data-theme", "dark");
    expect(localStorage.getItem("theme")).toBe("dark");

    await user.click(screen.getByRole("button", { name: "Switch to light theme" }));
    expect(html).toHaveAttribute("data-theme", "light");
    expect(localStorage.getItem("theme")).toBe("light");
  });

  it("follows theme changes made elsewhere (e.g. another toggle)", async () => {
    render(<ThemeToggle />);
    await act(async () => setTheme("dark"));
    expect(screen.getByRole("button", { name: "Switch to light theme" })).toBeInTheDocument();
  });
});

describe("theme init script", () => {
  const run = () => new Function(themeInitScript)();

  it("uses the saved theme over the OS preference", () => {
    mockSystemDark(true);
    localStorage.setItem("theme", "light");
    run();
    expect(getTheme()).toBe("light");
  });

  it("falls back to the OS preference when nothing (or junk) is saved", () => {
    mockSystemDark(true);
    run();
    expect(getTheme()).toBe("dark");
    localStorage.setItem("theme", "purple");
    mockSystemDark(false);
    run();
    expect(getTheme()).toBe("light");
  });
});
