import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { getServerEnv } from '@/lib/env';

/**
 * Cliente de Supabase con la llave SECRETA (sb_secret_…): salta el RLS, así que solo se usa
 * en el servidor (Route Handlers de /api/v1). Se crea la primera vez que se pide y no guarda
 * sesión: cada petición es independiente.
 */
let client = null;

export function getSupabaseAdmin() {
  if (client) return client;
  const { supabaseUrl, supabaseSecretKey } = getServerEnv();
  client = createClient(supabaseUrl, supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return client;
}
