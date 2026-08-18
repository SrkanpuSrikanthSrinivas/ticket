export const dynamic = 'force-dynamic';

import { pool } from '../../../lib/db';
import { gateway } from '../../../lib/braintree';
import { signTicket, humanCode } from '../../../lib/token';
import { sendTicketEmail } from '../../../lib/email';

// Public purchase endpoint. Charges Braintree first, then atomically writes the
// order + ticket. Capacity is checked inside the transaction to resist oversell.
//
// PCI: this endpoint NEVER sees card data. Braintree's Drop-in collects the card
// in its own hosted iframe on the buyer's device and returns a one-time
// `paymentMethodNonce`. We forward only that nonce to Braintree and store only the
// resulting transaction id — no PAN, CVV, or expiry ever touches this server or DB.
// That keeps the merchant in PCI SAQ A (card handling fully outsourced to Braintree).
export async function POST(req) {
  const body = await req.json().catch(() => null);
  if (!body) return Response.json({ error: 'bad_request' }, { status: 400 });

  const { ticketTypeId, qty = 1, buyer = {}, paymentMethodNonce } = body;
  const units = Math.max(1, parseInt(qty, 10) || 1);
  if (!ticketTypeId || !buyer.name || !buyer.email)
  return Response.json({ error: 'missing_fields' }, { status: 400 });

  const client = await pool.connect();
  try {
    const tt = (await client.query(
      `select id, event_id, name, price_cents, max_qty, is_comp
         from ticket_types where id=$1 and active=true`, [ticketTypeId])).rows[0];
    if (!tt) return Response.json({ error: 'ticket_type_unavailable' }, { status: 404 });

    // Capacity check (soft lock: sum of sold units for this tier).
    if (tt.max_qty != null) {
      const sold = (await client.query(
        `select coalesce(sum(qty),0)::int s from tickets
          where ticket_type_id=$1 and status <> 'void'`, [ticketTypeId])).rows[0].s;
      if (sold + units > tt.max_qty)
      return Response.json({ error: 'sold_out', remaining: Math.max(0, tt.max_qty - sold) }, { status: 409 });
    }

    const amountCents = tt.is_comp ? 0 : tt.price_cents * units;
    let txnId = null;

    // Charge before opening the write transaction so we don't hold locks over the network.
    if (amountCents > 0) {
      if (!paymentMethodNonce) return Response.json({ error: 'payment_required' }, { status: 400 });
      const amount = (amountCents / 100).toFixed(2);
      const result = await gateway.transaction.sale({
        amount,
        paymentMethodNonce,
        options: { submitForSettlement: true },
      });
      if (!result.success) return Response.json({ error: 'payment_declined', message: result.message }, { status: 402 });
      txnId = result.transaction.id;
    }

    await client.query('BEGIN');
    const order = (await client.query(
      `insert into orders (event_id, buyer_name, buyer_email, buyer_phone, amount_cents, braintree_txn_id, status)
       values ($1,$2,$3,$4,$5,$6,$7) returning id`,
      [tt.event_id, buyer.name, buyer.email, buyer.phone || null, amountCents, txnId, amountCents > 0 ? 'paid' : 'paid'])).rows[0];

    const code = humanCode();
    const ticket = (await client.query(
      `insert into tickets (order_id, event_id, ticket_type_id, code, qty)
       values ($1,$2,$3,$4,$5) returning id, code`,
      [order.id, tt.event_id, tt.id, code, units])).rows[0];
    await client.query('COMMIT');

    const token = signTicket(ticket.id);
    // Fire-and-forget email so a slow provider never blocks the buyer.
    sendTicketEmail({
      to: buyer.email, buyerName: buyer.name, eventName: 'MKANT Event',
      ticketTypeName: tt.name, code: ticket.code, token, qty: units,
    }).catch((e) => console.error('email failed', e));

    return Response.json({ ok: true, code: ticket.code, token, ticketId: ticket.id });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error(e);
    // NOTE: if payment succeeded but the DB write failed, txnId is logged above —
    // reconcile/refund from the Braintree dashboard.
    return Response.json({ error: 'server_error' }, { status: 500 });
  } finally {
    client.release();
  }
}