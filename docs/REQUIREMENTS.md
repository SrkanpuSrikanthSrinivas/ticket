# MKANT Event Ticketing — Requirements

> **How to use this file.** This is the single source of truth for the platform.
> Edit any line, flip a status box, or add a new item under **Requested changes**,
> then hand the file back and say e.g. *"implement BUY‑7 and CHK‑4, and the items
> under Requested changes."* Each requirement has a stable **ID** (don't renumber
> existing ones — add new numbers so references stay valid). Status legend:
> `[x]` done · `[ ]` planned/not built · `[~]` partially done / needs work.

- **Owner:** MKANT (Mallige Kannada Association of North Texas)
- **Last updated:** 2026‑08‑20
- **Live app:** https://ticket-two-tau.vercel.app  ·  **Embedded on:** mallige.org/p/jj-2026
- **Scale target:** ~800+ attendees, mixed group/family purchases

---

## 1. Overview

A self‑hosted event ticketing, gate check‑in, and food‑coupon system for a paid
community event. Buyers register and pay online; each **order** produces **one QR
code** that admits the whole group at the gate and issues food coupons on check‑in.
Staff use phone‑friendly screens to scan/search, check in, and redeem coupons.
Organizers configure everything and watch a live report.

---

## 2. Architecture & stack

| Area | Choice |
|---|---|
| Framework | Next.js (App Router) |
| Database | Neon Postgres (serverless HTTP driver) |
| Payments | Braintree Drop‑in (tokenized on device) |
| Email | Resend (primary) or SendGrid (fallback) |
| Hosting | Vercel |
| Buyer embed | `<iframe>` on mallige.org |

- **ARCH‑1** `[x]` Deploy ticketing as its **own** Vercel project + its own Neon DB/branch (isolated from the store).
- **ARCH‑2** `[x]` Buyer page (`/`) is embeddable; `/admin`, `/gate`, `/stall`, `/report` are locked to `frame-ancestors 'self'`.
- **ARCH‑3** `[x]` `EMBED_ORIGIN` (comma‑separated) controls which sites may embed `/`. Must exactly match the embedding origin (e.g. `https://mallige.org`). Re‑deploy after changing (read at build).
- **ARCH‑4** `[x]` DB writes use the **direct** Neon endpoint (pooler host auto‑stripped) with no‑store fetch to avoid stale reads after writes.
- **ARCH‑5** `[x]` **PCI SAQ A** posture — card data is tokenized by Braintree on the buyer's device; app stores only `braintree_txn_id`, never card data.

---

## 3. Roles & access

- **ROLE‑1** `[x]` **Buyer** — public, no login. Registers and pays.
- **ROLE‑2** `[x]` **Staff** (gate + stall) — signs in with `STAFF_PIN`.
- **ROLE‑3** `[x]` **Organizer/Admin** — signs in with `ADMIN_PIN` (setup + report).
- **ROLE‑4** `[ ]` *(optional future)* Per‑device staff names / audit of who checked in whom.

---

## 4. Screens / routes

| Route | Who | Purpose | Status |
|---|---|---|---|
| `/` | Buyer | Registration + cart + payment + confirmation | `[x]` |
| `/gate` | Staff | Scan/search, check in a whole order, issue coupons | `[x]` |
| `/stall` | Staff | Look up an order, redeem food coupons | `[x]` |
| `/admin` | Admin | Event, ticket types, coupons, email template, test email | `[x]` |
| `/report` | Admin | Live stats, sales by tier, recent check‑ins, CSV | `[x]` |

Supporting APIs: `/api/event`, `/api/client-token`, `/api/checkout`, `/api/lookup`,
`/api/checkin`, `/api/ticket`, `/api/redeem`, `/api/qr`, `/api/export`,
`/api/admin/config`, `/api/admin/event`, `/api/admin/report`, `/api/admin/test-email`,
`/api/admin/selftest`.

---

## 5. Data model

