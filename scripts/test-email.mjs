/**
 * Envía UNA vez cada plantilla de EmailJS (boleto_aprobado y orden_rechazada) con datos de
 * ejemplo de 2 entradas, a un correo de prueba. Usa los mismos parámetros que el servidor
 * (src/server/emailParams.js). Como /api/v1/tickets/<token>/qr.png aún no existe, el QR del
 * correo es el logo del sitio.
 * Uso: node --env-file=.env.local scripts/test-email.mjs tu@correo.com
 */
import emailjs from '@emailjs/nodejs';
import { approvedParams, rejectedParams } from '../src/server/emailParams.js';

const to = process.argv[2]?.trim();
if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) {
  console.error('Uso: node --env-file=.env.local scripts/test-email.mjs tu@correo.com');
  process.exit(1);
}

const env = (name) => process.env[name]?.trim() ?? '';
const required = ['APP_URL', 'EMAILJS_SERVICE_ID', 'EMAILJS_TEMPLATE_APPROVED', 'EMAILJS_TEMPLATE_REJECTED', 'EMAILJS_PUBLIC_KEY', 'EMAILJS_PRIVATE_KEY'];
const missing = required.filter((name) => !env(name));
if (missing.length) {
  console.error(`Faltan variables: ${missing.join(', ')}`);
  process.exit(1);
}

const appUrl = env('APP_URL').replace(/\/+$/, '');
const keys = { publicKey: env('EMAILJS_PUBLIC_KEY'), privateKey: env('EMAILJS_PRIVATE_KEY') };

// Orden de ejemplo con 2 entradas (datos inventados)
const order = {
  order_id: 'prueba-0000',
  order_code: 'JOLA-PRUEBA',
  access_token: 'token-de-prueba',
  buyer_name: 'Prueba JOLA',
  buyer_email: to,
  total: 100,
};
const tickets = [
  { token: 'prueba-a2', row: 'A', number: 2 },
  { token: 'prueba-a1', row: 'A', number: 1 },
];

async function send(label, templateId, params) {
  try {
    const res = await emailjs.send(env('EMAILJS_SERVICE_ID'), templateId, params, keys);
    console.log(`✓ ${label}: EmailJS respondió ${res.status} ${res.text}`);
    return true;
  } catch (err) {
    console.log(`✗ ${label}: ${err?.status ?? 'error'} ${err?.text ?? err?.message ?? err}`);
    return false;
  }
}

console.log(`Enviando las dos plantillas a ${to}…\n`);
const a = await send(
  'boleto_aprobado',
  env('EMAILJS_TEMPLATE_APPROVED'),
  approvedParams(order, tickets, appUrl, { qrUrl: () => `${appUrl}/images/logo-jola.png` }),
);
const b = await send('orden_rechazada', env('EMAILJS_TEMPLATE_REJECTED'), rejectedParams(order, 'Prueba: el monto no coincide con el total.', appUrl));
process.exitCode = a && b ? 0 : 1;
