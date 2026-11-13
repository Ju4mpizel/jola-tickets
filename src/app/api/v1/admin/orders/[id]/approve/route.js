import { getSupabaseAdmin } from '@/server/supabaseAdmin';
import { requireAdmin } from '@/server/auth';
import { sendApproved } from '@/server/email';
import { apiError, errorResponse, json } from '@/server/errors';
import { bySeat, orderForEmail } from '@/server/orders';
import { isUuid } from '@/server/validate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/admin/orders/{id}/approve → { tickets: [{ token, row, number }], email_sent }
 * approve_order vende las sillas y emite un boleto por asiento. El correo se envía con await
 * antes de responder (en Vercel el trabajo posterior a la respuesta puede cortarse); si falla,
 * la aprobación queda hecha igual y email_sent: false activa "Reenviar correo".
 */
export async function POST(request, { params }) {
  try {
    const adminEmail = await requireAdmin(request);
    const { id } = await params;
    if (!isUuid(id)) throw apiError('ORDER_NOT_FOUND');

    const { data, error } = await getSupabaseAdmin().rpc('approve_order', { p_order_id: id, p_admin: adminEmail });
    if (error) throw error; // ORDER_NOT_PENDING → 409
    const tickets = data.map((t) => ({ token: t.ticket_token, row: t.row_label.trim(), number: t.seat_number })).sort(bySeat);

    let emailSent = false;
    try {
      emailSent = await sendApproved(await orderForEmail(id), tickets);
    } catch (err) {
      console.error('[api] No se pudo preparar el correo de aprobación:', err?.message ?? err);
    }
    return json({ tickets, email_sent: emailSent });
  } catch (err) {
    return errorResponse(err);
  }
}
