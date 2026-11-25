---
name: supabase-data-auth
description: Use when designing Supabase PostgreSQL schema, migrations, RLS, authentication, storage, or database access.
---

# Supabase Database and Auth Skill

## Responsibilities
Use Supabase for managed PostgreSQL, Auth, and Storage. Express remains the trusted application API for commerce operations.

## Database design
Create versioned SQL migrations. Model at minimum:
- profiles
- addresses
- categories
- products
- carts and cart_items
- orders and order_items
- payments
- coupons and coupon_redemptions
- inventory_transactions
- serviceable_pincodes

Add appropriate primary/foreign keys, unique constraints, check constraints, indexes, timestamps, and explicit delete/update behavior. Use integer paise for INR prices, with column names that make the unit explicit (for example `price_paise`).

## Security
- Enable RLS on tables exposed through Supabase APIs.
- Customers may access only their own profile, addresses, cart, and orders, subject to the intended data model.
- Do not rely on frontend checks for authorization.
- Admin access must be based on a trusted role/claims strategy; users must not be able to grant themselves admin privileges by editing their profile.
- Keep service-role credentials exclusively on the backend.
- Review every policy for both `USING` and `WITH CHECK` behavior where applicable.
- Do not make product, inventory, payment, or order state writable directly by untrusted clients unless a narrowly scoped policy explicitly requires it.

## Authentication
Use Supabase Auth for signup/signin/session lifecycle. The frontend obtains the access token; Express verifies it on protected requests. Implement logout, password reset, and protected routes. Design Google OAuth and phone OTP as later additions unless explicitly requested.

## Storage
Use a dedicated product image bucket with explicit upload/read policies. Validate file type and size. Store object paths in the database, not expiring signed URLs as permanent product image references.

## Migrations and seeds
- Keep schema changes in migrations; do not rely on manual dashboard-only changes.
- Provide development seed data separately from production data.
- Never place real secrets or customer data in seed files.
- Document how to apply migrations and create a local/cloud Supabase project.
