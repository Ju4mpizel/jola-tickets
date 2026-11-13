import { getServerEnv } from '@/lib/env';
import { getSupabaseAdmin } from '@/server/supabaseAdmin';
import { apiError, errorResponse } from '@/server/errors';
import { ticketQrPng } from '@/server/qr';
import { isTicketToken } from '@/server/validate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/tickets/{token}/qr.png → PNG de 300 px con <APP_URL>/tickets/<token>.
 * La imagen de un token nunca cambia: se guarda en caché un día (la usa el correo).
 */
export async function GET(_request, { params }) {
  try {
    const { token } = await params;
    if (!isTicketToken(token)) throw apiError('TICKET_NOT_FOUND');

    const { data, error } = await getSupabaseAdmin()
      .from('tickets')
      .select('id')
      .eq('ticket_token', token)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw apiError('TICKET_NOT_FOUND');

    const png = await ticketQrPng(getServerEnv().appUrl, token);
    return new Response(new Uint8Array(png), {
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': String(png.length),
        'Cache-Control': 'public, max-age=86400, immutable',
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
