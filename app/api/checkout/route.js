export const dynamic = 'force-dynamic';

import { randomUUID } from 'crypto';
import { sql } from '../../../lib/db';
import { gateway } from '../../../lib/braintree';
import { signTicket, humanCode } from '../../../lib/token';
import { sendTicketEmail } from '../../../lib/email';

// Public purchase endpoint — supports a CART: any mix of ticket types in one order.
//
// PCI: never sees card data — Braintree Drop-in tokenizes on the buyer's device and
// returns a one-time nonce; we store only the transaction id. (PCI SAQ A.)
export async function POST(req) {
  const body = await req.json().catch(() => null);
  if (!body) return Response.json({ error: 'bad_request' }, { status: 400 });

  const { items = [], buyer = {}, paymentMethodNonce } = body;
  const cart = (items || [])
    .map((i) => ({ ticketTypeId: i.ticketTypeId, qty: Math.max(0, parseInt(i.qty, 10) || 0) }))
    .filter((i) => i.ticketTypeId && i.qty > 0);
  if (!cart.length) return Response.json({ error: 'empty_cart', message: 'Select at least one ticket.' }, { status: 400 });

  const first = (buyer.first || '').trim();
  const last = (buyer.last || '').trim();
  const name = `${first} ${last}`.trim();
  const email = (buyer.email || '').trim();
  const mobile = (buyer.mobile || '').trim();
  const country = buyer.country || null;
  const zip = (buyer.zip || '').trim() || null;
  if (!first || !last || !email)
    return Response.json({ error: 'missing_fields', message: 'First name, last name and email are required.' }, { status: 400 });

  // Load each tier + event, validate + capacity + total.
  const tierMap = {};
  let ev0 = null;
  for (const c of cart) {
    const t = (await sql`
      select tt.id, tt.event_id, tt.name, tt.price_cents, tt.max_qty, tt.is_comp, tt.active,
             e.name as event_name, e.event_date, e.venue, e.email_subject, e.email_body
      from ticket_types tt join events e on e.id = tt.event_id
      where tt.id=${c.ticketTypeId} and tt.active=true`)[0];
    if (!t) return Response.json({ error: 'ticket_unavailable', message: 'A selected ticket is no longer available.' }, { status: 404 });
    if (t.max_qty != null) {
      const sold = (await sql`select coalesce(sum(qty),0)::int s from tickets where ticket_type_id=${t.id} and status <> 'void'`)[0].s;
      if (sold + c.qty > t.max_qty) return Response.json({ error: 'sold_out', message: `${t.name} is sold out.` }, { status: 409 });
    }
    tierMap[c.ticketTypeId] = t; ev0 = t;
  }
  const eventId = ev0.event_id;
  const amountCents = cart.reduce((sum, c) => { const t = tierMap[c.ticketTypeId]; return sum + (t.is_comp ? 0 : t.price_cents * c.qty); }, 0);

  let txnId = null;
  if (amountCents > 0) {
    if (!paymentMethodNonce) return Response.json({ error: 'payment_required' }, { status: 400 });
    const result = await gateway.transaction.sale({ amount: (amountCents / 100).toFixed(2), paymentMethodNonce, options: { submitForSettlement: true } });
    if (!result.success) return Response.json({ error: 'payment_declined', message: result.message }, { status: 402 });
    txnId = result.transaction.id;
  }

  const orderId = randomUUID();
  try {
    await sql`insert into orders (id, event_id, buyer_name, buyer_email, buyer_phone, buyer_country, buyer_zip, amount_cents, braintree_txn_id, status)
              values (${orderId}, ${eventId}, ${name}, ${email}, ${mobile || null}, ${country}, ${zip}, ${amountCents}, ${txnId}, 'paid')`;
  } catch (e) {
    console.error('order insert failed:', e);
    return Response.json({ error: 'server_error', message: 'Payment captured but order save failed' + (txnId ? ` (txn ${txnId})` : '') }, { status: 500 });
  }

  const tickets = [];
  for (const c of cart) {
    const t = tierMap[c.ticketTypeId];
    const tId = randomUUID(); const code = humanCode();
    try {
      await sql`insert into tickets (id, order_id, event_id, ticket_type_id, code, qty) values (${tId}, ${orderId}, ${eventId}, ${t.id}, ${code}, ${c.qty})`;
      tickets.push({ ticketId: tId, code, token: signTicket(tId), typeName: t.name, qty: c.qty });
    } catch (e) { console.error('ticket insert failed:', e); }
  }

  const baseUrl = new URL(req.url).origin;
  let emailRes = { ok: false };
  try {
    emailRes = await sendTicketEmail({
      to: email, buyerName: name,
      event: { name: ev0.event_name, event_date: ev0.event_date, venue: ev0.venue, email_subject: ev0.email_subject, email_body: ev0.email_body },
      tickets, baseUrl,
    });
  } catch (e) { emailRes = { ok: false, error: String(e?.message || e) }; }
  if (!emailRes.ok) console.error('ticket email not sent:', emailRes.status, emailRes.body || emailRes.error);

  return Response.json({ ok: true, orderId, tickets,
    emailed: !!emailRes.ok, email_error: emailRes.ok ? null : (emailRes.body || emailRes.error || emailRes.reason || `status ${emailRes.status || '?'}`) });
}
