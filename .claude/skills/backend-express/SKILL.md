---
name: backend-express
description: Use when implementing Express routes, controllers, services, middleware, validation, business rules, or REST API behavior.
---

# Backend Skill

## Stack and boundaries
Use Node.js, Express, and TypeScript. The backend is deployed to Render. All application business logic belongs here; Next.js is the client of this API.

## Suggested structure
`src/config`, `src/routes`, `src/controllers`, `src/services`, `src/repositories`, `src/middleware`, `src/validators`, `src/types`, `src/utils`, `app.ts`, and `server.ts`.

## API conventions
- Version endpoints under `/api/v1`.
- Use correct HTTP methods/status codes and a consistent JSON response/error format.
- Validate params, query strings, and request bodies with Zod.
- Add centralized error handling, request logging, CORS allowlisting, rate limiting, and a health endpoint.
- Add pagination and bounded filtering to list endpoints.
- Keep controllers thin; put business decisions in services.
- Never trust prices, discounts, totals, user IDs, roles, stock counts, or payment status supplied by the browser.
- Derive the authenticated user from the verified Supabase token, not from a request body.
- Verify Supabase JWTs using a supported Supabase verification approach and validate issuer/audience/expiry as appropriate. Do not merely decode a JWT.
- Use the service-role key only in the server environment and only where privileged access is required.

## Commerce invariants
- Re-read current product prices and stock on the server at checkout.
- Calculate totals on the server using integer paise or a documented exact-decimal strategy.
- Prevent overselling with database transactions/atomic conditional updates or an equivalent concurrency-safe mechanism.
- Make order creation idempotent where retries are possible.
- Persist an order snapshot of item name, SKU/identifier, quantity, and unit price so later catalog changes do not rewrite order history.
- Validate coupon eligibility and redemption limits on the server.
- Treat payment provider webhooks as untrusted until signature verification succeeds. Make webhook processing idempotent.
- Enforce allowed order-status transitions in a service, not by accepting arbitrary status strings.

## Verification
Add unit/integration tests for authentication, authorization, stock races, checkout totals, cancellation rules, and webhook replay. Run lint, typecheck, tests, and build; report actual results.
