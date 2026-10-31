# Payment / ticket reconciliation (standalone)

`verify-payments.mjs` is a **read-only** tool that verifies every issued ticket
is backed by a real, correctly-charged payment. It does **not** change the app,
the database schema, or any data — only SELECT queries and read-only Braintree
lookups.

## Run it (from your machine, nothing to deploy)

```bash
cd tools
npm init -y
npm install @neondatabase/serverless braintree

# Use the SAME values as production (read-only credentials are fine):
export DATABASE_URL="postgres://...neon..."
export BT_ENV="production"
export BT_MERCHANT_ID="..."
export BT_PUBLIC_KEY="..."
export BT_PRIVATE_KEY="..."

node verify-payments.mjs          # fast DB-side checks (no tickets? no txn id?)
node verify-payments.mjs --deep   # also confirm each charge live in Braintree
node verify-payments.mjs --deep --csv   # write flagged.csv for records
```

## What it flags
- A paid order with **no transaction id**
- A paid order with **no tickets issued**
- (with `--deep`) Braintree **charged a different amount** than the order
- (with `--deep`) the transaction is **voided / declined / refunded / missing** in Braintree

"Matched" = the order has tickets and its charge matches. Run it before and after
your event for a clean, verifiable record.
