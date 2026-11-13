import { getSupabaseAdmin } from '@/server/supabaseAdmin';
import { requireAdmin } from '@/server/auth';
import { apiError, errorResponse, json } from '@/server/errors';
import { readJson, ticketTokenFrom } from '@/server/validate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/admin/check-in  { token } (el token solo o la URL completa del QR)
 * → { result: 'OK' | 'ALREADY_USED', buyer_name, row, number, scanned_at }
 * check_in marca el boleto de forma atómica: dos lectores a la vez no dejan entrar dos veces.
 */
export async function POST(request) {
  try {
    const adminEmail = await requireAdmin(request);
    const token = ticketTokenFrom((await readJson(request))?.token);
    if (!token) throw apiError('TICKET_NOT_FOUND');

    const { data, error } = await getSupabaseAdmin().rpc('check_in', { p_token: token, p_admin: adminEmail });
    if (error) throw error;
    const row = data?.[0];
    if (!row) throw apiError('TICKET_NOT_FOUND');

    return json({
      result: row.result,
      buyer_name: row.buyer_name,
      row: row.row_label.trim(),
      number: row.seat_number,
      scanned_at: row.scanned_at ? new Date(row.scanned_at).toISOString() : null,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
