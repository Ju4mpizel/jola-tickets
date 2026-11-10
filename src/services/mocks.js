/**
 * Modo simulado de la API (NEXT_PUBLIC_USE_MOCKS=true).
 * Imita las rutas /api/v1 del contrato con la MISMA forma JSON, incluidos los errores
 * { error, message }, y las reglas de las funciones SQL (hold_seats, submit_receipt…).
 *
 * El estado se guarda en localStorage ('jola-mock-db') para que sobreviva a recargas
 * y se comparta entre pestañas (ej. comprar en una y aprobar desde /admin en otra).
 * Desde la consola: window.__jolaMocks.reset(), .takeSeats(['C5','C6']), .expireHold(orderId), .failNext(2)…
 *
 * Es el ÚNICO lugar con datos inventados: sillas ocupadas, códigos y tokens falsos.
 */
import { EVENT, HOLD_MINUTES, MAX_SEATS, ROWS, SEATS_PER_ROW, isVipRow, priceForRow } from '@/lib/event';
import { normalizeName, validateBuyer } from '@/lib/validators';

const STORAGE_KEY = 'jola-mock-db';
const DB_VERSION = 2; // subir cuando cambie el estado inicial, para regenerarlo
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
/**
 * Cerca del 23 % de sillas vendidas al empezar. Misma semilla y mismo orden que el
 * prototipo (fila por fila, asiento por asiento): siempre son las mismas sillas.
 */
const SOLD_RATIO = 0.23;
const SEED = 20261121;
/** Latencia de red simulada (ms): unos 400 ms. */
const LATENCY_MIN = 350;
const LATENCY_SPREAD = 100;

/* ============ Estado ============ */

function seedDb() {
  let seed = SEED;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const seats = [];
  ROWS.forEach((row, r) => {
    for (let n = 1; n <= SEATS_PER_ROW; n++) {
      const sold = rand() < SOLD_RATIO;
      seats.push({
        id: r * SEATS_PER_ROW + n, // orden del INSERT del esquema: A1 = 1 … A20 = 20, B1 = 21 … I20 = 180
        row,
        number: n,
        vip: isVipRow(row),
        price: priceForRow(row),
        status: sold ? 'sold' : 'available',
        held_until: null,
        order_id: null,
      });
    }
  });
  return { version: DB_VERSION, seats, orders: {}, tickets: {} };
}

let memoryDb = null;
/** URLs locales (blob:) de los comprobantes subidos en esta pestaña. */
const receiptUrls = new Map();

function load() {
  if (typeof window === 'undefined') return (memoryDb ??= seedDb());
  try {
    const db = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (db?.version === DB_VERSION) return db;
  } catch {
    /* JSON dañado: se reinicia */
  }
  const db = seedDb();
  save(db);
  return db;
}

function save(db) {
  if (typeof window === 'undefined') {
    memoryDb = db;
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    memoryDb = db;
  }
}

/* ============ Utilidades ============ */

