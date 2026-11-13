import { EVENT } from '@/lib/event';
import { getSupabaseAdmin } from '@/server/supabaseAdmin';
import { apiError, errorResponse, json } from '@/server/errors';
import { isTicketToken } from '@/server/validate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/tickets/{token}
 * → { buyer_name, row, number, is_used, scanned_at, event: { name, starts_at, place } }
 */
export async function GET(_request, { params }) {
  try {
    const { token } = await params;
    if (!isTicketToken(token)) throw apiError('TICKET_NOT_FOUND');

    const { data: ticket, error } = await getSupabaseAdmin()
      .from('tickets')
      .select('is_used, scanned_at, seat:seats(row_label, seat_number), order:orders(buyer_name)')
      .eq('ticket_token', token)
      .maybeSingle();
    if (error) throw error;
    if (!ticket) throw apiError('TICKET_NOT_FOUND');

    return json({
      buyer_name: ticket.order.buyer_name,
      row: ticket.seat.row_label.trim(),
      number: ticket.seat.seat_number,
      is_used: ticket.is_used,
      scanned_at: ticket.scanned_at ? new Date(ticket.scanned_at).toISOString() : null,
      event: { name: EVENT.name, starts_at: EVENT.startsAt, place: EVENT.place },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
