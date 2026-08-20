# MKANT Event Ticketing — Requirements

> **How to use this file.** This is the single source of truth for what the app does.
> Edit it however you like — change wording, flip a **Status**, or add a new row — then send it back and I'll implement the differences.
> Every requirement has a stable **ID** (e.g. `R-BUY-3`). To request a change, reference the ID
> ("update R-BUY-3 to also collect address") or add a new row at the bottom of the relevant table.
>
> **Status legend:** ✅ Done · 🟡 In progress · ⬜ Planned · ❌ Won't do / dropped

_Last updated: 2026-08-20 · Owner: Srikanth / MKANT_

---

## 1. Overview

A ticketing, gate check-in, and food-coupon platform for a paid MKANT community event
(~700–800+ attendees). Buyers register and pay online; staff check people in at the gate with a
QR scan; food coupons are issued at check-in and redeemed at stalls. Organizers configure the
event and watch live numbers.

**Live URLs**
- Buyer (embeddable): `/` → deployed at `https://ticket-two-tau.vercel.app`, embedded on `mallige.org`
- Gate check-in: `/gate` · Stall redemption: `/stall` · Admin: `/admin` · Report: `/report`

---

## 2. Tech stack & deployment

| ID | Requirement | Status |
|----|-------------|--------|
| R-TECH-1 | Next.js (App Router) frontend + API routes | ✅ |
| R-TECH-2 | Neon Postgres as the database | ✅ |
| R-TECH-3 | Braintree for card payments | ✅ |
| R-TECH-4 | Deployed on Vercel | ✅ |
| R-TECH-5 | Buyer page embeddable in mallige.org via iframe (CSP `frame-ancestors` from `EMBED_ORIGIN`) | ✅ |
| R-TECH-6 | Email via Resend (primary) or SendGrid (fallback), selected by env | ✅ |

---

## 3. Roles & access

| ID | Requirement | Status |
|----|-------------|--------|
| R-ROLE-1 | Public buyers need no login | ✅ |
| R-ROLE-2 | Gate + Stall staff sign in with `STAFF_PIN` | ✅ |
| R-ROLE-3 | Admin + Report use `ADMIN_PIN` | ✅ |

---

## 4. Buyer registration & purchase

| ID | Requirement | Status | Notes |
|----|-------------|--------|-------|
| R-BUY-1 | Buyer can add **multiple ticket types in one purchase** (cart, any combination) | ✅ | e.g. 2 Adult + 1 Child + Family |
| R-BUY-2 | Each ticket type has a quantity stepper; running count + total shown | ✅ | |
| R-BUY-3 | Registration fields: First Name*, Last Name*, Email*, Mobile*, Country* (USA/India/Canada), Zip Code | ✅ | Zip optional; others required |
| R-BUY-4 | One payment for the whole cart via Braintree Drop-in | ✅ | |
| R-BUY-5 | Free/comp ticket types skip payment | ✅ | |
| R-BUY-6 | Per-type capacity limit (`max_qty`); sold-out types can't be added | ✅ | |
| R-BUY-7 | **One order = one QR code + one human order code** (e.g. `MKANT-ABC123`) | ✅ | |
| R-BUY-8 | Confirmation shows one pass: items list + single QR + order code | ✅ | |
| R-BUY-9 | Event-details header on the registration page (name, date, venue, tagline, details) | ✅ | Details editable in admin |
| R-BUY-10 | Confirmation honestly states whether the email was sent | ✅ | |

---

## 5. Tickets & coupons model

| ID | Requirement | Status | Notes |
|----|-------------|--------|-------|
| R-TIX-1 | Ticket type has: name, price, **admits** (headcount per unit), max_qty, is_comp | ✅ | |
| R-TIX-2 | Coupons are **denominations** (food scrip, e.g. $2/$5/$8/$10) | ✅ | |
| R-TIX-3 | Ticket type has coupon **allotments** (which denominations, how many per guest) | ✅ | |
| R-TIX-4 | Coupons are **issued at check-in**, not at purchase | ✅ | |

