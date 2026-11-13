import { getSupabaseAdmin } from '@/server/supabaseAdmin';
import { errorResponse, noContent } from '@/server/errors';
import { isUuid, orderToken } from '@/server/validate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * DELETE /api/v1/holds/{order_id} con X-Order-Token → 204.
 * Igual que release_hold: si la orden no existe, el token no coincide o ya no espera el pago,
 * no hace nada y responde 204 igual (no revela si la orden existe).
 */
export async function DELETE(request, { params }) {
  try {
    const { orderId } = await params;
    const token = orderToken(request);
    if (!isUuid(orderId) || !token) return noContent();

    const { error } = await getSupabaseAdmin().rpc('release_hold', { p_order_id: orderId, p_access_token: token });
    if (error) throw error;
    return noContent();
  } catch (err) {
    return errorResponse(err);
  }
}
