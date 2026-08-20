export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

import { sql } from '../../../lib/db';

export async function POST(req) {
  const { couponId, redeemAll, orderId, staffPin, staff = 'stall' } = await req.json().catch(() => ({}));
  if (staffPin !== process.env.STAFF_PIN) return Response.json({ error: 'unauthorized' }, { status: 401 });

  if (redeemAll && orderId) {
    const rows = await sql`update coupons set redeemed=true, redeemed_at=now(), redeemed_by=${staff}
      where ticket_id in (select id from tickets where order_id=${orderId}) and redeemed=false returning id`;
    return Response.json({ ok: true, redeemed: rows.length });
  }
  if (!couponId) return Response.json({ error: 'missing_coupon' }, { status: 400 });
  const rows = await sql`update coupons set redeemed=true, redeemed_at=now(), redeemed_by=${staff}
    where id=${couponId} and redeemed=false returning id`;
  if (rows.length === 0) return Response.json({ ok: false, reason: 'already_redeemed' });
  return Response.json({ ok: true, redeemed: 1 });
}
