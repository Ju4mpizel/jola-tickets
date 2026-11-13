import { getSupabaseAdmin } from '@/server/supabaseAdmin';
import { apiError, errorResponse, json } from '@/server/errors';
import { parseHold } from '@/server/validate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/holds  { seat_ids, buyer: { name, phone, email } }
 * → { order_id, order_code, access_token, total, expires_at }
 * hold_seats retiene las sillas de forma atómica y calcula el total con los precios de la base.
 */
export async function POST(request) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      throw apiError('INVALID_DATA');
    }
    const { seat_ids, buyer } = parseHold(body);

    const { data, error } = await getSupabaseAdmin().rpc('hold_seats', {
      p_seat_ids: seat_ids,
      p_name: buyer.name,
      p_phone: buyer.phone,
      p_email: buyer.email,
    });
    if (error) throw error; // error.message = 'SEAT_TAKEN' → 409
    const row = data?.[0];
    if (!row) throw new Error('hold_seats no devolvió la orden');

    return json({
      order_id: row.order_id,
      order_code: row.order_code,
      access_token: row.access_token,
      total: Number(row.total_amount),
      expires_at: new Date(row.expires_at).toISOString(),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
