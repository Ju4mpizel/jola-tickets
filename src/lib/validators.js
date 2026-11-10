/**
 * Validación de los datos del comprador. Mismas reglas que los CHECK del SQL;
 * se usan en el navegador y en el servidor (o en los mocks).
 * Cada función devuelve el mensaje de error, o '' si el valor es válido.
 */

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
