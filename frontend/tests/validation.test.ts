import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/features/auth/require-auth";
import { cleanSearch, parsePage } from "@/features/catalog/queries";
import { fieldErrors, loginSchema, pincodeSchema, resetSchema, signupSchema } from "@/lib/validation";

describe("validation", () => {
  it("login requires a valid email and a password", () => {
    const r = loginSchema.safeParse({ email: "nope", password: "" });
    expect(r.success).toBe(false);
    if (!r.success) expect(Object.keys(fieldErrors(r.error)).sort()).toEqual(["email", "password"]);
    expect(loginSchema.safeParse({ email: " a@b.co ", password: "x" }).success).toBe(true);
  });
  it("signup enforces length and matching passwords", () => {
    const base = { fullName: "Asha K", email: "a@b.co", password: "longenough1", confirmPassword: "longenough1" };
    expect(signupSchema.safeParse(base).success).toBe(true);
    const short = signupSchema.safeParse({ ...base, password: "short", confirmPassword: "short" });
    expect(short.success).toBe(false);
    const mismatch = signupSchema.safeParse({ ...base, confirmPassword: "different11" });
    expect(mismatch.success ? {} : fieldErrors(mismatch.error)).toEqual({ confirmPassword: "Passwords do not match" });
    expect(signupSchema.safeParse({ ...base, fullName: "A" }).success).toBe(false);
  });
  it("reset requires matching strong-enough passwords", () => {
    expect(resetSchema.safeParse({ password: "longenough1", confirmPassword: "longenough1" }).success).toBe(true);
    expect(resetSchema.safeParse({ password: "longenough1", confirmPassword: "x" }).success).toBe(false);
  });
  it("pincodes are 6 digits not starting with 0", () => {
    for (const ok of ["560001", "110001"]) expect(pincodeSchema.safeParse(ok).success).toBe(true);
    for (const bad of ["056001", "56001", "5600011", "56000a", ""]) expect(pincodeSchema.safeParse(bad).success).toBe(false);
  });
});

describe("safeNextPath (open-redirect protection)", () => {
  it("allows same-site paths only", () => {
    expect(safeNextPath("/account")).toBe("/account");
    expect(safeNextPath("/category/dairy?page=2")).toBe("/category/dairy?page=2");
    for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert(1)", "", null, undefined]) {
      expect(safeNextPath(bad as string | null | undefined)).toBe("/");
    }
  });
});

describe("query helpers", () => {
  it("parsePage defaults to 1 for junk", () => {
    expect(parsePage("3")).toBe(3);
    for (const bad of ["0", "-1", "1.5", "abc", undefined, "99999"]) expect(parsePage(bad)).toBe(1);
  });
  it("cleanSearch strips characters the API would reject", () => {
    expect(cleanSearch("  milk  ")).toBe("milk");
    expect(cleanSearch("a,id.eq.1)(")).toBe("aid.eq.1");
    expect(cleanSearch("Amul Gold-500 & more")).toBe("Amul Gold-500 & more");
    expect(cleanSearch(undefined)).toBe("");
    expect(cleanSearch("x".repeat(100))).toHaveLength(60);
  });
});
