import { ROWS } from '@/lib/event';
import { getSupabaseAdmin } from '@/server/supabaseAdmin';
import { apiError, errorResponse, json } from '@/server/errors';
import { isUuid, orderToken, sameToken } from '@/server/validate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bySeat = (a, b) => ROWS.indexOf(a.row) - ROWS.indexOf(b.row) || a.number - b.number;

/**
 * GET /api/v1/orders/{order_id} con X-Order-Token
 * → { order_code, status, total, seats: [{ row, number }], reject_reason,
 *     tickets?: [{ token, row, number, is_used }] }   (tickets solo si está aprobada)
 * Nunca devuelve access_token ni receipt_path.
 */
export async function GET(request, { params }) {
  try {
    const { orderId } = await params;
    const token = orderToken(request);
    if (!isUuid(orderId) || !token) throw apiError('ORDER_NOT_FOUND');

    const supabase = getSupabaseAdmin();
    const { data: order, error } = await supabase
      .from('orders')
      .select('access_token, order_code, status, total_amount, seat_ids, reject_reason')
      .eq('id', orderId)
      .maybeSingle();
    if (error) throw error;
    if (!order || !sameToken(token, order.access_token)) throw apiError('ORDER_NOT_FOUND');

    // Los asientos salen de seat_ids: al rechazar, las sillas se liberan pero la orden los recuerda
    const { data: seatRows, error: seatsError } = await supabase
      .from('seats')
      .select('id, row_label, seat_number')
      .in('id', order.seat_ids);
    if (seatsError) throw seatsError;
    const seatById = new Map(seatRows.map((s) => [s.id, { row: s.row_label.trim(), number: s.seat_number }]));

    const result = {
      order_code: order.order_code,
      status: order.status,
      total: Number(order.total_amount),
      seats: [...seatById.values()].sort(bySeat),
      reject_reason: order.reject_reason,
    };

    if (order.status === 'approved') {
      const { data: tickets, error: ticketsError } = await supabase
        .from('tickets')
        .select('ticket_token, seat_id, is_used')
        .eq('order_id', orderId);
      if (ticketsError) throw ticketsError;
      result.tickets = tickets
        .map((t) => ({ token: t.ticket_token, ...seatById.get(t.seat_id), is_used: t.is_used }))
        .sort(bySeat);
    }

    return json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
