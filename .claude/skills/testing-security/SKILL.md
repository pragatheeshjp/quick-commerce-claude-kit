---
name: testing-security
description: Use when writing tests, reviewing security, validating authorization, or checking commerce edge cases.
---

# Testing and Security Skill

## Test layers
- Unit tests for pure functions and services.
- API integration tests with Supertest.
- Frontend component and interaction tests.
- End-to-end tests for core customer journeys when requested.

## Essential scenarios
- Unauthenticated access to protected APIs is rejected.
- Customer A cannot read or modify Customer B's addresses, cart, or orders.
- Customers cannot invoke admin operations.
- Users cannot self-assign an administrator role.
- Checkout recalculates price, discount, tax, delivery fee, and total on the server.
- Out-of-stock and concurrent stock-depletion scenarios do not oversell.
- Repeated checkout requests do not create duplicate orders.
- Invalid or replayed payment webhooks do not mark orders paid twice.
- Invalid order-status transitions are rejected.
- File uploads enforce type, size, and authorization constraints.

## Security checklist
- Secrets only in environment variables/secret stores.
- No service-role key in browser bundles, logs, Docker images, or Git.
- Validate and sanitize external input.
- Apply rate limiting to authentication-sensitive and public endpoints.
- Restrict CORS to known frontend origins.
- Verify JWTs and webhook signatures.
- Use least privilege and review Supabase RLS policies.
- Avoid leaking stack traces or sensitive database details to clients.
- Keep dependencies updated and inspect advisories.

Run relevant tests, lint, typecheck, and builds. Distinguish tests written from tests actually executed.
