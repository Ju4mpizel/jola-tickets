import { getSupabaseAdmin } from '@/server/supabaseAdmin';
import { errorResponse, json } from '@/server/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/v1/seats → [{ id, row, number, price, vip, status: 'available' | 'taken' }] */
export async function GET() {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('public_seat_map')
      .select('id, row_label, seat_number, is_vip, price, status')
      .order('id');
    if (error) throw error;
    return json(
      data.map((s) => ({
        id: s.id,
        row: s.row_label.trim(),
        number: s.seat_number,
        price: Number(s.price),
        vip: s.is_vip,
        status: s.status,
      })),
    );
  } catch (err) {
    return errorResponse(err);
  }
}
