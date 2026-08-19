export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

import { sql } from '../../../../lib/db';
import { sendTicketEmail } from '../../../../lib/email';

export async function POST(req) {
  const { adminPin, to, subject, body } = await req.json().catch(() => ({}));
  if (adminPin !== process.env.ADMIN_PIN) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const key = process.env.SENDGRID_API_KEY || '';
  const from = process.env.TICKET_FROM_EMAIL || 'tickets@mallige.org';
  const out = { key_set: !!key, key_starts_with_SG: key.startsWith('SG.'), from_email: from, to: to || null };

  if (!key) { out.result = 'FAIL — SENDGRID_API_KEY is not set in this deployment. Add it in Vercel (Production) and redeploy.'; return Response.json(out); }
  if (!to) { out.result = 'Enter an email address to send a test.'; return Response.json(out); }

  const ev = (await sql`select name, event_date, venue, email_subject, email_body from events order by created_at desc limit 1`)[0] || {};
  const event = { name: ev.name || 'Event', event_date: ev.event_date, venue: ev.venue,
    email_subject: subject || ev.email_subject, email_body: body || ev.email_body };

  try {
    const r = await sendTicketEmail({
      to, buyerName: 'Test Guest', event, ticketTypeName: 'Adult',
      code: 'TIX-TEST', token: 'test.token', qty: 1, baseUrl: new URL(req.url).origin,
    });
    out.sendgrid_status = r?.status ?? null;
    out.sendgrid_body = r?.body || (r?.status === 202 ? '(202 Accepted — empty body is normal)' : '');
    out.result = r?.status === 202 ? `SUCCESS — SendGrid accepted the email to ${to}. Check inbox/spam.`
      : r?.status === 401 ? 'FAIL 401 — API key invalid or missing "Mail Send" permission.'
      : r?.status === 403 ? `FAIL 403 — from-address "${from}" is not a Verified Sender / authenticated domain in SendGrid.`
      : `FAIL ${r?.status ?? '?'} — see sendgrid_body.`;
  } catch (e) { out.result = 'ERROR: ' + String(e?.message || e); }

  return Response.json(out, { headers: { 'Cache-Control': 'no-store' } });
}
