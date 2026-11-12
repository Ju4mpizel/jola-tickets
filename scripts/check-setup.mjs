/**
 * Verifica la configuración de Supabase y las variables de entorno, sin mostrar ninguna llave.
 * Uso: node --env-file=.env.local scripts/check-setup.mjs
 */
import { createClient } from '@supabase/supabase-js';

const VARS = [
  'NEXT_PUBLIC_API_URL',
  'NEXT_PUBLIC_USE_MOCKS',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'APP_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'EMAILJS_SERVICE_ID',
  'EMAILJS_TEMPLATE_APPROVED',
  'EMAILJS_TEMPLATE_REJECTED',
  'EMAILJS_PUBLIC_KEY',
  'EMAILJS_PRIVATE_KEY',
];

let failures = 0;
const ok = (msg) => console.log(`✓ ${msg}`);
const bad = (msg) => {
  failures += 1;
  console.log(`✗ ${msg}`);
};
const env = (name) => process.env[name]?.trim() ?? '';
const noAuth = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

console.log('Verificando la configuración de JOLA Tickets…\n');

/* 1. Variables */
const missing = VARS.filter((v) => !env(v));
if (missing.length) bad(`Faltan variables: ${missing.join(', ')}`);
else ok(`Están las ${VARS.length} variables`);

const appUrl = env('APP_URL');
if (!appUrl) bad('APP_URL está vacía');
else if (appUrl.endsWith('/')) bad('APP_URL termina en "/" (quita la barra final)');
else if (!/^https?:\/\//.test(appUrl)) bad('APP_URL debe empezar con https:// (o http:// en local)');
else ok('APP_URL no termina en "/"');

/* 6. La llave secreta no está expuesta en variables públicas */
const secret = env('SUPABASE_SERVICE_ROLE_KEY');
const privateEmail = env('EMAILJS_PRIVATE_KEY');
const exposed = Object.keys(process.env).filter((name) => {
  if (!name.startsWith('NEXT_PUBLIC_')) return false;
  const value = process.env[name] ?? '';
  return (secret && value.includes(secret)) || (privateEmail && value.includes(privateEmail)) || value.startsWith('sb_secret_');
});
if (exposed.length) bad(`Una llave secreta está en variables públicas: ${exposed.join(', ')}`);
else ok('La llave secreta no está en ninguna variable NEXT_PUBLIC_');

const url = env('NEXT_PUBLIC_SUPABASE_URL');
const publishable = env('NEXT_PUBLIC_SUPABASE_ANON_KEY');
if (!url || !secret || !publishable) {
  bad('Sin URL o llaves de Supabase no se pueden hacer las pruebas de la base de datos');
} else {
  const admin = createClient(url, secret, noAuth);
  const anon = createClient(url, publishable, noAuth);

  /* 2. Vista pública del mapa con la llave secreta */
  try {
    const { count, error } = await admin.from('public_seat_map').select('*', { count: 'exact', head: true });
    if (error) bad(`public_seat_map con la llave secreta: ${error.message}`);
    else if (count === 180) ok('public_seat_map devuelve 180 sillas');
    else bad(`public_seat_map devuelve ${count} sillas (se esperaban 180)`);
  } catch (err) {
    bad(`public_seat_map: ${err.message}`);
  }

  /* 3. Bucket privado de comprobantes */
  try {
    const { data, error } = await admin.storage.getBucket('receipts');
    if (error) bad(`Bucket "receipts": ${error.message}`);
    else if (data.public) bad('El bucket "receipts" es PÚBLICO: debe ser privado');
    else ok('El bucket "receipts" existe y es privado');
  } catch (err) {
    bad(`Bucket "receipts": ${err.message}`);
  }

  /* 4. Cuentas de la directiva */
  try {
    const { count, error } = await admin.from('admins').select('email', { count: 'exact', head: true });
    if (error) bad(`Tabla admins: ${error.message}`);
    else if (count >= 1) ok(`La tabla admins tiene ${count} ${count === 1 ? 'correo' : 'correos'}`);
    else bad('La tabla admins está vacía: agrega al menos un correo de la directiva');
  } catch (err) {
    bad(`Tabla admins: ${err.message}`);
  }

  /* 5. Con la llave publishable NO se leen seats ni orders */
  for (const table of ['seats', 'orders']) {
    try {
      const { data, error } = await anon.from(table).select('*').limit(1);
      if (error) ok(`Con la llave publishable no se puede leer "${table}" (${error.code ?? 'denegado'})`);
      else if (!data?.length) ok(`Con la llave publishable "${table}" no devuelve filas`);
      else bad(`¡Con la llave publishable se puede leer "${table}"! Revisa los permisos (revoke) y el RLS`);
    } catch (err) {
      ok(`Con la llave publishable no se puede leer "${table}" (${err.message})`);
    }
  }
}

console.log(failures ? `\n${failures} ${failures === 1 ? 'problema' : 'problemas'} por resolver.` : '\nTodo en orden.');
process.exitCode = failures ? 1 : 0;