- **events** — name, event_date, venue, tagline, **details** (shown on registration page), email_subject, email_body.
- **ticket_types** — name, description, price_cents, **admits** (headcount per unit), max_qty (capacity), is_comp (free), active, sort.
- **coupon_types** — name, **value_cents** (denomination, e.g. $2/$5/$8/$10), sort.
- **ticket_coupon_allotments** — ticket_type → coupon_type, qty_per_guest.
- **orders** — buyer_name, buyer_email, buyer_phone (mobile), buyer_country, buyer_zip, **code** (`MKANT‑…`), amount_cents, braintree_txn_id, status.
- **tickets** — order_id, ticket_type_id, code, qty, status (`valid`/`checked_in`/`void`), checked_in_at/by.
- **coupons** — ticket_id, coupon_type_id, redeemed, redeemed_at/by.

---

## 6. Buyer / registration (`/`)

- **BUY‑1** `[x]` Show an **event header/template**: name, date, venue, tagline, and free‑text **details** (schedule, address, parking, what to bring).
- **BUY‑2** `[x]` **Cart**: every ticket type has a quantity stepper; buyer can pick **any combination** (e.g. 2 Adult + 1 Child + Family). Running count + total shown.
- **BUY‑3** `[x]` Registration fields, in order: **First Name\***, **Last Name\***, **Email Id\***, **Mobile Number\***, **Zip Code**. (`*` = required; Zip optional.) *(R‑NEW‑2: Country removed.)*
- **BUY‑4** `[x]` Free/comp ticket types don't add to the total; if the whole cart is free, skip payment.
- **BUY‑5** `[x]` One payment for the whole cart via Braintree Drop‑in (cardholder name required).
- **BUY‑6** `[x]` Confirmation shows **one** pass: buyer, itemized list, **one QR** (order token), order code, and whether the email was sent.
- **BUY‑7** `[ ]` *(idea)* Optional per‑attendee names for each ticket in a group.
- **BUY‑8** `[ ]` *(idea)* Discount / promo codes.
- **BUY‑9** `[x]` **Cart ticket table** — the cart card shows a small table of selected types (type × qty × subtotal) before the total. *(R‑NEW‑1)*
- **BUY‑10** `[x]` The **ticket table (type × qty)** appears consistently in cart, confirmation, email, gate scan card, and stall. *(R‑NEW‑4)*

---

## 7. Payment

- **PAY‑1** `[x]` Braintree sale for the cart total; store `braintree_txn_id`.
- **PAY‑2** `[x]` Capacity check per ticket type before charging (blocks oversell).
- **PAY‑3** `[ ]` Enable **3‑D Secure** at checkout (currently a direct charge).
- **PAY‑4** `[~]` Graceful handling if payment succeeds but DB save fails (currently returns an error noting the txn id; no auto‑refund/repair).

---

## 8. Order QR & codes

- **QR‑1** `[x]` **One QR per order** (transaction), not per ticket. QR encodes an HMAC‑signed order id; tampered codes are rejected.
- **QR‑2** `[x]` One human **order code** per order (prefix from `TICKET_CODE_PREFIX`, e.g. `MKANT‑ABC123`) for manual lookup.
- **QR‑3** `[x]` The **same** QR image (`/api/qr?token=…`) is used on the confirmation page, in the email, and for gate scanning.

---

## 9. Email confirmation

- **EMAIL‑1** `[x]` Provider‑agnostic: uses **Resend** if `RESEND_API_KEY` set, else **SendGrid**; `EMAIL_PROVIDER` can force one.
- **EMAIL‑2** `[x]` **Professional branded template**: plum header band (event name + date/venue), custom message, **order summary** (buyer, itemized tickets, total guests, order code), bordered **QR**, and an **Event details** footer.
- **EMAIL‑3** `[x]` One email per order carrying the single group QR.
- **EMAIL‑4** `[x]` Checkout reports whether the email actually sent (`emailed` / `email_error`); buyer UI is honest when it didn't.
- **EMAIL‑5** `[x]` Admin **"Send test"** button reports the exact provider status (diagnoses 401/403/etc.).
- **EMAIL‑6** `[~]` **To email real buyers**, verify a sending **domain** (e.g. `mallige.org`) with the provider and set `TICKET_FROM_EMAIL` to an address on it. Test sender (`onboarding@resend.dev`) only delivers to the account owner. *(Setup task, not code.)*
- **EMAIL‑7** `[x]` Free‑mail from‑addresses (gmail/yahoo/…) auto‑fall back to the test sender to avoid a hard failure.
- **EMAIL‑8** `[x]` Editable email **subject/body** with placeholders: `{name} {event} {date} {venue}`.

