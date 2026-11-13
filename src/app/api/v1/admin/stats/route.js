import { getSupabaseAdmin } from '@/server/supabaseAdmin';
import { requireAdmin } from '@/server/auth';
import { errorResponse, json } from '@/server/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/admin/stats → { sold, pending_review, revenue, checked_in, blocked }
 * revenue = suma de las órdenes aprobadas; checked_in = boletos que ya entraron.
 */
export async function GET(request) {
  try {
    await requireAdmin(request);
    const supabase = getSupabaseAdmin();
    const count = (query) => query.then(({ count: n, error }) => {
      if (error) throw error;
      return n ?? 0;
    });

    const [sold, pending, checkedIn, blocked, revenue] = await Promise.all([
      count(supabase.from('seats').select('id', { count: 'exact', head: true }).eq('status', 'sold')),
      count(supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'pending_review')),
      count(supabase.from('tickets').select('id', { count: 'exact', head: true }).eq('is_used', true)),
      count(supabase.from('seats').select('id', { count: 'exact', head: true }).eq('status', 'blocked')),
      supabase
        .from('orders')
        .select('total_amount')
        .eq('status', 'approved')
        .then(({ data, error }) => {
          if (error) throw error;
          return data.reduce((sum, o) => sum + Number(o.total_amount), 0);
        }),
    ]);

    return json({ sold, pending_review: pending, revenue, checked_in: checkedIn, blocked });
  } catch (err) {
    return errorResponse(err);
  }
}
