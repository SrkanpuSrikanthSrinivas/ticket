export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const clean = (v) => (v || '').trim().replace(/^["']|["']$/g, '');

async function trySend(host, key, from, to) {
  try {
    const res = await fetch(`${host}/v3/mail/send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: from, name: 'Ticketing test' },
        subject: 'Ticketing test email',
        content: [{ type: 'text/plain', value: 'If you received this, SendGrid is wired up correctly.' }],
      }),
    });
    return { status: res.status, body: (await res.text().catch(() => '')) };
  } catch (e) { return { status: 0, body: String(e?.message || e) }; }
}

export async function POST(req) {
  const { adminPin, to } = await req.json().catch(() => ({}));
  if (adminPin !== process.env.ADMIN_PIN) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const raw = process.env.SENDGRID_API_KEY || '';
  const key = clean(raw);
  const from = clean(process.env.TICKET_FROM_EMAIL) || 'tickets@mallige.org';
  const out = {
    from_email: from,
    key_length: key.length,
    key_preview: key ? `${key.slice(0, 6)}…${key.slice(-4)}` : '(empty)',
    key_starts_with_SG: key.startsWith('SG.'),
    had_surrounding_quotes: /^["'].*["']$/.test(raw.trim()),
    had_whitespace: raw !== raw.trim(),
    region_env: process.env.SENDGRID_REGION || '(unset = US)',
  };
  if (!key) { out.result = 'FAIL — SENDGRID_API_KEY is not set in this deployment. Set it in Vercel (Production) and redeploy.'; return Response.json(out); }
  if (!to) { out.result = 'Enter an email address to send a test.'; return Response.json(out); }

  out.us = await trySend('https://api.sendgrid.com', key, from, to);
  if (out.us.status !== 202) out.eu = await trySend('https://api.eu.sendgrid.com', key, from, to);

  if (out.us.status === 202) out.result = `SUCCESS (US region) — SendGrid accepted the email to ${to}. Check inbox/spam.`;
  else if (out.eu && out.eu.status === 202) out.result = 'Your SendGrid account is EU-region. FIX: set SENDGRID_REGION=eu in Vercel (Production) and redeploy.';
  else if (out.us.status === 401) out.result = 'FAIL 401 (key rejected). ' + (
    out.had_surrounding_quotes ? 'Your key value has surrounding quotes — remove them in Vercel and redeploy.'
    : out.had_whitespace ? 'Your key value has stray spaces/newlines — re-paste it cleanly in Vercel and redeploy.'
    : !out.key_starts_with_SG ? 'The value does NOT start with "SG." — you likely pasted the key name/ID, not the secret. Create a new API key and copy the full secret (shown once).'
    : 'The key is wrong or was revoked. Create a fresh Full-Access key in SendGrid and paste it (no quotes) into Vercel, then redeploy.');
  else if (out.us.status === 403) out.result = `FAIL 403 — from-address "${from}" is not a Verified Sender / authenticated domain in SendGrid.`;
  else out.result = `FAIL ${out.us.status} — see us.body.`;

  return Response.json(out, { headers: { 'Cache-Control': 'no-store' } });
}
