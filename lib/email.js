import QRCode from 'qrcode';

// Provider-agnostic ticket email. Shown with Resend's REST API; to swap to
// SendGrid/SES/Nodemailer, only this function changes.
export async function sendTicketEmail({ to, buyerName, eventName, ticketTypeName, code, token, qty }) {
  const qrDataUrl = await QRCode.toDataURL(token, { margin: 1, width: 320 });

  const html = `
  <div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:auto">
    <h2 style="color:#3B1E54;margin:0 0 4px">${eventName}</h2>
    <p style="color:#555">Namaskara ${buyerName}, your ticket is confirmed.</p>
    <div style="border:1px solid #E7E0D6;border-radius:16px;padding:20px;text-align:center">
      <div style="font-weight:700;color:#7a5400;background:#F0A500;display:inline-block;padding:4px 12px;border-radius:999px">${ticketTypeName}${qty > 1 ? ` &times; ${qty}` : ''}</div>
      <img src="${qrDataUrl}" alt="Ticket QR" style="width:220px;height:220px;margin:16px auto;display:block"/>
      <div style="font-family:monospace;font-size:15px;color:#3B1E54">${code}</div>
      <p style="color:#888;font-size:12px">Show this QR at the gate. Food coupons are issued at check-in.</p>
    </div>
  </div>`;

  if (!process.env.RESEND_API_KEY) { console.warn('No email provider configured; skipping send.'); return; }

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.TICKET_FROM, to, subject: `Your ${eventName} ticket`, html }),
  });
}
