// Sends the ticket confirmation via SendGrid. Subject and body come from the
// event's editable template (set in /admin) with {placeholders} filled in.
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export async function sendTicketEmail({ to, buyerName, event, ticketTypeName, code, token, qty, baseUrl }) {
  const vars = {
    name: buyerName || '', event: event?.name || '', ticket_type: ticketTypeName || '',
    code: code || '', qty: String(qty || 1), date: event?.event_date || '', venue: event?.venue || '',
  };
  const fill = (t) => String(t || '').replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`));

  const subject = fill(event?.email_subject || 'Your {event} ticket');
  const bodyText = fill(event?.email_body ||
    'Namaskara {name}, your ticket for {event} is confirmed. Show the QR code below at the gate. Food coupons are issued at check-in.');
  const paragraphs = bodyText.split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px;color:#333;line-height:1.55;white-space:pre-line">${escapeHtml(p)}</p>`).join('');

  const qrUrl = `${baseUrl || process.env.PUBLIC_BASE_URL || ''}/api/qr?token=${encodeURIComponent(token)}`;
  const html = `<div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:auto;padding:8px">
    <h2 style="color:#3B1E54;margin:0 0 14px">${escapeHtml(event?.name || 'Event')}</h2>
    ${paragraphs}
    <div style="border:1px solid #E7E0D6;border-radius:16px;padding:20px;text-align:center;margin-top:8px">
      <div style="font-weight:700;color:#7a5400;background:#F0A500;display:inline-block;padding:4px 12px;border-radius:999px">${escapeHtml(ticketTypeName || '')}${qty > 1 ? ` &times; ${qty}` : ''}</div>
      <img src="${qrUrl}" alt="Ticket QR" width="220" height="220" style="width:220px;height:220px;margin:16px auto;display:block"/>
      <div style="font-family:monospace;font-size:15px;color:#3B1E54">${escapeHtml(code)}</div>
    </div>
  </div>`;

  const clean = (v) => (v || '').trim().replace(/^["']|["']$/g, '');
  const key = clean(process.env.SENDGRID_API_KEY);
  const from = clean(process.env.TICKET_FROM_EMAIL) || 'tickets@mallige.org';
  const host = process.env.SENDGRID_REGION === 'eu' ? 'https://api.eu.sendgrid.com' : 'https://api.sendgrid.com';
  if (!key) { console.warn('No SENDGRID_API_KEY set — email skipped'); return { ok: false, skipped: true, reason: 'SENDGRID_API_KEY not set' }; }
  const res = await fetch(`${host}/v3/mail/send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: from, name: event?.name || 'Tickets' },
      subject,
      content: [{ type: 'text/html', value: html }],
    }),
  });
  const body = await res.text().catch(() => '');
  if (!res.ok) console.error('SendGrid failed', res.status, body);
  return { ok: res.ok, status: res.status, body, from };
}