---

## 10. Gate check‑in (`/gate`)

- **CHK‑1** `[x]` Staff sign‑in with `STAFF_PIN`.
- **CHK‑2** `[x]` Two modes: **Scan QR** (camera) and **Type / search**.
- **CHK‑3** `[x]` **Live search** as you type (debounced, from 2 chars); matches by name, email, order code, or any ticket code.
- **CHK‑4** `[x]` Results are **orders** (one row per buyer) showing item summary (Adult ×2, Child ×1), guest count, and status pill; capped at 50 with a "keep typing" hint.
- **CHK‑5** `[x]` **One scan/tap checks in the whole order** — all its tickets flip to checked‑in and all coupons are issued atomically.
- **CHK‑6** `[x]` Re‑scanning a checked‑in order is a **safe no‑op** (distinct "already checked in" card with time).
- **CHK‑7** `[x]` Correct status: a newly registered order shows **Ready to check in**, not "already checked in." *(Fixed.)*
- **CHK‑8** `[x]` **Professional card**: colored header, guest badge, itemized breakdown, order code, coupon total on success.
- **CHK‑9** `[ ]` *(idea)* Optional **"confirm N guests"** step before finalizing (for partial groups arriving separately).
- **CHK‑10** `[ ]` *(idea)* Undo a mistaken check‑in.
- **CHK‑11** `[x]` On scan/select, the card shows **what to issue** *before* check‑in: ticket breakdown (Adult ×2, Child ×1) **and** coupons to issue grouped by denomination ($5 ×3, $2 ×2). After check‑in, coupons are grouped with counts + total. *(R‑NEW‑3)*

---

## 11. Food coupons

- **CPN‑1** `[x]` Coupons are **denominations** (value in cents) acting as food scrip.
- **CPN‑2** `[x]` Each ticket type has coupon **allotments** (qty per guest); issued = allotment × ticket qty, per ticket in the order.
- **CPN‑3** `[x]` Issued automatically at check‑in.
- **CPN‑4** `[x]` **Stall** (`/stall`): look up an order, see all coupons with values and a running balance, redeem one or **all**.
- **CPN‑5** `[x]` Redeeming an already‑redeemed coupon is a safe no‑op.

---

## 12. Admin console (`/admin`)

- **ADM‑1** `[x]` Sign in with `ADMIN_PIN`.
- **ADM‑2** `[x]` Edit **event**: name, date, venue, welcome line, **details** (registration‑page text).
- **ADM‑3** `[x]` Manage **ticket types**: price, admits, capacity, comp, coupon allotments.
- **ADM‑4** `[x]` Manage **coupon denominations**.
- **ADM‑5** `[x]` Edit **email template** (subject/body) + **Send test**.
- **ADM‑6** `[x]` Saves persist reliably (direct endpoint) with optimistic UI.

---

## 13. Report & export (`/report`)

- **RPT‑1** `[x]` Live stats (15s refresh): **orders**, total guests, **checked‑in guests**, revenue (paid), coupon value **redeemed vs issued**.
- **RPT‑2** `[x]` **Sales by ticket type** (sold + revenue).
- **RPT‑3** `[x]` **Recent check‑ins** (grouped per order/group).
- **RPT‑4** `[x]` **CSV export** — one row per order: code, name, email, mobile, country, items, guests, status, check‑in time. Works with admin PIN.
- **RPT‑5** `[ ]` *(idea)* Per‑stall / per‑coupon‑type redemption breakdown.
- **RPT‑6** `[ ]` *(idea)* Time‑series (check‑ins per 15 min) to spot gate rushes.

