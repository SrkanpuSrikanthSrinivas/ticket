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
  const first = (buyer.first || '').trim();
  const last = (buyer.last || '').trim();
  const name = `${first} ${last}`.trim() || (buyer.name || '').trim();
  const email = (buyer.email || '').trim();
  const mobile = (buyer.mobile || buyer.phone || '').trim();
  const country = buyer.country || null;
  const zip = (buyer.zip || '').trim() || null;
  if (!ticketTypeId || !first || !last || !email)
    return Response.json({ error: 'missing_fields', message: 'First name, last name and email are required.' }, { status: 400 });

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
    await sql`insert into orders (id, event_id, buyer_name, buyer_email, buyer_phone, buyer_country, buyer_zip, amount_cents, braintree_txn_id, status)
              values (${orderId}, ${tt.event_id}, ${name}, ${email}, ${mobile || null}, ${country}, ${zip}, ${amountCents}, ${txnId}, 'paid')`;
    await sql`insert into tickets (id, order_id, event_id, ticket_type_id, code, qty)
              values (${ticketId}, ${orderId}, ${tt.event_id}, ${tt.id}, ${code}, ${units})`;
  } catch (e) {
    console.error('order write failed (txn ' + txnId + '):', e);
    return Response.json({ error: 'server_error', message: 'Payment captured but ticket save failed — keep txn ' + txnId }, { status: 500 });
  }

  const token = signTicket(ticketId);
  const baseUrl = new URL(req.url).origin;
  let emailRes = { ok: false };
  try {
    emailRes = await sendTicketEmail({
      to: email, buyerName: name,
      event: { name: tt.event_name, event_date: tt.event_date, venue: tt.venue,
               email_subject: tt.email_subject, email_body: tt.email_body },
      ticketTypeName: tt.name, code, token, qty: units, baseUrl,
    });
  } catch (e) { emailRes = { ok: false, error: String(e?.message || e) }; }
  if (!emailRes.ok) console.error('ticket email not sent:', emailRes.status, emailRes.body || emailRes.error || emailRes.reason);

  return Response.json({ ok: true, code, token, ticketId,
    emailed: !!emailRes.ok,
    email_error: emailRes.ok ? null : (emailRes.body || emailRes.error || emailRes.reason || `status ${emailRes.status || '?'}`) });
}
