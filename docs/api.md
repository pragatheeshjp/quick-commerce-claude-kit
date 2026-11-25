# REST API (v1)

Base URL `http://localhost:4000/api/v1`. All responses are JSON:
`{ "success": true, "data": ..., "meta"?: ... }` or `{ "success": false, "error": { "code", "message", "details"? } }`.
Money fields are integer paise (`price_paise: 6800` = Rs 68.00). Protected routes need
`Authorization: Bearer <Supabase access token>`.

## Public
| Method | Path | Notes |
|---|---|---|
| GET | `/health` | liveness |
| GET | `/categories` | active categories (flat; use `parent_id` for the tree) |
| GET | `/products` | active products. Query: `category` (slug, includes direct children), `q` (name/brand search), `page` (default 1), `pageSize` (default 20, max 50). Returns `meta: {page,pageSize,total}` |
| GET | `/products/:id` | one active product |

Public products expose `in_stock` (boolean) and `image_url`, never raw stock counts or `is_active`.
`q` allows only letters, digits, space and `' & . -` (it is used in a database filter); anything else is 400.

| GET | `/serviceability/:pincode` | `{serviceable, area_name, city, delivery_fee_paise, min_order_paise}` or `{serviceable:false}` |

## Authenticated (any signed-in user; always scoped to the token's user)
| Method | Path | Notes |
|---|---|---|
| GET | `/me` | verified user id/email, `role` (`customer`/`admin`), profile |
| GET | `/addresses` | own addresses, default first |
| POST | `/addresses` | `label, line1, line2?, landmark?, city, state, pincode, is_default?`. Max 10 per user; the first becomes default |
| PATCH | `/addresses/:id` | partial update; `is_default:true` atomically swaps the default. Others' ids -> 404 |
| DELETE | `/addresses/:id` | 204; does not auto-promote another default |
| GET | `/cart` | server-priced view: per-line `unit_price_paise`, `line_total_paise`, `purchasable`, `issue` (`unavailable`/`insufficient_stock`), plus `subtotal_paise` (purchasable lines only) and `item_count` |
| PUT | `/cart/items/:productId` | `{quantity: 1..50}` sets (not adds) the quantity; 409 `INSUFFICIENT_STOCK` with `details.available_quantity` if above stock |
| DELETE | `/cart/items/:productId` | remove a line (404 if not in your cart) |
| DELETE | `/cart` | empty the cart |

Cart totals are informational. Checkout re-reads prices and stock and recalculates everything.
The service role bypasses RLS, so every repository query filters by the verified `user_id`; live tests prove
customer B cannot read, edit or delete customer A's addresses or cart.

## Checkout and orders (signed-in users)
| Method | Path | Notes |
|---|---|---|
| POST | `/checkout/quote` | `{address_id, coupon_code?}` -> `{subtotal_paise, discount_paise, delivery_fee_paise, total_paise}`. Dry run through the same SQL as real checkout; writes nothing |
| POST | `/orders` | Same body, plus a **required `Idempotency-Key` header** (8-128 chars `A-Za-z0-9._:-`). 201 for a new order, 200 + `meta.replayed:true` when the key was already used. The order is built from the server-side cart; no items, prices or totals are accepted from the client |
| GET | `/orders`, `/orders/:id` | own orders only (others -> 404); items are snapshots of name/sku/unit price at purchase time |
| POST | `/orders/:id/cancel` | allowed while `pending` or `confirmed`; restores stock and releases the coupon redemption; repeating it changes nothing |

Business errors: `CART_EMPTY` 400; `ADDRESS_NOT_FOUND` 404; `PINCODE_NOT_SERVICEABLE`, `BELOW_MINIMUM_ORDER`,
`COUPON_INVALID`, `COUPON_MIN_ORDER_NOT_MET`, `COUPON_EXHAUSTED`, `COUPON_ALREADY_USED`, `ORDER_TOO_LARGE` 422;
`PRODUCT_UNAVAILABLE`, `INSUFFICIENT_STOCK`, `INVALID_TRANSITION` 409.

Total = subtotal - discount + delivery fee, all integer paise. Percent coupons floor and respect `max_discount_paise`.

## Admin (verified admin role required; 401 anonymous, 403 customers)
| Method | Path | Notes |
|---|---|---|
| GET | `/admin/ping` | role check |
| GET/POST | `/admin/categories` | list incl. inactive / create |
| PATCH | `/admin/categories/:id` | partial update (deactivate with `is_active:false`) |
| GET | `/admin/products` | includes inactive and `stock_quantity`; `includeInactive=false` to hide inactive |
| GET | `/admin/products/:id` | one product including inactive and `stock_quantity` |
| POST | `/admin/products` | create; optional `initial_stock` (recorded in the inventory ledger) |
| PATCH | `/admin/products/:id` | partial update; **cannot** change stock; unknown fields rejected |
| POST | `/admin/products/:id/stock` | `{ "delta": -3, "reason": "restock" | "adjustment" }` |

Products are deactivated rather than deleted so order history and the ledger stay intact.
Removing more stock than exists returns 409 `INSUFFICIENT_STOCK`.

### Admin management
| Method | Path | Notes |
|---|---|---|
| GET | `/admin/admins` | list admins `{user_id, email, created_at}` |
| POST | `/admin/admins` | `{email}` grants admin to an existing account (idempotent). 404 `USER_NOT_FOUND` if no such account |
| DELETE | `/admin/admins/:userId` | 204. 409 `CANNOT_REVOKE_SELF`; 409 `LAST_ADMIN`; 404 if that user is not an admin |

Revoking runs in the `revoke_admin()` SQL function under an advisory lock, so two admins cannot revoke each
other concurrently and leave zero admins. Role changes take effect on the next request (no re-login needed).

| Method | Path | Notes |
|---|---|---|
| GET | `/admin/orders` | all orders; filter `status`, paginated |
| GET | `/admin/orders/:id` | with items and `user_id` |
| PATCH | `/admin/orders/:id/status` | `{status}`; only legal moves: pending->confirmed/cancelled, confirmed->packed/cancelled, packed->out_for_delivery, out_for_delivery->delivered. Anything else is 409. Cancelling restores stock |

## Behaviour guarantees
- Stock changes only via the `adjust_stock()` database function: one conditional UPDATE, never below zero
  under concurrency (verified: 12 concurrent -1 calls against stock 5 -> exactly 5 succeed, 7 get 409),
  with a matching `inventory_transactions` ledger row in the same transaction.
- Bodies are strict: unknown fields (e.g. `role`, `stock_quantity` on PATCH) are rejected.
- Duplicate slug/SKU -> 409; invalid references/constraints -> 400; database internals are never returned.

## How checkout stays safe
`checkout()` and `cancel_order()` are SQL functions run as one transaction by the service role only:
- an advisory lock on (user, Idempotency-Key) serialises double-submits, so retries never create a second order;
- product rows are locked `FOR UPDATE` in id order, so two buyers can never take the last unit (and cannot deadlock);
- the coupon row is locked, so usage limits hold under races;
- on any error everything rolls back (the cart is untouched).
Verified live: 6 parallel same-key submits -> 1 order; two buyers for stock of 1 order -> one 201, one 409; a
coupon with `usage_limit` 1 raced by two users -> one winner.

Known gap: stock reserved by a `pending` order is held until it is cancelled. Payments (next phase) will confirm
orders; an expiry job for abandoned pending orders is still to be built.

## Deferred
Product image upload (needs a multipart library; a separate decision), payments and webhooks, abandoned-order expiry, admin coupon management.



