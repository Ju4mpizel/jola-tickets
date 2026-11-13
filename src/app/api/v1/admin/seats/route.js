import { getSupabaseAdmin } from '@/server/supabaseAdmin';
import { requireAdmin } from '@/server/auth';
import { errorResponse, json } from '@/server/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/admin/seats → [{ id, row, number, vip, status, order_code? }]
 * status = available | held | pending_review | sold | blocked. Una retención vencida se
 * devuelve como available (igual que el mapa público). order_code solo si la silla tiene orden.
 */
export async function GET(request) {
  try {
    await requireAdmin(request);
    const { data, error } = await getSupabaseAdmin()
      .from('seats')
      .select('id, row_label, seat_number, is_vip, status, held_until, order:orders!seats_order_fk(order_code)')
      .order('id');
    if (error) throw error;

    const now = Date.now();
    return json(
      data.map((s) => {
        const status = s.status === 'held' && (!s.held_until || new Date(s.held_until).getTime() < now) ? 'available' : s.status;
        const code = status !== 'available' && status !== 'blocked' ? s.order?.order_code : null;
        return {
          id: s.id,
          row: s.row_label.trim(),
          number: s.seat_number,
          vip: s.is_vip,
          status,
          ...(code ? { order_code: code } : {}),
        };
      }),
    );
  } catch (err) {
    return errorResponse(err);
  }
}
