import type { Metadata } from "next";
import "./globals.css";
import { Header } from "@/components/header";
import { AuthProvider } from "@/features/auth/auth-provider";
import { CartProvider } from "@/features/cart/cart-provider";
import { LocationProvider } from "@/features/location/location-provider";
import { themeInitScript } from "@/lib/theme";

export const metadata: Metadata = {
  title: { default: "Swiftcart - groceries in minutes", template: "%s | Swiftcart" },
  description: "Fresh groceries and daily essentials delivered in minutes.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: the inline script sets data-theme before React hydrates.
    <html lang="en" className="h-full antialiased" data-theme="light" suppressHydrationWarning>
      <head>
        {/* Applies the saved/OS theme before first paint to avoid a light flash (Next "preventing flash" guide). */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="flex min-h-full flex-col bg-stone-50 text-zinc-900">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2"
        >
          Skip to content
        </a>
        <AuthProvider>
          <LocationProvider>
            <CartProvider>
            <Header />
            <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
              {children}
            </main>
            <footer className="border-t border-zinc-200 py-6 text-center text-sm text-zinc-500">
              © Swiftcart. Prices include applicable taxes.
            </footer>
            </CartProvider>
          </LocationProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

