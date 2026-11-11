import { createClient } from '@supabase/supabase-js';

/**
 * Cliente de Supabase SOLO para el login de la directiva (llave anon, pública).
 * Nunca usar aquí SUPABASE_SERVICE_ROLE_KEY: los datos se leen siempre por /api/v1.
 * Se crea la primera vez que se usa (api.js lo importa de forma diferida).
 */
let client = null;

export function getSupabase() {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Falta configurar NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY');
  client = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'jola-admin-auth' },
  });
  return client;
}
