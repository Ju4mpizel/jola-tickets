import 'server-only';
import { ROWS } from '@/lib/event';
import { getSupabaseAdmin } from './supabaseAdmin';
import { apiError } from './errors';

/**
 * Lecturas que comparten varias rutas de la directiva (aprobar, reenviar y la lista).
 */

export const bySeat = (a, b) => ROWS.indexOf(a.row) - ROWS.indexOf(b.row) || a.number - b.number;

/** { id → { row, number } } de un conjunto de sillas, en una sola consulta. */
export async function seatLabels(ids) {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map();
  const { data, error } = await getSupabaseAdmin().from('seats').select('id, row_label, seat_number').in('id', unique);
  if (error) throw error;
  return new Map(data.map((s) => [s.id, { row: s.row_label.trim(), number: s.seat_number }]));
}

/** Boletos de una orden: [{ token, row, number, is_used }], ordenados por fila y número. */
export async function orderTickets(orderId) {
  const { data, error } = await getSupabaseAdmin()
    .from('tickets')
    .select('ticket_token, is_used, seat:seats(row_label, seat_number)')
    .eq('order_id', orderId);
  if (error) throw error;
  return data
    .map((t) => ({ token: t.ticket_token, row: t.seat.row_label.trim(), number: t.seat.seat_number, is_used: t.is_used }))
    .sort(bySeat);
}

/**
 * Datos de la orden que necesitan las plantillas de correo (incluye access_token para el
 * enlace "Ver todas mis entradas"; nunca se devuelve al panel).
 */
export async function orderForEmail(orderId) {
  const { data, error } = await getSupabaseAdmin()
    .from('orders')
    .select('id, order_code, access_token, buyer_name, buyer_email, total_amount, status')
    .eq('id', orderId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw apiError('ORDER_NOT_FOUND');
  return { ...data, order_id: data.id, total: Number(data.total_amount) };
}