---

## 14. Non‑functional

- **NFR‑1** `[x]` Handle 800+ attendees; search stays readable and fast.
- **NFR‑2** `[x]` Mobile‑first staff screens.
- **NFR‑3** `[x]` Atomic check‑in / coupon issuance (no double issue).
- **NFR‑4** `[~]` Accessibility / large‑text mode for gate volunteers — basic, could be improved.
- **NFR‑5** `[ ]` Offline tolerance at the gate (spotty venue Wi‑Fi) — not built.

---

## 15. Environment variables (Vercel → Production; redeploy after changes)

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Neon connection (pooler host auto‑stripped in code) |
| `BT_ENV` / `BT_MERCHANT_ID` / `BT_PUBLIC_KEY` / `BT_PRIVATE_KEY` | Braintree |
| `TICKET_SECRET` | HMAC secret for signing order QRs |
| `STAFF_PIN` / `ADMIN_PIN` | Gate/stall and admin access |
| `EMBED_ORIGIN` | Allowed iframe origins (comma‑separated) |
| `TICKET_CODE_PREFIX` | Order code prefix (e.g. `MKANT`) |
| `RESEND_API_KEY` | Email (primary) |
| `TICKET_FROM_EMAIL` | From address (must be a verified sender/domain for real buyers) |
| `EMAIL_PROVIDER` | Optional: `resend` or `sendgrid` |
| `SENDGRID_API_KEY` / `SENDGRID_REGION` | Email (fallback); `eu` if EU account |
| `PUBLIC_BASE_URL` | Absolute base for QR image URLs in email (optional) |

---

## 16. Database migrations (run on Neon as needed)

Fresh: `db/schema.sql` then `db/seed.sql`. Incremental (idempotent):
`migrate-admits.sql`, `migrate-denominations.sql`, `migrate-email.sql`,
`migrate-fields.sql` (country/zip), `migrate-details.sql` (event details),
`migrate-order-code.sql` (order code), `cleanup-duplicate-events.sql`.

- **DATA‑1** `[ ]` *(operational)* Optional one‑line SQL to **reset all check‑ins + issued coupons** before the real event (keeps registrations). *Ask to generate.*

---

## 17. Open decisions

- **DEC‑1** Keep one‑tap gate check‑in, or add a "confirm N guests" step? *(see CHK‑9)*
- **DEC‑2** Enable 3‑D Secure now or after go‑live? *(see PAY‑3)*
- **DEC‑3** Carry the new email/scan visual polish into the **buyer page** and **report** screen?

---

## 18. Requested changes (you fill this in)

> Add new asks here. Reference existing IDs to modify, or describe new ones.
> Example:
> - [ ] CHK‑9: add a "confirm 3 guests" step before check‑in finalizes.
> - [ ] New: send an SMS with the QR in addition to email.

- [x] R‑NEW‑1 — cart shows a small ticket table. *(done)*
- [x] R‑NEW‑2 — Country removed from the form. *(done)*
- [x] R‑NEW‑3 — scan shows tickets + coupons to issue (counts). *(done)*
- [x] R‑NEW‑4 — ticket table kept everywhere. *(done)*
- [ ] …add your next requirement here…

---

## 19. Change log

| Date | Change |
|---|---|
| 2026‑08‑20 | Order‑level QR + one‑scan group check‑in; multi‑ticket cart; event‑details template; 800+ search; professional email + scan card; fixed false "already checked in". |
| 2026‑08‑20 | R‑NEW‑1 cart ticket table; R‑NEW‑2 removed Country; R‑NEW‑3 scan shows tickets + coupons‑to‑issue; R‑NEW‑4 ticket table everywhere (cart/email/gate/stall). |
| (earlier) | Initial build: buyer/gate/stall/admin, coupons, Braintree, Resend/SendGrid email, report, CSV. |
