# Community Ticketing Platform

Production event‑ticketing, gate check‑in, and food‑coupon platform developed by
**Srikanth Srinivas**. Built with Next.js, Neon Postgres, and Braintree; deployed on
Vercel and used in real production by a nonprofit community organization.

- 🌐 **Live application:** https://ticket-two-tau.vercel.app
- 📊 **Impact dashboard (private, admin PIN):** /impact
- 🔎 **Impact API (private, admin PIN):** /api/impact

## Production Adoption

This platform is in real production use by a nonprofit community organization.
Adoption and impact metrics (tickets processed, transactions, events, users served,
months in production) are generated automatically from the live production database
and are available on a **private, access-controlled dashboard** — they are not
published here. Metrics and transaction audit exports can be provided on request.

## What it does

One purchase (any mix of ticket types) becomes one order with a single signed QR
code. Scanning that QR at the gate checks in the whole group and issues their food
coupons atomically. Staff use phone‑friendly screens for scan/search, check‑in, and
coupon redemption; organizers configure everything and watch a live report.

- Order‑level QR + one‑scan group check‑in
- Multi‑ticket cart (Event Entry + Food Coupon sections)
- Braintree payments (PCI SAQ A — card data tokenized on device)
- Provider‑agnostic email (Brevo / Resend / SendGrid)
- Live report + CSV export
- Adoption & Impact instrumentation (this dashboard)

## Architecture

See [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md) for the full requirements and
data model, and the in‑app `/report` for live operational stats.

## Evidence chain

Created → organization adopted → deployed to production → real transactions occurred
→ measurable, database‑verified impact. The `/impact` page and `/api/impact` endpoint
expose that impact publicly and verifiably, sourced directly from the production
database rather than manually maintained.
