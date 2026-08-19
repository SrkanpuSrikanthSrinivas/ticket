export const dynamic = 'force-dynamic';

import { randomUUID } from 'crypto';
import { sql } from '../../../lib/db';
import { gateway } from '../../../lib/braintree';
import { signTicket, humanCode } from '../../../lib/token';
import { sendTicketEmail } from '../../../lib/email';

// Public purchase endpoint.
//
// PCI: this endpoint NEVER sees card data. Braintree's Drop-in collects the card
// in its own hosted iframe on the buyer's device and returns a one-time
// `paymentMethodNonce`. We forward only that nonce and store only the resulting
// transaction id — no PAN, CVV, or expiry ever touches this server or DB.
// That keeps the merchant in PCI SAQ A.
export async function POST(req) {
  const body = await req.json().catch(() => null);
  if (!body) return Response.json({ error: 'bad_request' }, { status: 400 });

  const { ticketTypeId, qty = 1, buyer = {}, paymentMethodNonce } = body;
  const units = Math.max(1, parseInt(qty, 10) || 1);
  if (!ticketTypeId || !buyer.name || !buyer.email)
    return Response.json({ error: 'missing_fields' }, { status: 400 });

  const tt = (await sql`
    select tt.id, tt.event_id, tt.name, tt.price_cents, tt.max_qty, tt.is_comp,
           e.name as event_name, e.event_date, e.venue, e.email_subject, e.email_body
    from ticket_types tt join events e on e.id = tt.event_id
    where tt.id=${ticketTypeId} and tt.active=true`)[0];
  if (!tt) return Response.json({ error: 'ticket_type_unavailable' }, { status: 404 });

  if (tt.max_qty != null) {
    const sold = (await sql`select coalesce(sum(qty),0)::int s from tickets
                            where ticket_type_id=${ticketTypeId} and status <> 'void'`)[0].s;
    if (sold + units > tt.max_qty)
      return Response.json({ error: 'sold_out', remaining: Math.max(0, tt.max_qty - sold) }, { status: 409 });
  }

  const amountCents = tt.is_comp ? 0 : tt.price_cents * units;
  let txnId = null;
  if (amountCents > 0) {
    if (!paymentMethodNonce) return Response.json({ error: 'payment_required' }, { status: 400 });
    const result = await gateway.transaction.sale({
      amount: (amountCents / 100).toFixed(2),
      paymentMethodNonce,
      options: { submitForSettlement: true },
    });
    if (!result.success) return Response.json({ error: 'payment_declined', message: result.message }, { status: 402 });
    txnId = result.transaction.id;
  }

  const orderId = randomUUID();
  const ticketId = randomUUID();
  const code = humanCode();
  try {
    await sql`insert into orders (id, event_id, buyer_name, buyer_email, buyer_phone, amount_cents, braintree_txn_id, status)
              values (${orderId}, ${tt.event_id}, ${buyer.name}, ${buyer.email}, ${buyer.phone || null}, ${amountCents}, ${txnId}, 'paid')`;
    await sql`insert into tickets (id, order_id, event_id, ticket_type_id, code, qty)
              values (${ticketId}, ${orderId}, ${tt.event_id}, ${tt.id}, ${code}, ${units})`;
  } catch (e) {
    console.error('order write failed (txn ' + txnId + '):', e);
    return Response.json({ error: 'server_error', message: 'Payment captured but ticket save failed — keep txn ' + txnId }, { status: 500 });
  }

  const token = signTicket(ticketId);
  const baseUrl = new URL(req.url).origin;
  sendTicketEmail({
    to: buyer.email, buyerName: buyer.name,
    event: { name: tt.event_name, event_date: tt.event_date, venue: tt.venue,
             email_subject: tt.email_subject, email_body: tt.email_body },
    ticketTypeName: tt.name, code, token, qty: units, baseUrl,
  }).catch((e) => console.error('email failed', e));

  return Response.json({ ok: true, code, token, ticketId });
}
