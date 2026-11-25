import type { Metadata } from "next";
import { AddressBook } from "@/features/addresses/address-book";
import { RequireAuth } from "@/features/auth/require-auth";

export const metadata: Metadata = { title: "Saved addresses" };

export default function AddressesPage() {
  return (
    <div className="mx-auto max-w-xl py-8">
      <h1 className="mb-6 text-2xl font-bold">Saved addresses</h1>
      <RequireAuth>
        <AddressBook />
      </RequireAuth>
    </div>
  );
}
