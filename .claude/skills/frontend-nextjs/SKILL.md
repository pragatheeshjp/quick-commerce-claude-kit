---
name: frontend-nextjs
description: Use when creating or modifying the customer storefront, admin UI, React components, client state, forms, or frontend API integration.
---

# Frontend Skill

## Stack
Next.js App Router, React, TypeScript, Tailwind CSS. Use accessible, reusable components and a mobile-first responsive layout.

## Structure
Organize by route and feature. Suggested areas:
- `src/app` for routes/layouts
- `src/components` for shared UI
- `src/features/<feature>` for feature-specific components and hooks
- `src/lib` for API client and Supabase browser client
- `src/types` for frontend types
- `src/utils` for pure helpers

## Rules
- Keep server components as the default; use client components only for interactivity/state/browser APIs.
- Do not put privileged Supabase credentials in frontend code.
- Call the Express API for business operations. Do not bypass backend authorization by writing sensitive tables directly from the browser.
- Use a single typed API client with centralized base URL, error handling, and auth-token attachment.
- Validate forms with Zod and provide useful inline errors.
- Handle loading, empty, error, success, and disabled states.
- Ensure keyboard access, semantic HTML, labels, focus states, and sufficient contrast.
- Keep prices formatted consistently in INR, but store monetary values in integer paise or an explicitly documented decimal strategy. Never use floating-point arithmetic for money.
- Product quantities, stock availability, cart totals, discounts, and delivery fees shown by the UI are informational until recalculated by the backend at checkout.
- Use TanStack Query only if it is part of the approved dependency set; avoid adding libraries without explaining the benefit.

## UX expectations
Create an original quick-commerce brand. Include location selection, search, category navigation, product cards, cart, checkout, order history/tracking, and role-protected admin screens. Prioritize mobile usability.

## Verification
Run frontend lint, typecheck, tests, and production build after meaningful changes. Report actual command results; never claim a check passed if it was not run.
