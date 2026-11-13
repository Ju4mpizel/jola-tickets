import { getSupabaseAdmin } from '@/server/supabaseAdmin';
import { requireAdmin } from '@/server/auth';
import { errorResponse, json } from '@/server/errors';
import { parseBlock, readJson } from '@/server/validate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/admin/seats/block  { seat_ids, blocked } → { changed }
 * Solo bloquea sillas libres y solo desbloquea las bloqueadas (set_seats_blocked).
 */
export async function POST(request) {
  try {
    await requireAdmin(request);
    const { seat_ids, blocked } = parseBlock(await readJson(request));
    const { data, error } = await getSupabaseAdmin().rpc('set_seats_blocked', { p_seat_ids: seat_ids, p_blocked: blocked });
    if (error) throw error;
    return json({ changed: Number(data) || 0 });
  } catch (err) {
    return errorResponse(err);
  }
}
