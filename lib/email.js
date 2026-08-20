const clean = (v) => (v || '').trim().replace(/^["']|["']$/g, '');
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function buildTicketEmail({ buyerName, event, token, code, items = [], baseUrl }) {
  const vars = { name: buyerName || '', event: event?.name || '', date: event?.event_date || '', venue: event?.venue || '' };
  const fill = (t) => String(t || '').replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`));
  const subject = fill(event?.email_subject || 'Your {event} tickets');
  const bodyText = fill(event?.email_body ||
    'Namaskara {name}, your registration is confirmed. Show the single QR code below at the gate — it admits your whole group. Food coupons are issued at check-in.');
  const paragraphs = bodyText.split(/\n{2,}/).map((p) => `<p style="margin:0 0 12px;color:#3a3340;line-height:1.6;font-size:15px;white-space:pre-line">${esc(p)}</p>`).join('');
  const base = baseUrl || process.env.PUBLIC_BASE_URL || '';
  const qrUrl = `${base}/api/qr?token=${encodeURIComponent(token)}`;
  const dateVenue = [event?.event_date, event?.venue].filter(Boolean).join(' · ');
  const entry = items.filter((it) => (it.category || 'entry') !== 'food');
  const food = items.filter((it) => (it.category || 'entry') === 'food');
  const totalGuests = entry.reduce((s, it) => s + (it.qty || 0), 0);
  const rowsFor = (list) => list.map((it) => `<tr>
      <td style="padding:7px 0;color:#1A1523;font-size:15px">${esc(it.typeName)}</td>
      <td style="padding:7px 0;text-align:right;color:#3B1E54;font-weight:700;font-size:15px">&times; ${it.qty}</td></tr>`).join('');
  const sectionHead = (t) => `<tr><td colspan="2" style="padding:12px 0 4px;font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:#8b8494;font-weight:800">${t}</td></tr>`;
  const itemRows = (entry.length ? sectionHead('Event Entry') + rowsFor(entry) : '') + (food.length ? sectionHead('Food Coupons') + rowsFor(food) : '');

  const html = `<div style="background:#FAF7F2;padding:26px 12px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 10px 40px rgba(59,30,84,.14)">
    <div style="background:linear-gradient(135deg,#3B1E54,#4E2A6E);padding:28px 30px">
      <div style="color:#F0A500;font-size:11px;letter-spacing:2.5px;text-transform:uppercase;font-weight:800">Registration confirmed</div>
      <div style="color:#ffffff;font-size:25px;font-weight:800;margin-top:8px;line-height:1.15">${esc(event?.name || 'Event')}</div>
      ${dateVenue ? `<div style="color:#e9dcf3;font-size:14px;margin-top:8px">${esc(dateVenue)}</div>` : ''}
    </div>

    <div style="padding:26px 30px">
      ${paragraphs}

      <div style="border:1px solid #E7E0D6;border-radius:14px;padding:18px;margin-top:18px;background:#fdfbf7">
        <div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#8b8494;font-weight:800;margin-bottom:10px">Order summary</div>
        <div style="font-weight:800;font-size:17px;color:#1A1523;margin-bottom:6px">${esc(buyerName || '')}</div>
        <table style="width:100%;border-collapse:collapse">${itemRows}</table>
        <div style="border-top:1px solid #ece6dd;margin-top:8px;padding-top:12px">
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="color:#6b6472;font-size:13px">Total guests</td><td style="text-align:right;color:#1A1523;font-weight:700;font-size:13px">${totalGuests}</td></tr>
            <tr><td style="color:#6b6472;font-size:13px;padding-top:4px">Order code</td><td style="text-align:right;font-family:monospace;color:#3B1E54;font-weight:700;font-size:13px;padding-top:4px">${esc(code)}</td></tr>
          </table>
        </div>
      </div>

      <div style="text-align:center;margin-top:22px">
        <div style="display:inline-block;background:#ffffff;border:2px solid #3B1E54;border-radius:18px;padding:16px">
          <img src="${qrUrl}" alt="Entry QR" width="210" height="210" style="display:block;width:210px;height:210px"/>
        </div>
        <div style="color:#6b6472;font-size:13px;margin-top:12px;line-height:1.5">Show this <b style="color:#3B1E54">one QR code</b> at entry.<br/>It checks in your whole group and issues your food coupons.</div>
      </div>
    </div>

    ${event?.details ? `<div style="background:#FAF7F2;padding:22px 30px;border-top:1px solid #E7E0D6">
      <div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#8b8494;font-weight:800;margin-bottom:8px">Event details</div>
      <div style="color:#443c50;font-size:14px;line-height:1.65;white-space:pre-line">${esc(event.details)}</div></div>` : ''}

    <div style="padding:16px 30px;text-align:center;color:#a49caf;font-size:12px">${esc(event?.name || '')}</div>
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