const now = () => Date.now();
const iso = (ms) => (ms == null ? null : new Date(ms).toISOString());
const isFree = (s) => s.status === 'available' || (s.status === 'held' && s.held_until < now());
const hex = (bytes) =>
  Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, '0')).join('');
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${hex(4)}-${hex(2)}-${hex(2)}-${hex(2)}-${hex(6)}`);
const seatRef = (s) => ({ row: s.row, number: s.number });
const sortSeats = (list) => [...list].sort((a, b) => ROWS.indexOf(a.row) - ROWS.indexOf(b.row) || a.number - b.number);

const ok = (data, status = 200) => ({ status, data });
const fail = (status, error, message) => ({ status, data: { error, message } });

function orderSeats(db, order) {
  return sortSeats(db.seats.filter((s) => order.seat_ids.includes(s.id)));
}

function orderTickets(db, orderId) {
  return sortSeats(
    Object.values(db.tickets)
      .filter((t) => t.order_id === orderId)
      .map((t) => ({ token: t.ticket_token, ...seatRef(db.seats.find((s) => s.id === t.seat_id)) })),
  );
}

function findOrder(db, orderId, token) {
  const order = db.orders[orderId];
  return order && order.access_token === token ? order : null;
}

function requireAdmin(headers) {
  const auth = headers.Authorization || '';
  // En modo simulado cualquier token no vacío cuenta como sesión de la directiva
  if (!auth.startsWith('Bearer ') || !auth.slice(7).trim()) {
    return fail(401, 'UNAUTHORIZED', 'Inicia sesión para continuar');
  }
  return null;
}

/* ============ Rutas del comprador ============ */

function getSeats(db) {
  return ok(
    db.seats.map((s) => ({
      id: s.id,
      row: s.row,
      number: s.number,
      price: s.price,
      vip: s.vip,
      status: isFree(s) ? 'available' : 'taken',
    })),
  );
}

function createHold(db, body) {
  const ids = body?.seat_ids;
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > MAX_SEATS || new Set(ids).size !== ids.length) {
    return fail(400, 'INVALID_SEAT_COUNT', `Elige entre 1 y ${MAX_SEATS} asientos`);
  }
  const buyer = body.buyer || {};
  const errors = validateBuyer(buyer);
  if (Object.keys(errors).length) {
    return fail(400, 'INVALID_DATA', Object.values(errors)[0]);
  }
  const seats = ids.map((id) => db.seats.find((s) => s.id === id));
  if (seats.some((s) => !s)) return fail(400, 'INVALID_DATA', 'Uno de los asientos no existe');
  if (seats.some((s) => !isFree(s))) return fail(409, 'SEAT_TAKEN', 'Alguien acaba de tomar uno de tus asientos');

  let code;
  do code = `JOLA-${hex(3).toUpperCase()}`;
  while (Object.values(db.orders).some((o) => o.order_code === code));

  const id = uuid();
  const expires = now() + HOLD_MINUTES * 60_000;
  const total = seats.reduce((sum, s) => sum + s.price, 0);
  db.orders[id] = {
    id,
    order_code: code,
    access_token: hex(32),
    buyer_name: normalizeName(buyer.name),
    buyer_phone: buyer.phone.replace(/\D/g, ''),
    buyer_email: buyer.email.trim().toLowerCase(),
    seat_ids: ids,
    total_amount: total,
    payment_method: 'qr',
    receipt_name: null,
    status: 'awaiting_payment',
    expires_at: expires,
    reject_reason: null,
    reviewed_by: null,
    reviewed_at: null,
    submitted_at: null,
    created_at: now(),
  };
  seats.forEach((s) => Object.assign(s, { status: 'held', held_until: expires, order_id: id }));
  save(db);

  const o = db.orders[id];
  return ok({ order_id: id, order_code: o.order_code, access_token: o.access_token, total, expires_at: iso(expires) });
}

function releaseHold(db, orderId, headers) {
  const order = findOrder(db, orderId, headers['X-Order-Token']);
  // Igual que release_hold: si no corresponde, no hace nada y responde 204
  if (order && order.status === 'awaiting_payment') {
    order.status = 'cancelled';
    db.seats.forEach((s) => {
      if (s.order_id === orderId && s.status === 'held') Object.assign(s, { status: 'available', held_until: null, order_id: null });
    });
    save(db);
  }
  return ok(null, 204);
}

function submitReceipt(db, orderId, headers, body) {
  const file = typeof FormData !== 'undefined' && body instanceof FormData ? body.get('file') : null;
  if (!file || typeof file === 'string') return fail(400, 'INVALID_DATA', 'Adjunta la captura de tu comprobante');
  if (!FILE_TYPES.includes(file.type)) return fail(415, 'FILE_TYPE', 'Sube una imagen o PDF de máximo 4 MB');
  if (file.size > MAX_FILE_BYTES) return fail(413, 'FILE_TOO_LARGE', 'Sube una imagen o PDF de máximo 4 MB');

  const order = findOrder(db, orderId, headers['X-Order-Token']);
  if (!order) return fail(404, 'ORDER_NOT_FOUND', 'No encontramos tu orden');
  if (order.status !== 'awaiting_payment') return fail(409, 'ORDER_NOT_AWAITING_PAYMENT', 'Esta orden ya fue procesada');
  if (order.expires_at < now()) return fail(410, 'HOLD_EXPIRED', 'Se acabó el tiempo de reserva');

  const held = db.seats.filter((s) => s.order_id === orderId && s.status === 'held');
  if (held.length !== order.seat_ids.length) return fail(410, 'HOLD_EXPIRED', 'Se acabó el tiempo de reserva');

  held.forEach((s) => Object.assign(s, { status: 'pending_review', held_until: null }));
  Object.assign(order, { status: 'pending_review', receipt_name: file.name || 'comprobante', submitted_at: now() });
  if (typeof URL !== 'undefined' && URL.createObjectURL) receiptUrls.set(orderId, URL.createObjectURL(file));
  save(db);
  return ok({ order_code: order.order_code, status: 'pending_review' });
}

function getOrder(db, orderId, headers) {
  const order = findOrder(db, orderId, headers['X-Order-Token']);
  if (!order) return fail(404, 'ORDER_NOT_FOUND', 'No encontramos tu orden');
  const data = {
    order_code: order.order_code,
    status: order.status,
    total: order.total_amount,
    seats: orderSeats(db, order).map(seatRef),
    reject_reason: order.reject_reason,
  };
  if (order.status === 'approved') data.tickets = orderTickets(db, orderId);
  return ok(data);
}

function getTicket(db, token) {
  const t = db.tickets[token];
  if (!t) return fail(404, 'TICKET_NOT_FOUND', 'No encontramos este boleto');
  const seat = db.seats.find((s) => s.id === t.seat_id);
  return ok({
    buyer_name: db.orders[t.order_id].buyer_name,
    row: seat.row,
    number: seat.number,
    is_used: t.is_used,
    event: { name: EVENT.name, starts_at: EVENT.startsAt, place: EVENT.place },
  });
}

/* ============ Rutas de la directiva ============ */

function listOrders(db, status) {
  const list = Object.values(db.orders)
    .filter((o) => !status || o.status === status)
    .sort((a, b) => b.created_at - a.created_at)
    .map((o) => ({
      id: o.id,
      order_code: o.order_code,
      status: o.status,
      buyer_name: o.buyer_name,
      buyer_phone: o.buyer_phone,
      buyer_email: o.buyer_email,
      seats: orderSeats(db, o).map(seatRef),
      total: o.total_amount,
      payment_method: o.payment_method,
      receipt_url: receiptUrls.get(o.id) ?? null,
      submitted_at: iso(o.submitted_at),
      created_at: iso(o.created_at),
      reviewed_at: iso(o.reviewed_at),
      reject_reason: o.reject_reason,
    }));
  return ok(list);
}

function approveOrder(db, orderId) {
  const order = db.orders[orderId];
  if (!order || order.status !== 'pending_review') return fail(409, 'ORDER_NOT_PENDING', 'Esta orden ya fue procesada');
  Object.assign(order, { status: 'approved', reviewed_by: 'directiva@mock', reviewed_at: now() });
  db.seats.forEach((s) => {
    if (s.order_id === orderId && s.status === 'pending_review') {
      s.status = 'sold';
      const token = hex(32);
      db.tickets[token] = { ticket_token: token, order_id: orderId, seat_id: s.id, is_used: false, scanned_at: null, created_at: now() };
    }
  });
  save(db);
  return ok({ tickets: orderTickets(db, orderId), email_sent: true });
}

function rejectOrder(db, orderId, body) {
  const order = db.orders[orderId];
  const reason = (body?.reason || '').trim();
  if (!reason) return fail(400, 'INVALID_DATA', 'Escribe el motivo del rechazo');
  if (!order || order.status !== 'pending_review') return fail(409, 'ORDER_NOT_PENDING', 'Esta orden ya fue procesada');
  Object.assign(order, { status: 'rejected', reject_reason: reason, reviewed_by: 'directiva@mock', reviewed_at: now() });
  db.seats.forEach((s) => {
    if (s.order_id === orderId) Object.assign(s, { status: 'available', held_until: null, order_id: null });
  });
  save(db);
  return ok({ email_sent: true });
}

function resendEmail(db, orderId) {
  const order = db.orders[orderId];
  if (!order) return fail(404, 'ORDER_NOT_FOUND', 'No encontramos la orden');
  if (order.status !== 'approved') return fail(409, 'ORDER_NOT_PENDING', 'La orden todavía no está aprobada');
  return ok({ email_sent: true });
}

function checkIn(db, body) {
  const t = db.tickets[body?.token];
  if (!t) return fail(404, 'TICKET_NOT_FOUND', 'No encontramos este boleto');
  let result = 'ALREADY_USED';
  if (!t.is_used) {
    Object.assign(t, { is_used: true, scanned_at: now() });
    result = 'OK';
    save(db);
  }
  const seat = db.seats.find((s) => s.id === t.seat_id);
  return ok({ result, buyer_name: db.orders[t.order_id].buyer_name, row: seat.row, number: seat.number, scanned_at: iso(t.scanned_at) });
}

function blockSeats(db, body) {
  const ids = Array.isArray(body?.seat_ids) ? body.seat_ids : [];
  let changed = 0;
  db.seats.forEach((s) => {
    if (!ids.includes(s.id)) return;
    if (body.blocked && isFree(s)) {
      Object.assign(s, { status: 'blocked', held_until: null, order_id: null });
      changed++;
    } else if (!body.blocked && s.status === 'blocked') {
      s.status = 'available';
      changed++;
    }
  });
  save(db);
  return ok({ changed });
}

function getStats(db) {
  const orders = Object.values(db.orders);
  return ok({
    sold: db.seats.filter((s) => s.status === 'sold').length,
    pending_review: orders.filter((o) => o.status === 'pending_review').length,
    revenue: orders.filter((o) => o.status === 'approved').reduce((sum, o) => sum + o.total_amount, 0),
  });
}

/* ============ Enrutador ============ */

const ROUTES = [
  ['GET', /^\/seats$/, (db) => getSeats(db)],
  ['POST', /^\/holds$/, (db, req) => createHold(db, req.body)],
  ['DELETE', /^\/holds\/([^/]+)$/, (db, req, [id]) => releaseHold(db, id, req.headers)],
  ['POST', /^\/orders\/([^/]+)\/receipt$/, (db, req, [id]) => submitReceipt(db, id, req.headers, req.body)],
  ['GET', /^\/orders\/([^/]+)$/, (db, req, [id]) => getOrder(db, id, req.headers)],
  ['GET', /^\/tickets\/([^/]+)$/, (db, req, [token]) => getTicket(db, token)],
  ['GET', /^\/admin\/orders$/, (db, req) => listOrders(db, req.query.get('status')), true],
  ['POST', /^\/admin\/orders\/([^/]+)\/approve$/, (db, req, [id]) => approveOrder(db, id), true],
  ['POST', /^\/admin\/orders\/([^/]+)\/reject$/, (db, req, [id]) => rejectOrder(db, id, req.body), true],
  ['POST', /^\/admin\/orders\/([^/]+)\/resend$/, (db, req, [id]) => resendEmail(db, id), true],
  ['POST', /^\/admin\/check-in$/, (db, req) => checkIn(db, req.body), true],
  ['POST', /^\/admin\/seats\/block$/, (db, req) => blockSeats(db, req.body), true],
  ['GET', /^\/admin\/stats$/, (db) => getStats(db), true],
];

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('Cancelado', 'AbortError'));
    });
  });
}

/**
 * Responde como lo haría el servidor: { status, data }.
 * @param {string} method
 * @param {string} path      ruta del contrato con query, ej. '/admin/orders?status=pending_review'
 * @param {{ body?: object | FormData, headers?: Record<string, string>, signal?: AbortSignal }} req
 */
export async function mockFetch(method, path, { body, headers = {}, signal } = {}) {
  await wait(LATENCY_MIN + Math.random() * LATENCY_SPREAD, signal);
  if (failuresLeft > 0) {
    failuresLeft--;
    return fail(500, 'SERVER_ERROR', 'Algo salió mal. Inténtalo de nuevo en unos segundos.');
  }
  const [pathname, search = ''] = path.split('?');
  const db = load();

  for (const [m, re, handler, isAdmin] of ROUTES) {
    const match = pathname.match(re);
    if (!match || m !== method) continue;
    if (isAdmin) {
      const denied = requireAdmin(headers);
      if (denied) return denied;
    }
    const params = match.slice(1).map(decodeURIComponent);
    const jsonBody = body && !(typeof FormData !== 'undefined' && body instanceof FormData) ? structuredClone(body) : body;
    const res = handler(db, { body: jsonBody, headers, query: new URLSearchParams(search) }, params);
    return { status: res.status, data: res.data == null ? null : structuredClone(res.data) };
  }
  return fail(404, 'NOT_FOUND', `Ruta simulada inexistente: ${method} ${pathname}`);
}

/* ============ Herramientas para probar desde la consola ============ */

/** Cuántas de las próximas peticiones fallan con 500 (ver mockTools.failNext). */
let failuresLeft = 0;

export const mockTools = {
  /** Hace fallar las próximas `count` peticiones con 500 SERVER_ERROR. Sirve para probar estados de error. */
  failNext(count = 1) {
    failuresLeft = count;
  },
  /** Vuelve al estado inicial. */
  reset() {
    receiptUrls.clear();
    save(seedDb());
  },
  /** Simula que otro comprador compró estas sillas (códigos 'C5' o ids). Sirve para probar SEAT_TAKEN. */
  takeSeats(seats) {
    const db = load();
    db.seats.forEach((s) => {
      if (seats.includes(s.id) || seats.includes(`${s.row}${s.number}`)) Object.assign(s, { status: 'sold', held_until: null });
    });
    save(db);
  },
  /** Hace vencer la retención de una orden ya mismo. Sirve para probar HOLD_EXPIRED. */
  expireHold(orderId) {
    const db = load();
    const order = db.orders[orderId];
    if (!order) return;
    order.expires_at = now() - 1000;
    db.seats.forEach((s) => {
      if (s.order_id === orderId && s.status === 'held') s.held_until = now() - 1000;
    });
    save(db);
  },
  /** Copia del estado actual. */
  state: () => structuredClone(load()),
};

if (typeof window !== 'undefined') window.__jolaMocks = mockTools;