---

## 6. Email confirmation

| ID | Requirement | Status | Notes |
|----|-------------|--------|-------|
| R-EMAIL-1 | Send a branded HTML confirmation on purchase | ✅ | Plum header, order summary, QR, details footer |
| R-EMAIL-2 | Email contains full order details: buyer, itemized tickets, total guests, order code | ✅ | |
| R-EMAIL-3 | Email contains the single group QR | ✅ | |
| R-EMAIL-4 | Editable subject + body template with placeholders `{name}{event}{date}{venue}` | ✅ | In admin |
| R-EMAIL-5 | Admin "Send test" shows the exact provider status | ✅ | |
| R-EMAIL-6 | Provider auto-detected from env; free-mail from-addresses fall back to a valid sender | ✅ | |
| R-EMAIL-7 | **Verify `mallige.org` domain** so emails reach real buyers (not just the account owner) | ⬜ | Needs DNS SPF/DKIM in Resend |

---

## 7. Gate check-in

| ID | Requirement | Status | Notes |
|----|-------------|--------|-------|
| R-GATE-1 | **One scan checks in the whole order** (all tickets) and issues all coupons at once | ✅ | |
| R-GATE-2 | Camera QR scan + manual code/name entry | ✅ | |
| R-GATE-3 | **Live search** (name / email / code), debounced, from 2 chars | ✅ | |
| R-GATE-4 | Search results are **grouped by order/buyer**, showing item summary + guest count + status | ✅ | |
| R-GATE-5 | Result list caps at 50 with "keep typing to narrow" hint (scales to 800+) | ✅ | |
| R-GATE-6 | Check-in is **atomic**; re-scan of an already-in order is a safe no-op | ✅ | |
| R-GATE-7 | Distinct states: Ready to check in · Checked in (success + coupons) · Already checked in | ✅ | |
| R-GATE-8 | Professional check-in card: guest badge, itemized breakdown, coupon total | ✅ | |
| R-GATE-9 | New (not-yet-checked-in) members correctly show **Ready**, never "already checked in" | ✅ | Fixed count bug |
| R-GATE-10 | Optional "confirm N guests" step before finalizing check-in | ⬜ | |

---

## 8. Stall — coupon redemption

| ID | Requirement | Status | Notes |
|----|-------------|--------|-------|
| R-STALL-1 | Look up an order and show **all its coupons** with values + remaining balance | ✅ | |
| R-STALL-2 | Redeem a single coupon or all remaining at once | ✅ | |
| R-STALL-3 | Only checked-in orders can redeem | ✅ | |

---

## 9. Admin console

| ID | Requirement | Status | Notes |
|----|-------------|--------|-------|
| R-ADMIN-1 | Configure event: name, date, venue, tagline, **details** | ✅ | |
| R-ADMIN-2 | Manage ticket types: price, admits, capacity, comp, coupon allotments | ✅ | |
| R-ADMIN-3 | Manage coupon denominations | ✅ | |
| R-ADMIN-4 | Edit confirmation email template + send a test | ✅ | |
| R-ADMIN-5 | Diagnostics: DB self-test, email test with exact status | ✅ | |
| R-ADMIN-6 | Optimistic UI updates after confirmed saves | ✅ | |

---

## 10. Report / dashboard

| ID | Requirement | Status | Notes |
|----|-------------|--------|-------|
| R-RPT-1 | Live stats: orders, total guests, checked-in guests, revenue | ✅ | Refreshes ~15s |
| R-RPT-2 | Coupons issued vs redeemed (count + value) | ✅ | |
| R-RPT-3 | Sales by ticket type | ✅ | |
| R-RPT-4 | Recent check-ins (grouped by order) | ✅ | |
| R-RPT-5 | CSV export — one row per order (code, buyer, mobile, country, items, guests, status, time) | ✅ | |
| R-RPT-6 | Visual polish to match the email/scan card standard | ⬜ | |

