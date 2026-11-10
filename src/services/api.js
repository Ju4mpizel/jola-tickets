/**
 * Único punto de contacto con el servidor (contrato /api/v1 de docs/PLAN.md).
 * Ningún componente usa fetch directo: los hooks llaman a estas funciones.
 *
 * Con NEXT_PUBLIC_USE_MOCKS=true las respuestas salen de ./mocks.js,
 * con la misma forma JSON y los mismos errores { error, message }.
 */

const BASE = (process.env.NEXT_PUBLIC_API_URL || '/api/v1').replace(/\/+$/, '');
export const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === 'true';

/** Mensajes por defecto si el servidor no envía `message` (tabla de errores del contrato). */
const DEFAULT_MESSAGES = {
  INVALID_DATA: 'Revisa los datos marcados',
  INVALID_SEAT_COUNT: 'Elige entre 1 y 8 asientos',
  UNAUTHORIZED: 'Inicia sesión para continuar',
  ORDER_NOT_FOUND: 'No encontramos tu orden',
  TICKET_NOT_FOUND: 'No encontramos este boleto',
  SEAT_TAKEN: 'Alguien acaba de tomar uno de tus asientos',
  ORDER_NOT_AWAITING_PAYMENT: 'Esta orden ya fue procesada',
  ORDER_NOT_PENDING: 'Esta orden ya fue procesada',
  HOLD_EXPIRED: 'Se acabó el tiempo de reserva',
  FILE_TOO_LARGE: 'Sube una imagen o PDF de máximo 4 MB',
  FILE_TYPE: 'Sube una imagen o PDF de máximo 4 MB',
  NETWORK_ERROR: 'No pudimos conectar. Revisa tu conexión e inténtalo de nuevo.',
  SERVER_ERROR: 'Algo salió mal. Inténtalo de nuevo en unos segundos.',
};

/** Error de la API con el código del contrato (`error`) y el texto para el usuario (`message`). */
export class ApiError extends Error {
  /**
   * @param {number} status   HTTP (0 = sin conexión)
   * @param {string} error    código: SEAT_TAKEN, HOLD_EXPIRED…
   * @param {string} [message]
   */
  constructor(status, error, message) {
    super(message || DEFAULT_MESSAGES[error] || DEFAULT_MESSAGES.SERVER_ERROR);
    this.name = 'ApiError';
    this.status = status;
    this.error = error;
  }
}

/** Convierte { status, data } en el resultado o lanza ApiError. Igual para la API real y los mocks. */
function handle(status, data) {
  if (status >= 200 && status < 300) return status === 204 ? null : data;
  if (data && typeof data === 'object' && data.error) throw new ApiError(status, data.error, data.message);
  throw new ApiError(status, status === 401 || status === 403 ? 'UNAUTHORIZED' : 'SERVER_ERROR');
}

/**
 * @param {string} path                     ruta del contrato, ej. '/seats'
 * @param {{
 *   method?: string,
 *   body?: object | FormData,
 *   orderToken?: string,                   // cabecera X-Order-Token (comprador)
 *   adminToken?: string,                   // Authorization: Bearer <JWT> (directiva)
 *   signal?: AbortSignal,
 * }} [options]
 */
async function request(path, { method = 'GET', body, orderToken, adminToken, signal } = {}) {
  const headers = {};
  if (orderToken) headers['X-Order-Token'] = orderToken;
  if (adminToken) headers.Authorization = `Bearer ${adminToken}`;

  if (USE_MOCKS) {
    const { mockFetch } = await import('./mocks');
    const res = await mockFetch(method, path, { body, headers, signal });
    return handle(res.status, res.data);
  }

  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body && !isForm) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
      signal,
      cache: 'no-store',
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK_ERROR');
  }

  let data = null;
  if (res.status !== 204) {
    try {
      data = await res.json();
    } catch {
      data = null;
    }
  }
  return handle(res.status, data);
}

const enc = encodeURIComponent;

/* ============ Comprador (público) ============ */

/** GET /seats → [{ id, row, number, price, vip, status: 'available' | 'taken' }] */
export const getSeats = (opts) => request('/seats', opts);

/**
 * POST /holds → { order_id, order_code, access_token, total, expires_at }
 * @param {number[]} seatIds
 * @param {{ name: string, phone: string, email: string }} buyer  phone solo dígitos
 */
export const createHold = (seatIds, buyer) =>
  request('/holds', {
    method: 'POST',
    body: {
      seat_ids: seatIds,
      buyer: { name: buyer.name, phone: buyer.phone, email: buyer.email },
    },
  });

/** DELETE /holds/{order_id} → null (204) */
export const releaseHold = (orderId, accessToken) =>
  request(`/holds/${enc(orderId)}`, { method: 'DELETE', orderToken: accessToken });

/**
 * POST /orders/{order_id}/receipt (multipart, campo `file`) → { order_code, status: 'pending_review' }
 * @param {string} orderId
 * @param {string} accessToken
 * @param {File | Blob} file   ya comprimido en el navegador
 */
export function submitReceipt(orderId, accessToken, file) {
  const form = new FormData();
  form.append('file', file, file.name || 'comprobante');
  return request(`/orders/${enc(orderId)}/receipt`, { method: 'POST', body: form, orderToken: accessToken });
}

/** GET /orders/{order_id} → { order_code, status, total, seats, reject_reason, tickets? } */
export const getOrder = (orderId, accessToken, opts) =>
  request(`/orders/${enc(orderId)}`, { ...opts, orderToken: accessToken });

/** GET /tickets/{token} → { buyer_name, row, number, is_used, event } */
export const getTicket = (token, opts) => request(`/tickets/${enc(token)}`, opts);

/** URL de la imagen PNG del QR del boleto (la genera el servidor). */
export const ticketQrUrl = (token) => `${BASE}/tickets/${enc(token)}/qr.png`;

/* ============ Directiva (requiere el JWT de Supabase Auth) ============ */

export const admin = {
  /** GET /admin/orders?status= → lista de órdenes con receipt_url firmada por 10 min */
  listOrders: (jwt, status = 'pending_review', opts) =>
    request(`/admin/orders?status=${enc(status)}`, { ...opts, adminToken: jwt }),

  /** POST /admin/orders/{id}/approve → { tickets: [...], email_sent } */
  approveOrder: (jwt, orderId) => request(`/admin/orders/${enc(orderId)}/approve`, { method: 'POST', adminToken: jwt }),

  /** POST /admin/orders/{id}/reject → { email_sent } */
  rejectOrder: (jwt, orderId, reason) =>
    request(`/admin/orders/${enc(orderId)}/reject`, { method: 'POST', body: { reason }, adminToken: jwt }),

  /** POST /admin/orders/{id}/resend → { email_sent } */
  resendEmail: (jwt, orderId) => request(`/admin/orders/${enc(orderId)}/resend`, { method: 'POST', adminToken: jwt }),

  /** POST /admin/check-in → { result: 'OK' | 'ALREADY_USED', buyer_name, row, number, scanned_at } */
  checkIn: (jwt, ticketToken) => request('/admin/check-in', { method: 'POST', body: { token: ticketToken }, adminToken: jwt }),

  /** POST /admin/seats/block → { changed } */
  blockSeats: (jwt, seatIds, blocked) =>
    request('/admin/seats/block', { method: 'POST', body: { seat_ids: seatIds, blocked }, adminToken: jwt }),

  /** GET /admin/stats → vendidos, en revisión, recaudado */
  getStats: (jwt, opts) => request('/admin/stats', { ...opts, adminToken: jwt }),
};
