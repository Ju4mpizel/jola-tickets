import 'server-only';
import { getSupabaseAdmin } from './supabaseAdmin';
import { apiError } from './errors';

/**
 * Protección real de /api/v1/admin/* (las páginas de /admin solo redirigen al login).
 * - Sin token o con un token inválido o vencido → 401 UNAUTHORIZED.
 * - Cuenta válida cuyo correo no está en la tabla admins → 403 FORBIDDEN.
 * @param {Request} request
 * @returns {Promise<string>}  correo de la directiva (en minúsculas), para reviewed_by o scanned_by
 */
export async function requireAdmin(request) {
  const header = request.headers.get('authorization') || '';
  const token = /^Bearer\s+(.+)$/i.exec(header)?.[1]?.trim();
  if (!token) throw apiError('UNAUTHORIZED');

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.auth.getUser(token);
  const email = data?.user?.email?.trim().toLowerCase();
  if (error || !email) throw apiError('UNAUTHORIZED');

  // Sin distinguir mayúsculas (por si el correo se cargó con alguna); _ y % se escapan para ilike
  const pattern = email.replace(/[\\%_]/g, (c) => `\\${c}`);
  const { data: admin, error: adminError } = await supabase.from('admins').select('email').ilike('email', pattern).limit(1).maybeSingle();
  if (adminError) throw adminError;
  if (!admin) throw apiError('FORBIDDEN');
  return email;
}
