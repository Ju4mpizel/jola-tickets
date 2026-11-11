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
 *   onProgress?: (fraction: number) => void,   // solo en modo simulado (la subida real usa XHR)
 * }} [options]
 */
async function request(path, { method = 'GET', body, orderToken, adminToken, signal, onProgress } = {}) {
  const headers = {};
  if (orderToken) headers['X-Order-Token'] = orderToken;
  if (adminToken) headers.Authorization = `Bearer ${adminToken}`;

  if (USE_MOCKS) {
    const { mockFetch } = await import('./mocks');
    const res = await mockFetch(method, path, { body, headers, signal, onProgress });
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
 * Con onProgress, la subida real va por XMLHttpRequest (fetch no informa el avance de la subida).
 * @param {string} orderId
 * @param {string} accessToken
 * @param {File | Blob} file   ya comprimido en el navegador
 * @param {{ onProgress?: (fraction: number) => void, signal?: AbortSignal }} [options]
 */
export function submitReceipt(orderId, accessToken, file, { onProgress, signal } = {}) {
  const form = new FormData();
  form.append('file', file, file.name || 'comprobante');
  const path = `/orders/${enc(orderId)}/receipt`;
  if (USE_MOCKS || !onProgress || typeof XMLHttpRequest === 'undefined') {
    return request(path, { method: 'POST', body: form, orderToken: accessToken, signal, onProgress });
  }
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE}${path}`);
    xhr.setRequestHeader('X-Order-Token', accessToken);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let data = null;
      try {
        data = xhr.status === 204 ? null : JSON.parse(xhr.responseText);
      } catch {
        data = null;
      }
      try {
        resolve(handle(xhr.status, data));
      } catch (err) {
        reject(err);
      }
    };
    xhr.onerror = () => reject(new ApiError(0, 'NETWORK_ERROR'));
    xhr.onabort = () => reject(new DOMException('Cancelado', 'AbortError'));
    signal?.addEventListener('abort', () => xhr.abort());
    xhr.send(form);
  });
}

/** GET /orders/{order_id} → { order_code, status, total, seats, reject_reason, tickets? } */
export const getOrder = (orderId, accessToken, opts) =>
  request(`/orders/${enc(orderId)}`, { ...opts, orderToken: accessToken });

/** GET /tickets/{token} → { buyer_name, row, number, is_used, event } */
export const getTicket = (token, opts) => request(`/tickets/${enc(token)}`, opts);

/** URL de la imagen PNG del QR del boleto (la genera el servidor). */
export const ticketQrUrl = (token) => `${BASE}/tickets/${enc(token)}/qr.png`;

/**
 * Solo en desarrollo con datos simulados: aprueba o rechaza una orden en revisión para
 * probar las vistas de /orden (?mock=approved o ?mock=rejected). En producción no hace nada.
 * @param {string} orderId
 * @param {'approved' | 'rejected'} outcome
 */
export async function devSimulateReview(orderId, outcome) {
  if (!USE_MOCKS || process.env.NODE_ENV === 'production') return;
  const { mockTools } = await import('./mocks');
  mockTools.review(orderId, outcome);
}

/* ============ Sesión de la directiva ============ */

const MOCK_SESSION_KEY = 'jola-admin-session';

/**
 * Inicio de sesión de la directiva. Modo real: Supabase Auth con supabaseBrowser (se carga
 * solo al usarse). Modo simulado: mocks.js (admin@jola.test / jola1234).
 * La sesión es { email, token, expiresAt }; el token va como Authorization: Bearer en /admin/*.
 */
export const adminAuth = {
  /** @returns {Promise<{ email: string, token: string, expiresAt: number }>}  o lanza ApiError UNAUTHORIZED */
  async signIn(email, password) {
    if (USE_MOCKS) {
      const { mockAuth } = await import('./mocks');
      const { data, error } = await mockAuth.signIn(email, password);
      if (error) throw new ApiError(401, 'UNAUTHORIZED', error);
      try {
        sessionStorage.setItem(MOCK_SESSION_KEY, JSON.stringify(data));
      } catch {
        /* sin almacenamiento: la sesión dura lo que la pestaña */
      }
      return data;
    }
    const { getSupabase } = await import('./supabaseBrowser');
    const { data, error } = await getSupabase().auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      const network = error?.status === 0 || /fetch/i.test(error?.message || '');
      throw new ApiError(network ? 0 : 401, network ? 'NETWORK_ERROR' : 'UNAUTHORIZED', network ? undefined : 'Correo o contraseña incorrectos');
    }
    return { email: data.user.email, token: data.session.access_token, expiresAt: data.session.expires_at * 1000 };
  },

  /** Sesión vigente (con el token ya renovado en modo real) o null. */
  async getSession() {
    if (USE_MOCKS) {
      try {
        const s = JSON.parse(sessionStorage.getItem(MOCK_SESSION_KEY) || 'null');
        return s && s.expiresAt > Date.now() ? s : null;
      } catch {
        return null;
      }
    }
    const { getSupabase } = await import('./supabaseBrowser');
    const { data } = await getSupabase().auth.getSession();
    const s = data.session;
    return s ? { email: s.user.email, token: s.access_token, expiresAt: s.expires_at * 1000 } : null;
  },

  async signOut(token) {
    if (USE_MOCKS) {
      try {
        sessionStorage.removeItem(MOCK_SESSION_KEY);
      } catch {
        /* nada que borrar */
      }
      const { mockAuth } = await import('./mocks');
      await mockAuth.signOut(token);
      return;
    }
    const { getSupabase } = await import('./supabaseBrowser');
    await getSupabase().auth.signOut();
  },
};

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

  /**
   * GET /admin/seats → [{ id, row, number, vip, status, order_code? }], con status
   * 'available' | 'held' | 'pending_review' | 'sold' | 'blocked'. Mapa detallado solo para la directiva.
   */
  listSeats: (jwt, opts) => request('/admin/seats', { ...opts, adminToken: jwt }),

  /** GET /admin/stats → { sold, pending_review, revenue, checked_in } */
  getStats: (jwt, opts) => request('/admin/stats', { ...opts, adminToken: jwt }),
};
