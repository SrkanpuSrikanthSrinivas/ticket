import crypto from 'crypto';

// A ticket's QR encodes `ticketId.signature`. The signature is an HMAC so a
// forged/edited code can't pass verification even though the id is visible.
// The plaintext human code (e.g. MKANT-8F3K2Q) still works for manual lookup.
const SECRET = () => process.env.TICKET_SECRET || 'dev-secret-change-me';

export function signTicket(ticketId) {
  const sig = crypto.createHmac('sha256', SECRET()).update(ticketId).digest('base64url').slice(0, 20);
  return `${ticketId}.${sig}`;
}

export function verifyTicket(token) {
  const [id, sig] = String(token || '').split('.');
  if (!id || !sig) return null;
  const expected = crypto.createHmac('sha256', SECRET()).update(id).digest('base64url').slice(0, 20);
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)) ? id : null;
  } catch { return null; }
}

export function humanCode() {
  const a = 'ACDEFGHJKLMNPQRSTUVWXYZ2345679';
  let s = '';
  for (let i = 0; i < 6; i++) s += a[Math.floor(Math.random() * a.length)];
  return 'MKANT-' + s;
}
