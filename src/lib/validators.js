/**
 * Validación de los datos del comprador. Mismas reglas que los CHECK del SQL;
 * se usan en el navegador y en el servidor (o en los mocks).
 * Cada función devuelve el mensaje de error, o '' si el valor es válido.
 */

import { RECEIPT_EXTENSIONS, RECEIPT_MAX_BYTES, RECEIPT_TYPES } from './event';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[67]\d{7}$/;

export const normalizeName = (v = '') => v.trim().replace(/\s+/g, ' ');
export const phoneDigits = (v = '') => v.replace(/\D/g, '');

export function validateName(v = '') {
  const name = normalizeName(v);
  if (!name) return 'Escribe tu nombre completo';
  if (name.length < 3 || !name.includes(' ')) return 'Incluye tu nombre y apellido';
  if (name.length > 120) return 'El nombre es demasiado largo';
  return '';
}

export function validatePhone(v = '') {
  const d = phoneDigits(v);
  if (!d) return 'Escribe tu número de celular';
  if (!PHONE_RE.test(d)) return 'Debe tener 8 dígitos y empezar con 6 o 7';
  return '';
}

export function validateEmail(v = '') {
  const email = v.trim();
  if (!email) return 'Escribe tu correo electrónico';
  if (!EMAIL_RE.test(email)) return 'Revisa el correo, por ejemplo: nombre@correo.com';
  return '';
}

/** "71234567" → "7123 4567" mientras se escribe (máximo 8 dígitos). */
export function formatPhone(v = '') {
  const d = phoneDigits(v).slice(0, 8);
  return d.length > 4 ? `${d.slice(0, 4)} ${d.slice(4)}` : d;
}

/**
 * Valida al comprador completo ({ name, phone, email }).
 * Devuelve { campo: mensaje } solo con los campos con error.
 */
export function validateBuyer(buyer = {}) {
  const errors = {
    name: validateName(buyer.name),
    phone: validatePhone(buyer.phone),
    email: validateEmail(buyer.email),
  };
  return Object.fromEntries(Object.entries(errors).filter(([, msg]) => msg));
}

/**
 * Comprobante antes de subir: JPG, PNG, WEBP o PDF, de máximo 4 MB (mismas reglas que el servidor).
 * Revisa el tipo y, si el navegador no lo informa (pasa en algunos Android), la extensión.
 * @param {File} file
 * @returns {{ code: 'FILE_TYPE' | 'FILE_TOO_LARGE', message: string } | null}
 */
export function validateReceipt(file) {
  const ext = (file?.name || '').split('.').pop().toLowerCase();
  const typeOk = file?.type ? RECEIPT_TYPES.includes(file.type) : RECEIPT_EXTENSIONS.includes(ext);
  if (!file || !typeOk) return { code: 'FILE_TYPE', message: 'Sube una imagen JPG, PNG o WEBP, o un PDF' };
  if (file.size > RECEIPT_MAX_BYTES) return { code: 'FILE_TOO_LARGE', message: 'El archivo pesa más de 4 MB. Sube una captura más liviana' };
  return null;
}