---

## 11. Data model (tables)

| Table | Key columns |
|-------|-------------|
| `events` | name, event_date, venue, tagline, details, email_subject, email_body |
| `ticket_types` | event_id, name, price_cents, admits, max_qty, is_comp, active, sort |
| `coupon_types` | event_id, name, value_cents, sort |
| `ticket_coupon_allotments` | ticket_type_id, coupon_type_id, qty_per_guest |
| `orders` | event_id, buyer_name, buyer_email, buyer_phone, buyer_country, buyer_zip, **code**, amount_cents, braintree_txn_id, status |
| `tickets` | order_id, event_id, ticket_type_id, code, qty, status (`valid`/`checked_in`/`void`), checked_in_at, checked_in_by |
| `coupons` | ticket_id, coupon_type_id, redeemed, redeemed_at, redeemed_by |

---

## 12. Security & compliance

| ID | Requirement | Status | Notes |
|----|-------------|--------|-------|
| R-SEC-1 | PCI **SAQ A** — Braintree tokenizes the card on-device; app stores only the transaction id, never card data | ✅ | |
| R-SEC-2 | QR tokens are **HMAC-signed** order ids; tampered codes are rejected | ✅ | |
| R-SEC-3 | Staff/admin screens are PIN-gated | ✅ | |
| R-SEC-4 | Only the buyer page is iframe-embeddable; admin/gate/stall locked to self | ✅ | |
| R-SEC-5 | Enable Braintree **3-D Secure** at checkout | ⬜ | Currently direct charge |

---

## 13. Environment variables (Vercel · Production)

| Var | Purpose |
|-----|---------|
| `DATABASE_URL` | Neon connection (pooler host auto-stripped in code) |
| `BT_ENV` / `BT_MERCHANT_ID` / `BT_PUBLIC_KEY` / `BT_PRIVATE_KEY` | Braintree |
| `TICKET_SECRET` | HMAC secret for QR tokens |
| `STAFF_PIN` / `ADMIN_PIN` | Gate/stall and admin/report PINs |
| `EMBED_ORIGIN` | Allowed iframe parents, comma-separated (e.g. `https://mallige.org,https://www.mallige.org`) |
| `TICKET_CODE_PREFIX` | Order code prefix (e.g. `MKANT`) |
| `RESEND_API_KEY` | Resend key (primary email) |
| `TICKET_FROM_EMAIL` | From-address; unset ⇒ `onboarding@resend.dev` (testing) |
| `SENDGRID_API_KEY` / `SENDGRID_REGION` / `EMAIL_PROVIDER` | SendGrid alternative |
| `PUBLIC_BASE_URL` | Absolute base for QR image URLs in email (optional) |

_Redeploy after changing any env var._

---

## 14. Migrations (run once each, in Neon)

Fresh install: `db/schema.sql` then `db/seed.sql`. Incremental (as needed):
`migrate-admits.sql`, `migrate-denominations.sql`, `migrate-email.sql`, `migrate-fields.sql`,
`migrate-details.sql`, `migrate-order-code.sql`, `cleanup-duplicate-events.sql`.

---

## 15. Backlog / open items

- [ ] R-EMAIL-7 — Verify `mallige.org` in Resend (DNS SPF/DKIM) to email real buyers
- [ ] R-SEC-5 — Braintree 3-D Secure at checkout
- [ ] R-GATE-10 — Optional "confirm N guests" step before check-in
- [ ] R-RPT-6 — Polish the report screen to match the new visual standard
- [ ] Polish the buyer registration page to the new standard
- [ ] One-line SQL to reset all check-ins + issued coupons before the real event (clean slate)

---

## 16. Change requests (add new requirements here)

> Add rows below and I'll turn them into implementation. Give each a new ID.

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| R-NEW-1 | _(example) Collect a full mailing address on registration_ | | |
| | | | |
