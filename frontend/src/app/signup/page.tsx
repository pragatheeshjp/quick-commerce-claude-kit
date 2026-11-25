import type { Metadata } from "next";
import { Suspense } from "react";
import { SignupForm } from "@/features/auth/signup-form";

export const metadata: Metadata = { title: "Create account" };

export default function SignupPage() {
  return (
    <div className="mx-auto max-w-sm py-8">
      <h1 className="mb-6 text-2xl font-bold">Create your account</h1>
      <Suspense><SignupForm /></Suspense>
    </div>
  );
}
