# MKANT Tickets — production core

A ticketing + gate check-in + food-coupon backend for a **paid, 700+ attendee** MKANT
event, on the same stack as the Pustaka Mela store: **Next.js (App Router) + Neon
Postgres + Braintree**, deployable to Vercel. The registration link lives on the
MKANT website (link or iframe embed).

Complete and building cleanly: schema, payment, signed QR tickets, the atomic
check-in / coupon logic, **and** the three screens — embedded buyer flow, gate
check-in, and stall redemption. `npm run build` passes with all routes wired.

## What's here

```
db/schema.sql        Postgres schema (events, ticket types, coupons, orders, tickets)
db/seed.sql          Example MKANT event with Adult/Child/Family/Comp tiers
lib/db.js            Neon client (sql = simple queries, pool = transactions)
lib/token.js         HMAC-signed QR tokens (forgery-resistant) + human codes
lib/braintree.js     Braintree gateway
lib/email.js         Ticket email w/ embedded QR (Resend shown, swappable)
app/api/client-token Braintree Drop-in token for the purchase form
app/api/checkout     Charge + atomically create order & ticket (capacity checked)
app/api/lookup       Staff lookup by scanned token, code, or name/email
app/api/checkin      Atomic check-in + coupon issuance (one CTE, race-safe)
app/api/redeem       Atomic coupon redemption (single or redeem-all)
app/api/ticket       Ticket detail + coupons (stall screen)
app/api/event        Public: event + tiers with remaining capacity (buyer screen)
app/api/export       CSV of all tickets — the printed offline backup
app/page.jsx         Buyer flow — the page you iframe onto the MKANT site
app/gate/page.jsx    Gate check-in (PIN sign-in, scan/type, issue coupons)
app/stall/page.jsx   Food-stall redemption (PIN sign-in, scan/type, redeem)
app/admin/page.jsx   Ticket setup console (PIN sign-in) — build your own tiers
app/api/admin/*      Config load, event upsert, coupon-type CRUD, ticket-type CRUD
next.config.js       CSP frame-ancestors so mkant.org can embed the buyer flow
```

## The four screens

- **`/`** — the buyer flow. This is the URL you drop into the MKANT `<iframe>`. Tiers,
  quantity, buyer details, Braintree Drop-in card form, then a confirmed ticket with QR.
  Free/comp tiers skip payment.
- **`/admin`** — ticket setup (organizer PIN). Create your own ticket types — individual,
  group/family, comp — set price, capacity, group size, and exactly which food coupons
  each ticket grants. No SQL needed; the buyer flow updates the moment you save.
- **`/gate`** — gate staff. PIN sign-in, then scan a QR or search by name/code, tap to
  check in, and the issued food coupons appear to hand over.
- **`/stall`** — food stalls. PIN sign-in, look up a guest, redeem coupons one at a time
  or all at once. Staff open `/gate`, `/stall`, and `/admin` directly (not embedded).

## Ticket types, groups, and coupons

Each ticket type has a **price**, a **group size** (how many people one ticket admits —
1 for individual, 4 for a family pack), a **capacity** (tickets available), an optional
**comp** flag, and a **coupon allotment** (how many of each coupon the ticket grants, in
total). Because group size is explicit, your check-in dashboard counts *people*, not just
tickets — which matters at 700+. Deleting a tier that already has sales deactivates it
instead of destroying order history.

## Setup

1. `cp .env.example .env.local` and fill in Neon, Braintree, a random `TICKET_SECRET`
   (`openssl rand -base64 32`), an email key, and a `STAFF_PIN`.
2. Create the tables: run `db/schema.sql` against your Neon database (then `db/seed.sql`
   to load a sample event you can test against immediately). If you already ran an older
   `schema.sql`, also run `db/migrate-admits.sql` to add group-size support.
3. Set two PINs in the env: `ADMIN_PIN` (ticket setup) and `STAFF_PIN` (gate + stall).
   Keep the admin PIN tighter — it can change prices and tiers.
4. `npm install && npm run dev`. Configure your tiers at `/admin`.
4. Deploy to Vercel; set the same env vars in the project settings. Point a subdomain
   like `tickets.mkant.org` at it.

## Integrating with the MKANT site (no source code needed)

Both work from a normal page/HTML editor:

- **Link:** `<a href="https://tickets.mkant.org">Buy tickets</a>`
- **Embed:** `<iframe src="https://tickets.mkant.org" style="width:100%;height:820px;border:0"></iframe>`

## Why the QR is a signed token, not just a code

At 700+ paid, a plaintext code is guessable/forgeable. The QR carries
`ticketId.HMAC(ticketId)`; the server rejects any token whose signature doesn't
match `TICKET_SECRET`. The human code (e.g. `MKANT-8F3K2Q`) still works for manual
lookup when a scan won't cooperate.

## Why check-in and redeem are single atomic statements

With several gate stations and food stalls scanning at once, two people can hit the
same ticket in the same second. Check-in uses one CTE that flips `valid → checked_in`
**and** issues coupons only if the flip succeeded — so a ticket can never be checked
in twice or issued double coupons. Redemption uses `UPDATE ... WHERE redeemed=false`,
so a coupon is spent exactly once. No application-level locking, no race.

## Operating at 700+ — plan for these

- **Multiple gate stations.** Budget one scanner per ~5–8 arrivals/min. For a 700-person
  arrival window of ~60–90 min, run **3–4 stations**. All hit the same endpoints; the
  atomic logic keeps them consistent.
- **Venue wifi will wobble.** Print the `/api/export?pin=...` CSV before doors open as a
  paper fallback, and consider a check-in mode that caches the ticket list in the browser
  and syncs — worth adding if the hall's connection is unknown.
- **Don't oversell.** Each tier has `max_qty`; checkout refuses once a tier is full. Set
  caps to your real capacity (and comp count for volunteers/performers).
- **Comps.** The `is_comp` tier (volunteers, performers, sponsors) skips payment but still
  issues a QR + coupons — common for MKANT.
- **Refunds / reconciliation.** Refund from the Braintree dashboard; `orders.braintree_txn_id`
  ties every ticket back to its transaction. If a charge ever succeeds but the DB write
  fails, the transaction id is logged for manual reconcile.
- **Family tickets.** A "Family (up to 4)" tier is one ticket unit whose coupon allotment
  is set to 4 (e.g. 4 lunches), checked in once at the gate.

## Before the real event

- **Braintree 3-D Secure.** The buyer flow uses standard Drop-in; if you want issuer
  fraud protection (recommended for real card volume), enable 3DS on the Drop-in
  `create()` call and verify on the server. The current flow charges directly.
- **Go live.** Flip `BT_ENV` to `production` with live Braintree keys, set `EMBED_ORIGIN`
  to the exact MKANT origin, and generate a fresh `TICKET_SECRET`.
- **Configure the event** at `/admin` — build your tiers, groups, comps, and coupon
  allotments there; the sample seed is only a starting point you can edit or delete.
