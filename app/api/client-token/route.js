export const dynamic = 'force-dynamic';

import { gateway } from '../../../lib/braintree';

// Braintree Drop-in on the registration page fetches this to render the card form.
export async function GET() {
  try {
    const { clientToken } = await gateway.clientToken.generate({});
    return Response.json({ clientToken });
  } catch (e) {
    return Response.json({ error: 'client_token_failed' }, { status: 500 });
  }
}
