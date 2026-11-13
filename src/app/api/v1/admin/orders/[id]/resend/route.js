import { requireAdmin } from '@/server/auth';
import { sendApproved } from '@/server/email';
import { apiError, errorResponse, json } from '@/server/errors';
import { orderForEmail, orderTickets } from '@/server/orders';
import { isUuid } from '@/server/validate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/v1/admin/orders/{id}/resend → { email_sent }. Solo órdenes aprobadas. */
export async function POST(request, { params }) {
  try {
    await requireAdmin(request);
    const { id } = await params;
    if (!isUuid(id)) throw apiError('ORDER_NOT_FOUND');

    const order = await orderForEmail(id);
    if (order.status !== 'approved') throw apiError('ORDER_NOT_PENDING', 409, 'La orden todavía no está aprobada');
    const tickets = await orderTickets(id);
    return json({ email_sent: await sendApproved(order, tickets) });
  } catch (err) {
    return errorResponse(err);
  }
}
