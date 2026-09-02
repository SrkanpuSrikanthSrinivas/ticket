export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

import { sql } from '../../../../lib/db';
import { sendTicketEmail } from '../../../../lib/email';

export async function POST(req) {
  const { adminPin, to, subject, body } = await req.json().catch(() => ({}));
  if (adminPin !== process.env.ADMIN_PIN) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const brevo = !!(process.env.BREVO_API_KEY || '').trim();
  const resend = !!(process.env.RESEND_API_KEY || '').trim();
  const sendgrid = !!(process.env.SENDGRID_API_KEY || '').trim();
  const provider = process.env.EMAIL_PROVIDER || (brevo ? 'brevo' : (resend ? 'resend' : (sendgrid ? 'sendgrid' : 'none')));
  const mask = (v) => { v = (v || '').trim(); return v ? `${v.slice(0, 6)}…(${v.length} chars)` : '(empty)'; };
  const out = {
    provider,
    brevo_key_set: brevo, resend_key_set: resend, sendgrid_key_set: sendgrid,
    brevo_key_preview: mask(process.env.BREVO_API_KEY),
    EMAIL_PROVIDER: process.env.EMAIL_PROVIDER || '(unset)',
    TICKET_FROM_EMAIL: process.env.TICKET_FROM_EMAIL || '(unset)',
    to: to || null,
  };

  if (provider === 'none') { out.result = 'FAIL — no email provider configured. Set BREVO_API_KEY (or RESEND/SENDGRID) in Vercel and redeploy.'; return Response.json(out); }
  if (!to) { out.result = 'Enter an email address to send a test.'; return Response.json(out); }

  const ev = (await sql`select name, event_date, venue, email_subject, email_body from events order by created_at desc, id desc limit 1`)[0] || {};
  const event = { name: ev.name || 'Event', event_date: ev.event_date, venue: ev.venue, email_subject: subject || ev.email_subject, email_body: body || ev.email_body };

  const r = await sendTicketEmail({ to, buyerName: 'Test Guest', event, tickets: [{ typeName: 'Adult', code: 'TIX-TEST', token: 'test.token', qty: 1 }], baseUrl: new URL(req.url).origin });
  out.from = r.from; out.status = r.status; out.provider_body = r.body;
  const ok = r.provider === 'resend' ? r.ok : r.status === 202;
  let hint = r.body || 'see logs';
  if (r.provider === 'resend' && !ok) {
    if (/domain is not verified/i.test(r.body || '')) hint = 'The from-address domain is not verified in Resend. For testing, unset TICKET_FROM_EMAIL so it uses onboarding@resend.dev; for real buyers, verify mallige.org at resend.com/domains and set TICKET_FROM_EMAIL to an address on it.';
    else if (/your own email|testing emails|can only send/i.test(r.body || '')) hint = 'onboarding@resend.dev only delivers to the email you registered with Resend. Send the test to THAT address, or verify a domain to email anyone.';
  }
  out.effective_from = r.from;
  out.result = ok ? `SUCCESS via ${r.provider} — sent to ${to} from ${r.from}. Check inbox/spam.`
    : `FAIL via ${r.provider} (status ${r.status}) — ${hint}`;
  return Response.json(out, { headers: { 'Cache-Control': 'no-store' } });
}
