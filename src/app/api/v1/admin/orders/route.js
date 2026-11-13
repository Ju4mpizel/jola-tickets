import { getSupabaseAdmin } from '@/server/supabaseAdmin';
import { requireAdmin } from '@/server/auth';
import { apiError, errorResponse, json } from '@/server/errors';
import { bySeat, seatLabels } from '@/server/orders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUSES = ['pending_review', 'approved', 'rejected'];
const RECEIPT_URL_SECONDS = 10 * 60;
const iso = (value) => (value ? new Date(value).toISOString() : null);

/**
 * GET /api/v1/admin/orders?status=pending_review|approved|rejected
 * Órdenes sin access_token ni receipt_path, con sus asientos, fechas y receipt_url firmada
 * por 10 minutos. Las pendientes van de la más antigua a la más nueva (se atienden en orden);
 * las aprobadas y rechazadas, de la revisada más reciente a la más antigua.
 */
export async function GET(request) {
  try {
    await requireAdmin(request);
    const status = new URL(request.url).searchParams.get('status') || 'pending_review';
    if (!STATUSES.includes(status)) throw apiError('INVALID_DATA', 400, 'Filtro de estado no válido');

    const supabase = getSupabaseAdmin();
    const pending = status === 'pending_review';
    const { data: orders, error } = await supabase
      .from('orders')
      .select(
        'id, order_code, status, buyer_name, buyer_phone, buyer_email, seat_ids, total_amount, payment_method, receipt_path, submitted_at, created_at, reviewed_at, reviewed_by, reject_reason',
      )
      .eq('status', status)
      .order(pending ? 'submitted_at' : 'reviewed_at', { ascending: pending, nullsFirst: false })
      .limit(500);
    if (error) throw error;

    const seats = await seatLabels(orders.flatMap((o) => o.seat_ids));

    // Una sola llamada a Storage para todas las URL firmadas
    const paths = orders.map((o) => o.receipt_path).filter(Boolean);
    const signed = new Map();
    if (paths.length) {
      const { data: urls, error: signError } = await supabase.storage.from('receipts').createSignedUrls(paths, RECEIPT_URL_SECONDS);
      if (signError) throw signError;
      urls.forEach((u) => u.signedUrl && signed.set(u.path, u.signedUrl));
    }

    return json(
      orders.map((o) => {
        const ext = o.receipt_path?.split('.').pop()?.toLowerCase();
        return {
          id: o.id,
          order_code: o.order_code,
          status: o.status,
          buyer_name: o.buyer_name,
          buyer_phone: o.buyer_phone,
          buyer_email: o.buyer_email,
          seats: o.seat_ids.map((id) => seats.get(id)).filter(Boolean).sort(bySeat),
          total: Number(o.total_amount),
          payment_method: o.payment_method,
          receipt_url: o.receipt_path ? (signed.get(o.receipt_path) ?? null) : null,
          // El nombre original no se guarda: basta la extensión para saber si es PDF
          receipt_name: ext ? `comprobante.${ext}` : null,
          // El esquema no guarda si el correo salió: el panel lo sabe por la respuesta de aprobar
          email_sent: null,
          submitted_at: iso(o.submitted_at),
          created_at: iso(o.created_at),
          reviewed_at: iso(o.reviewed_at),
          reviewed_by: o.reviewed_by,
          reject_reason: o.reject_reason,
        };
      }),
    );
  } catch (err) {
    return errorResponse(err);
  }
}
