const clean = (v) => (v || '').trim().replace(/^["']|["']$/g, '');
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function buildTicketEmail({ buyerName, event, token, code, items = [], baseUrl }) {
  const vars = { name: buyerName || '', event: event?.name || '', date: event?.event_date || '', venue: event?.venue || '' };
  const fill = (t) => String(t || '').replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`));
  const subject = fill(event?.email_subject || 'Your {event} tickets');
  const bodyText = fill(event?.email_body ||
    'Namaskara {name}, your registration for {event} is confirmed. Show the single QR code below at the gate — it admits your whole group. Food coupons are issued at check-in.');
  const paragraphs = bodyText.split(/\n{2,}/).map((p) => `<p style="margin:0 0 12px;color:#333;line-height:1.55;white-space:pre-line">${esc(p)}</p>`).join('');
  const base = baseUrl || process.env.PUBLIC_BASE_URL || '';
  const itemRows = items.map((it) => `<div style="display:flex;justify-content:space-between;padding:4px 0;color:#333"><span>${esc(it.typeName)}</span><span>&times; ${it.qty}</span></div>`).join('');

  const html = `<div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:auto;padding:8px">
    <h2 style="color:#3B1E54;margin:0 0 14px">${esc(event?.name || 'Event')}</h2>
    ${(event?.event_date || event?.venue) ? `<p style="margin:0 0 12px;color:#6b6472">${esc([event?.event_date, event?.venue].filter(Boolean).join(' · '))}</p>` : ''}
    ${paragraphs}
    <div style="border:1px solid #E7E0D6;border-radius:16px;padding:20px;text-align:center;margin-top:8px">
      ${itemRows ? `<div style="text-align:left;margin-bottom:8px">${itemRows}</div><hr style="border:none;border-top:1px solid #eee"/>` : ''}
      <img src="${base}/api/qr?token=${encodeURIComponent(token)}" alt="Entry QR" width="220" height="220" style="width:220px;height:220px;margin:14px auto;display:block"/>
      <div style="font-family:monospace;font-size:15px;color:#3B1E54">${esc(code)}</div>
      <div style="color:#888;font-size:12px;margin-top:6px">One code for the whole group</div>
    </div>
  </div>`;
  return { subject, html };
}

export async function sendTicketEmail(args) {
  const { subject, html } = buildTicketEmail(args);
  const to = args.to;
  const resendKey = clean(process.env.RESEND_API_KEY);
  const sgKey = clean(process.env.SENDGRID_API_KEY);
  const provider = process.env.EMAIL_PROVIDER || (resendKey ? 'resend' : (sgKey ? 'sendgrid' : 'none'));
  const name = args.event?.name || 'Tickets';

  if (provider === 'resend' && resendKey) {
    let addr = clean(process.env.TICKET_FROM_EMAIL) || 'onboarding@resend.dev';
    const freeMail = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'aol.com', 'live.com'];
    if (freeMail.includes((addr.split('@')[1] || '').toLowerCase())) addr = 'onboarding@resend.dev';
    const from = addr.includes('<') ? addr : `${name} <${addr}>`;
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, html }),
    });
    const body = await res.text().catch(() => '');
    if (!res.ok) console.error('Resend failed', res.status, body);
    return { ok: res.ok, status: res.status, body, provider: 'resend', from };
  }
  if (provider === 'sendgrid' && sgKey) {
    const from = clean(process.env.TICKET_FROM_EMAIL) || 'tickets@mallige.org';
    const host = process.env.SENDGRID_REGION === 'eu' ? 'https://api.eu.sendgrid.com' : 'https://api.sendgrid.com';
    const res = await fetch(`${host}/v3/mail/send`, {
      method: 'POST', headers: { Authorization: `Bearer ${sgKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ personalizations: [{ to: [{ email: to }] }], from: { email: from, name }, subject, content: [{ type: 'text/html', value: html }] }),
    });
    const body = await res.text().catch(() => '');
    if (!res.ok) console.error('SendGrid failed', res.status, body);
    return { ok: res.ok, status: res.status, body, provider: 'sendgrid', from };
  }
  console.warn('No email provider configured');
  return { ok: false, skipped: true, provider: 'none' };
}
