import { getSupabaseAdmin } from '@/server/supabaseAdmin';
import { requireAdmin } from '@/server/auth';
import { sendRejected } from '@/server/email';
import { apiError, errorResponse, json } from '@/server/errors';
import { orderForEmail } from '@/server/orders';
import { isUuid, parseReason, readJson } from '@/server/validate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/admin/orders/{id}/reject  { reason } (3 a 300 caracteres) → { email_sent }
 * reject_order libera las sillas y guarda el motivo; después se envía el correo de rechazo.
 * Un fallo de EmailJS no deshace el rechazo.
 */
export async function POST(request, { params }) {
  try {
    const adminEmail = await requireAdmin(request);
    const { id } = await params;
    if (!isUuid(id)) throw apiError('ORDER_NOT_FOUND');
    const reason = parseReason(await readJson(request));

    const { error } = await getSupabaseAdmin().rpc('reject_order', { p_order_id: id, p_admin: adminEmail, p_reason: reason });
    if (error) throw error; // ORDER_NOT_PENDING → 409

    let emailSent = false;
    try {
      emailSent = await sendRejected(await orderForEmail(id), reason);
    } catch (err) {
      console.error('[api] No se pudo preparar el correo de rechazo:', err?.message ?? err);
    }
    return json({ email_sent: emailSent });
  } catch (err) {
    return errorResponse(err);
  }
}
