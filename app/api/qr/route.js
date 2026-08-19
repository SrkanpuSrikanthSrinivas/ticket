export const dynamic = 'force-dynamic';

import QRCode from 'qrcode';

// Returns a PNG QR for a ticket token, so emailed tickets show a scannable image.
export async function GET(req) {
  const token = new URL(req.url).searchParams.get('token');
  if (!token) return new Response('missing token', { status: 400 });
  try {
    const buf = await QRCode.toBuffer(token, { width: 320, margin: 1, errorCorrectionLevel: 'M' });
    return new Response(buf, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000, immutable' } });
  } catch (e) { return new Response('qr error', { status: 500 }); }
}
