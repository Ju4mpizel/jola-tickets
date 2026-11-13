import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { MAX_SEATS, TOTAL_SEATS } from '@/lib/event';
import { normalizeName, phoneDigits, validateBuyer } from '@/lib/validators';
import { apiError } from './errors';

/**
 * Validación de lo que llega a /api/v1. Reusa lib/validators.js (las mismas reglas que el
 * formulario y que los CHECK del SQL) y lanza apiError para que la ruta responda 400.
 */

/**
 * Cuerpo de POST /holds → datos limpios para hold_seats.
 * @param {unknown} body
 * @returns {{ seat_ids: number[], buyer: { name: string, phone: string, email: string } }}
 */
export function parseHold(body) {
  if (!body || typeof body !== 'object') throw apiError('INVALID_DATA');

  const ids = body.seat_ids;
  if (!Array.isArray(ids)) throw apiError('INVALID_SEAT_COUNT');
  if (ids.some((id) => !Number.isInteger(id) || id < 1 || id > TOTAL_SEATS)) {
    throw apiError('INVALID_DATA', 400, 'Uno de los asientos no existe');
  }
  if (ids.length < 1 || ids.length > MAX_SEATS || new Set(ids).size !== ids.length) {
    throw apiError('INVALID_SEAT_COUNT', 400, `Elige entre 1 y ${MAX_SEATS} asientos`);
  }

  const raw = body.buyer && typeof body.buyer === 'object' ? body.buyer : {};
  // Solo nombre, celular y correo (como texto): cualquier otro campo se ignora
  const buyer = {
    name: typeof raw.name === 'string' ? raw.name : '',
    phone: typeof raw.phone === 'string' ? raw.phone : '',
    email: typeof raw.email === 'string' ? raw.email : '',
  };
  const errors = validateBuyer(buyer);
  const first = Object.values(errors)[0];
  if (first) throw apiError('INVALID_DATA', 400, first);

  return {
    seat_ids: ids,
    buyer: {
      name: normalizeName(buyer.name),
      phone: phoneDigits(buyer.phone),
      email: buyer.email.trim().toLowerCase(),
    },
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TICKET_TOKEN_RE = /^[0-9a-f]{64}$/;

/** El id de orden tiene forma de uuid (si no, ni se consulta: sería un error de Postgres). */
export const isUuid = (value) => typeof value === 'string' && UUID_RE.test(value);

/** Los tokens de boleto son 64 caracteres hexadecimales (approve_order). */
export const isTicketToken = (value) => typeof value === 'string' && TICKET_TOKEN_RE.test(value);

/** Cabecera X-Order-Token de la petición ('' si no viene). */
export const orderToken = (request) => request.headers.get('x-order-token')?.trim() ?? '';

/**
 * Tipo real del comprobante según sus primeros bytes (no la extensión ni el type del navegador).
 * @param {Uint8Array} bytes
 * @returns {{ ext: string, contentType: string } | null}   null si no es JPG, PNG, WEBP ni PDF
 */
export function detectReceiptType(bytes) {
  const starts = (sig, offset = 0) => sig.every((b, i) => bytes[offset + i] === b);
  const ascii = (text) => [...text].map((c) => c.charCodeAt(0));
  if (starts([0xff, 0xd8, 0xff])) return { ext: 'jpg', contentType: 'image/jpeg' };
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { ext: 'png', contentType: 'image/png' };
  if (starts(ascii('RIFF')) && starts(ascii('WEBP'), 8)) return { ext: 'webp', contentType: 'image/webp' };
  if (starts(ascii('%PDF-'))) return { ext: 'pdf', contentType: 'application/pdf' };
  return null;
}

/** Compara el token del comprador con el de la orden en tiempo constante. */
export function sameToken(given, expected) {
  if (!given || !expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
