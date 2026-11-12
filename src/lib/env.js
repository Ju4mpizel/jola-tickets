import 'server-only';

/**
 * Variables de entorno del SERVIDOR (Route Handlers y src/server/). Nunca importar desde
 * componentes de cliente: 'server-only' hace fallar el build si alguien lo intenta.
 * Las públicas (NEXT_PUBLIC_*) se leen directo donde se usan.
 */
const REQUIRED = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'APP_URL',
  'EMAILJS_SERVICE_ID',
  'EMAILJS_TEMPLATE_APPROVED',
  'EMAILJS_TEMPLATE_REJECTED',
  'EMAILJS_PUBLIC_KEY',
  'EMAILJS_PRIVATE_KEY',
];

let cached = null;

/**
 * Lee y valida las variables del servidor (una sola vez). Falla con un mensaje claro si falta
 * alguna (sin mostrar valores) y normaliza APP_URL quitando la barra final.
 * @returns {{
 *   supabaseUrl: string,
 *   supabaseSecretKey: string,
 *   appUrl: string,                 // ej. https://jola-tickets.vercel.app (sin "/" final)
 *   emailjs: { serviceId: string, templateApproved: string, templateRejected: string, publicKey: string, privateKey: string },
 * }}
 */
export function getServerEnv() {
  if (cached) return cached;
  const missing = REQUIRED.filter((name) => !process.env[name]?.trim());
  if (missing.length) {
    throw new Error(`Faltan variables de entorno del servidor: ${missing.join(', ')}. Revisa .env.local (local) o Settings → Environment Variables (Vercel).`);
  }
  const env = (name) => process.env[name].trim();
  cached = {
    supabaseUrl: env('NEXT_PUBLIC_SUPABASE_URL'),
    supabaseSecretKey: env('SUPABASE_SERVICE_ROLE_KEY'),
    appUrl: env('APP_URL').replace(/\/+$/, ''),
    emailjs: {
      serviceId: env('EMAILJS_SERVICE_ID'),
      templateApproved: env('EMAILJS_TEMPLATE_APPROVED'),
      templateRejected: env('EMAILJS_TEMPLATE_REJECTED'),
      publicKey: env('EMAILJS_PUBLIC_KEY'),
      privateKey: env('EMAILJS_PRIVATE_KEY'),
    },
  };
  return cached;
}
