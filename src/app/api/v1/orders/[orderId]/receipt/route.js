import { randomUUID } from 'node:crypto';
import { RECEIPT_MAX_BYTES } from '@/lib/event';
import { getSupabaseAdmin } from '@/server/supabaseAdmin';
import { apiError, errorResponse, json } from '@/server/errors';
import { detectReceiptType, isUuid, orderToken, sameToken } from '@/server/validate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BUCKET = 'receipts';
/** Margen para los encabezados del multipart sobre los 4 MB del archivo. */
const MAX_REQUEST_BYTES = RECEIPT_MAX_BYTES + 64 * 1024;

/**
 * POST /api/v1/orders/{order_id}/receipt (multipart, campo "file", con X-Order-Token)
 * → { order_code, status: 'pending_review' }
 */
export async function POST(request, { params }) {
  const supabase = getSupabaseAdmin();
  let uploadedPath = null;
  try {
    const { orderId } = await params;
    const token = orderToken(request);

    // a) Antes de leer el archivo: la orden existe, es de quien la pide, espera el pago y no venció.
    //    Así no quedan comprobantes huérfanos en Storage.
    if (!isUuid(orderId) || !token) throw apiError('ORDER_NOT_FOUND');
    const { data: order, error: findError } = await supabase
      .from('orders')
      .select('access_token, status, expires_at')
      .eq('id', orderId)
      .maybeSingle();
    if (findError) throw findError;
    if (!order || !sameToken(token, order.access_token)) throw apiError('ORDER_NOT_FOUND');
    if (order.status !== 'awaiting_payment') throw apiError('ORDER_NOT_AWAITING_PAYMENT');
    if (new Date(order.expires_at).getTime() < Date.now()) throw apiError('HOLD_EXPIRED');

    // b) Tamaño (≤ 4 MB) y tipo real según los primeros bytes
    const declared = Number(request.headers.get('content-length') || 0);
    if (declared > MAX_REQUEST_BYTES) throw apiError('FILE_TOO_LARGE');
    let form;
    try {
      form = await request.formData();
    } catch {
      throw apiError('INVALID_DATA', 400, 'Adjunta la captura de tu comprobante');
    }
    const file = form.get('file');
    if (!file || typeof file === 'string') throw apiError('INVALID_DATA', 400, 'Adjunta la captura de tu comprobante');
    if (file.size > RECEIPT_MAX_BYTES) throw apiError('FILE_TOO_LARGE');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = detectReceiptType(bytes);
    if (!type) throw apiError('FILE_TYPE');

    // c) Bucket privado: receipts/{orderId}/{uuid}.{ext}
    const path = `${orderId}/${randomUUID()}.${type.ext}`;
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: type.contentType, upsert: false });
    if (uploadError) throw uploadError;
    uploadedPath = path;

    // d) Registrar el comprobante; submit_receipt vuelve a revisar todo con la fila bloqueada
    const { data: orderCode, error: submitError } = await supabase.rpc('submit_receipt', {
      p_order_id: orderId,
      p_access_token: token,
      p_receipt_path: path,
    });
    if (submitError) throw submitError;
    uploadedPath = null;

    // e)
    return json({ order_code: orderCode, status: 'pending_review' });
  } catch (err) {
    if (uploadedPath) {
      const { error } = await supabase.storage.from(BUCKET).remove([uploadedPath]);
      if (error) console.error('[api] No se pudo borrar un comprobante sin registrar:', error.message);
    }
    return errorResponse(err);
  }
}
