import type { Metadata } from "next";
import { AccountPanel } from "@/features/auth/account-panel";
import { RequireAuth } from "@/features/auth/require-auth";

export const metadata: Metadata = { title: "Your account" };

export default function AccountPage() {
  return (
    <div className="mx-auto max-w-md py-8">
      <h1 className="mb-6 text-2xl font-bold">Your account</h1>
      <RequireAuth>
        <AccountPanel />
      </RequireAuth>
    </div>
  );
}
