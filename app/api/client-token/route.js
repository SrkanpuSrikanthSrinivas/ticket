export const dynamic = 'force-dynamic';

import { gateway } from '../../../lib/braintree';

// Braintree Drop-in on the registration page fetches this to render the card form.
export async function GET(req) {
  try {
    const { clientToken } = await gateway.clientToken.generate({});
    return Response.json({ clientToken }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('client_token_failed:', e?.message || e);
    const debug = new URL(req.url).searchParams.get('debug');
    const body = { error: 'client_token_failed' };
    if (debug && debug === process.env.ADMIN_PIN) body.detail = String(e?.message || e); // Braintree creds check
    return Response.json(body, { status: 500 });
  }
}
