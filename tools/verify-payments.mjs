#!/usr/bin/env node
/*
 * verify-payments.mjs — STANDALONE, READ-ONLY payment/ticket reconciliation.
 *
 * Does NOT touch the deployed app, the schema, or any data. It only runs
 * SELECT queries against the database and read-only lookups against Braintree,
 * then prints (and optionally writes a CSV of) any order whose issued ticket
 * does not match a real, correctly-charged payment.
 *
 * Run it from your own machine — nothing to deploy:
 *   1) cd tools
 *   2) npm init -y && npm install @neondatabase/serverless braintree
 *   3) set the env vars (same values as production), then:
 *        DATABASE_URL="postgres://..." \
 *        BT_ENV="production" BT_MERCHANT_ID="..." BT_PUBLIC_KEY="..." BT_PRIVATE_KEY="..." \
 *        node verify-payments.mjs                # fast: DB-side checks
 *        node verify-payments.mjs --deep         # also verify each txn live in Braintree
 *        node verify-payments.mjs --deep --csv   # also write flagged.csv
 */
import { neon } from '@neondatabase/serverless';
import braintree from 'braintree';
import { writeFileSync } from 'node:fs';

const DEEP = process.argv.includes('--deep');
const CSV = process.argv.includes('--csv');

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) { console.error('Set DATABASE_URL'); process.exit(1); }
// use the direct (non-pooled) endpoint for consistent reads
const sql = neon(dbUrl.replace(/-pooler(?=\.)/, ''));

const gateway = (process.env.BT_MERCHANT_ID) ? new braintree.BraintreeGateway({
  environment: process.env.BT_ENV === 'production' ? braintree.Environment.Production : braintree.Environment.Sandbox,
  merchantId: process.env.BT_MERCHANT_ID, publicKey: process.env.BT_PUBLIC_KEY, privateKey: process.env.BT_PRIVATE_KEY,
}) : null;

const money = (c) => (c / 100).toFixed(2);
const OK_STATUSES = ['settled', 'submitted_for_settlement', 'settling', 'authorized', 'authorizing'];
const BAD_STATUSES = ['voided', 'processor_declined', 'gateway_rejected', 'failed', 'settlement_declined'];

const orders = await sql`
  select o.id, o.code, o.amount_cents, o.braintree_txn_id, o.status,
    to_char(o.created_at,'YYYY-MM-DD HH24:MI') as created_at,
    (select count(*) from tickets t where t.order_id = o.id)::int ticket_count
  from orders o where o.status = 'paid' order by o.created_at desc`;

let matched = 0;
const flagged = [];

for (const o of orders) {
  const expected = money(o.amount_cents);
  const issues = [];

  if (o.amount_cents > 0 && !o.braintree_txn_id) issues.push('paid order has NO transaction id');
  if (o.ticket_count === 0) issues.push('order has NO tickets issued');

  if (DEEP && gateway && o.braintree_txn_id) {
    try {
      const tx = await gateway.transaction.find(o.braintree_txn_id);
      if (tx.amount !== expected) issues.push(`Braintree charged ${tx.amount}, order says ${expected}`);
      if (BAD_STATUSES.includes(tx.status)) issues.push(`Braintree status = ${tx.status}`);
      else if (!OK_STATUSES.includes(tx.status)) issues.push(`unexpected Braintree status = ${tx.status}`);
    } catch (e) { issues.push('transaction NOT FOUND in Braintree'); }
  }

  if (issues.length) flagged.push({ code: o.code, txn: o.braintree_txn_id || '', order_amount: expected, tickets: o.ticket_count, created_at: o.created_at, issues: issues.join(' | ') });
  else matched++;
}

console.log('\n=== Payment / ticket reconciliation ===');
console.log(`Mode:        ${DEEP ? 'DEEP (verified live against Braintree)' : 'fast (database-side only — add --deep to verify against Braintree)'}`);
console.log(`Paid orders: ${orders.length}`);
console.log(`Matched:     ${matched}`);
console.log(`Flagged:     ${flagged.length}`);

if (flagged.length) {
  console.log('\n--- Needs review ---');
  for (const f of flagged) console.log(`${f.code}  $${f.order_amount}  tickets:${f.tickets}  txn:${f.txn || '(none)'}  —  ${f.issues}`);
  if (CSV) {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = ['code,txn,order_amount,tickets,created_at,issues',
      ...flagged.map((f) => [f.code, f.txn, f.order_amount, f.tickets, f.created_at, f.issues].map(esc).join(','))].join('\n');
    writeFileSync('flagged.csv', csv);
    console.log('\nWrote flagged.csv');
  }
} else {
  console.log('\n✅ Every paid order has tickets and matches its payment.');
}
process.exit(0);
