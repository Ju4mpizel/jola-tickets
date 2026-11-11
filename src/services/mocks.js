/**
 * Modo simulado de la API (NEXT_PUBLIC_USE_MOCKS=true).
 * Imita las rutas /api/v1 del contrato con la MISMA forma JSON, incluidos los errores
 * { error, message }, y las reglas de las funciones SQL (hold_seats, submit_receipt…).
 *
 * El estado se guarda en localStorage ('jola-mock-db') para que sobreviva a recargas
 * y se comparta entre pestañas (ej. comprar en una y aprobar desde /admin en otra).
 * El estado vive en memoria y se copia en localStorage, para que una recarga en el paso de pago
 * encuentre la misma retención (como pasaría con el servidor real).
 * Desde la consola: window.__jolaMocks.reset(), .takeSeats(['C5','C6']), .expireHold(orderId),
 * .failNext(2), .shortHold(true)…
 *
 * Es el ÚNICO lugar con datos inventados: sillas ocupadas, códigos y tokens falsos.
 */
import { EVENT, HOLD_MINUTES, MAX_SEATS, ROWS, SEATS_PER_ROW, isVipRow, priceForRow } from '@/lib/event';
import { normalizeName, validateBuyer } from '@/lib/validators';

const STORAGE_KEY = 'jola-mock-db';
const DB_VERSION = 3; // subir cuando cambie el estado inicial, para regenerarlo
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
/**
 * Cerca del 23 % de sillas vendidas al empezar. Misma semilla y mismo orden que el
 * prototipo (fila por fila, asiento por asiento): siempre son las mismas sillas.
 */
const SOLD_RATIO = 0.23;
const SEED = 20261121;
/**
 * Retención corta para probar el vencimiento: true = 1 minuto en lugar de HOLD_MINUTES.
 * También se puede activar desde la consola con window.__jolaMocks.shortHold(true).
 */
const SHORT_HOLD_FOR_TESTS = false;
let holdMinutes = SHORT_HOLD_FOR_TESTS ? 1 : HOLD_MINUTES;
/**
 * Silla que siempre responde SEAT_TAKEN al retener, para probar ese error: queda retenida
 * por "otro comprador" durante 30 s (así el mapa la muestra ocupada y luego se libera).
 */
const ALWAYS_TAKEN = { row: 'I', number: 20 };
const ALWAYS_TAKEN_HOLD_MS = 30_000;
/** Lo que tarda la subida simulada del comprobante (ms). */
const UPLOAD_MS = 1500;
/** Motivo de rechazo de ejemplo (window.__jolaMocks.review y ?mock=rejected). */
const SAMPLE_REJECT_REASON = 'No encontramos una transferencia con este código de orden. Revisa la glosa y vuelve a intentarlo.';
/** Latencia de red simulada (ms): unos 400 ms. */
const LATENCY_MIN = 350;
const LATENCY_SPREAD = 100;

/* ============ Directiva simulada ============ */

/** Única cuenta de la directiva en modo simulado. */
const MOCK_ADMIN = { email: 'admin@jola.test', password: 'jola1234' };
/** Duración de la sesión simulada (como un JWT de Supabase renovado). */
const SESSION_MS = 8 * 60 * 60_000;
/** Comprobantes de hasta este tamaño se guardan para verlos desde /admin aunque se recargue. */
const MAX_STORED_RECEIPT = 1.5 * 1024 * 1024;

/** Comprobante de ejemplo como imagen (SVG). */
function sampleReceiptSvg({ bank, amount, code, date }) {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="420" height="640" viewBox="0 0 420 640">' +
    '<rect width="420" height="640" fill="#F4F7FB"/>' +
    '<rect x="0" y="0" width="420" height="96" fill="#0B6E4F"/>' +
    `<text x="28" y="58" font-family="sans-serif" font-size="26" font-weight="700" fill="#fff">${bank}</text>` +
    '<text x="28" y="150" font-family="sans-serif" font-size="18" fill="#56638A">Transferencia exitosa</text>' +
    `<text x="28" y="205" font-family="sans-serif" font-size="40" font-weight="800" fill="#0B1B48">Bs ${amount}.00</text>` +
    '<text x="28" y="270" font-family="sans-serif" font-size="15" fill="#56638A">Destino</text>' +
    '<text x="28" y="296" font-family="sans-serif" font-size="18" font-weight="700" fill="#0B1B48">Joy of Learning Academy</text>' +
    '<text x="28" y="346" font-family="sans-serif" font-size="15" fill="#56638A">Glosa</text>' +
    `<text x="28" y="372" font-family="sans-serif" font-size="18" font-weight="700" fill="#0B1B48">${code}</text>` +
    '<text x="28" y="422" font-family="sans-serif" font-size="15" fill="#56638A">Fecha</text>' +
    `<text x="28" y="448" font-family="sans-serif" font-size="18" font-weight="700" fill="#0B1B48">${date}</text>` +
    '<text x="210" y="600" text-anchor="middle" font-family="sans-serif" font-size="16" font-weight="700" fill="#E0445F">COMPROBANTE DE EJEMPLO</text>' +
    '</svg>';
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Comprobante de ejemplo como PDF de una página. */
function sampleReceiptPdf(code, amount) {
  const text = `BT /F1 18 Tf 40 140 Td (Comprobante de ejemplo) Tj 0 -30 Td (Glosa: ${code}) Tj 0 -30 Td (Monto: Bs ${amount}.00) Tj ET`;
  const pdf = [
    '%PDF-1.4',
    '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 360 220]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj',
    `4 0 obj<</Length ${text.length}>>stream`,
    text,
    'endstream endobj',
    '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj',
    'trailer<</Root 1 0 R>>',
    '%%EOF',
  ].join('\n');
  return `data:application/pdf;base64,${btoa(pdf)}`;
}

/**
 * Tres órdenes de ejemplo en revisión, con sus comprobantes. La de Carlos (Bs 130, con PDF)
 * devuelve email_sent: false al aprobarla, para probar "Reenviar correo".
 */
function seedOrders(db) {
  const t = now();
  const free = (row, count) => db.seats.filter((s) => s.row === row && s.status === 'available').slice(0, count);
  const examples = [
    { name: 'María Fernanda Rojas', phone: '70123456', email: 'maria.rojas@example.com', seats: free('E', 2), minutes: 12, kind: 'svg', bank: 'Banco Unión' },
    { name: 'Carlos Quispe Mamani', phone: '61234567', email: 'carlos.quispe@example.com', seats: [...free('B', 2), ...free('G', 1)], minutes: 35, kind: 'pdf', emailFails: true },
    { name: 'Lucía Mendoza', phone: '71239876', email: 'lucia.mendoza@example.com', seats: free('F', 1), minutes: 125, kind: 'svg', bank: 'BNB' },
  ];
  examples.forEach((ex, i) => {
    const id = `ejemplo-${i + 1}`;
    const code = ['JOLA-7C21A4', 'JOLA-3F9B0E', 'JOLA-A84D2C'][i];
    const total = ex.seats.reduce((sum, s) => sum + s.price, 0);
    const submitted = t - ex.minutes * 60_000;
    const date = new Date(submitted).toLocaleString('es-BO', { dateStyle: 'short', timeStyle: 'short' });
    db.orders[id] = {
      id,
      order_code: code,
      access_token: `token-${id}`,
      buyer_name: ex.name,
      buyer_phone: ex.phone,
      buyer_email: ex.email,
      seat_ids: ex.seats.map((s) => s.id),
      total_amount: total,
      payment_method: 'qr',
      receipt_name: ex.kind === 'pdf' ? 'comprobante.pdf' : 'captura.png',
      receipt_data: ex.kind === 'pdf' ? sampleReceiptPdf(code, total) : sampleReceiptSvg({ bank: ex.bank, amount: total, code, date }),
      status: 'pending_review',
      expires_at: submitted,
      reject_reason: null,
      reviewed_by: null,
      reviewed_at: null,
      submitted_at: submitted,
      created_at: submitted - 4 * 60_000,
      email_sent: null,
      email_fails: !!ex.emailFails,
    };
    ex.seats.forEach((s) => Object.assign(s, { status: 'pending_review', held_until: null, order_id: id }));
  });
}

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
  const db = { version: DB_VERSION, seats, orders: {}, tickets: {}, admin_tokens: {} };
  seedOrders(db);
  return db;
}

let memoryDb = null;
/** URLs locales (blob:) de los comprobantes, creadas al listarlos (se pueden abrir en otra pestaña). */
const receiptUrls = new Map();

/** data: URL → Blob (para abrir el comprobante en otra pestaña: los data: URL de nivel superior están bloqueados). */
function dataUrlToBlob(dataUrl) {
  const [head, body] = dataUrl.split(',');
  const type = head.slice(5).split(';')[0];
  if (head.endsWith(';base64')) {
    const bin = atob(body);
    return new Blob([Uint8Array.from(bin, (c) => c.charCodeAt(0))], { type });
  }
  return new Blob([decodeURIComponent(body)], { type });
}

function receiptUrl(order) {
  if (!order.receipt_data || typeof URL === 'undefined' || !URL.createObjectURL) return null;
  if (!receiptUrls.has(order.id)) receiptUrls.set(order.id, URL.createObjectURL(dataUrlToBlob(order.receipt_data)));
  return receiptUrls.get(order.id);
}

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

function requireAdmin(db, headers) {
  const auth = headers.Authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  // Como el servidor real: solo vale un token emitido al iniciar sesión y vigente
  const expires = db.admin_tokens?.[token];
  if (!token || !expires || expires < now()) return fail(401, 'UNAUTHORIZED', 'Inicia sesión para continuar');
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
  const trap = seats.find((s) => s.row === ALWAYS_TAKEN.row && s.number === ALWAYS_TAKEN.number);
  if (trap && isFree(trap)) {
    Object.assign(trap, { status: 'held', held_until: now() + ALWAYS_TAKEN_HOLD_MS, order_id: 'otro-comprador' });
    save(db);
  }
  if (seats.some((s) => !isFree(s))) return fail(409, 'SEAT_TAKEN', 'Alguien acaba de tomar uno de tus asientos');

  let code;
  do code = `JOLA-${hex(3).toUpperCase()}`;
  while (Object.values(db.orders).some((o) => o.order_code === code));

  const id = uuid();
  const expires = now() + holdMinutes * 60_000;
  // El total lo calcula el "servidor" con sus propios precios, nunca con lo que envía el navegador
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

function submitReceipt(db, orderId, headers, body, receiptData) {
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
  Object.assign(order, {
    status: 'pending_review',
    receipt_name: file.name || 'comprobante',
    receipt_data: receiptData ?? null,
    submitted_at: now(),
  });
  if (!receiptData && typeof URL !== 'undefined' && URL.createObjectURL) receiptUrls.set(orderId, URL.createObjectURL(file));
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
    scanned_at: iso(t.scanned_at), // a acordar con el backend: hora de ingreso para "Ya ingresó"
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
      receipt_url: receiptUrls.get(o.id) ?? receiptUrl(o),
      receipt_name: o.receipt_name, // a acordar con el backend: sirve para saber si es PDF
      email_sent: o.email_sent ?? null,
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
  // Una orden de ejemplo simula que EmailJS falló: la aprobación igual queda hecha
  const emailSent = !order.email_fails;
  Object.assign(order, { status: 'approved', reviewed_by: MOCK_ADMIN.email, reviewed_at: now(), email_sent: emailSent });
  db.seats.forEach((s) => {
    if (s.order_id === orderId && s.status === 'pending_review') {
      s.status = 'sold';
      const token = hex(32);
      db.tickets[token] = { ticket_token: token, order_id: orderId, seat_id: s.id, is_used: false, scanned_at: null, created_at: now() };
    }
  });
  save(db);
  return ok({ tickets: orderTickets(db, orderId), email_sent: emailSent });
}

function rejectOrder(db, orderId, body) {
  const order = db.orders[orderId];
  const reason = (body?.reason || '').trim();
  if (!reason) return fail(400, 'INVALID_DATA', 'Escribe el motivo del rechazo');
  if (!order || order.status !== 'pending_review') return fail(409, 'ORDER_NOT_PENDING', 'Esta orden ya fue procesada');
  Object.assign(order, { status: 'rejected', reject_reason: reason, reviewed_by: MOCK_ADMIN.email, reviewed_at: now(), email_sent: true });
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
  // El reenvío funciona aunque el primer envío haya fallado
  Object.assign(order, { email_sent: true, email_fails: false });
  save(db);
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
    // a acordar con el backend: boletos que ya ingresaron (contador de la puerta)
    checked_in: Object.values(db.tickets).filter((t) => t.is_used).length,
  });
}

/**
 * GET /admin/seats: mapa detallado que solo ve la directiva. Una retención vencida cuenta como libre
 * (igual que en el mapa público); order_code solo en sillas con orden (retenida, en revisión o vendida).
 */
function adminSeats(db) {
  return ok(
    db.seats.map((s) => {
      const status = s.status === 'held' && s.held_until < now() ? 'available' : s.status;
      const order = status !== 'available' && status !== 'blocked' ? db.orders[s.order_id] : null;
      return {
        id: s.id,
        row: s.row,
        number: s.number,
        vip: s.vip,
        status,
        ...(order ? { order_code: order.order_code } : {}),
      };
    }),
  );
}

/* ============ Enrutador ============ */

const ROUTES = [
  ['GET', /^\/seats$/, (db) => getSeats(db)],
  ['POST', /^\/holds$/, (db, req) => createHold(db, req.body)],
  ['DELETE', /^\/holds\/([^/]+)$/, (db, req, [id]) => releaseHold(db, id, req.headers)],
  ['POST', /^\/orders\/([^/]+)\/receipt$/, (db, req, [id]) => submitReceipt(db, id, req.headers, req.body, req.receiptData)],
  ['GET', /^\/orders\/([^/]+)$/, (db, req, [id]) => getOrder(db, id, req.headers)],
  ['GET', /^\/tickets\/([^/]+)$/, (db, req, [token]) => getTicket(db, token)],
  ['GET', /^\/admin\/orders$/, (db, req) => listOrders(db, req.query.get('status')), true],
  ['POST', /^\/admin\/orders\/([^/]+)\/approve$/, (db, req, [id]) => approveOrder(db, id), true],
  ['POST', /^\/admin\/orders\/([^/]+)\/reject$/, (db, req, [id]) => rejectOrder(db, id, req.body), true],
  ['POST', /^\/admin\/orders\/([^/]+)\/resend$/, (db, req, [id]) => resendEmail(db, id), true],
  ['POST', /^\/admin\/check-in$/, (db, req) => checkIn(db, req.body), true],
  ['POST', /^\/admin\/seats\/block$/, (db, req) => blockSeats(db, req.body), true],
  ['GET', /^\/admin\/stats$/, (db) => getStats(db), true],
  ['GET', /^\/admin\/seats$/, (db) => adminSeats(db), true],
];

/** El comprobante como data: URL si es chico (así /admin lo ve aunque se recargue la página). */
function readSmallFile(body) {
  const file = typeof FormData !== 'undefined' && body instanceof FormData ? body.get('file') : null;
  if (!file || typeof file === 'string' || file.size > MAX_STORED_RECEIPT || typeof FileReader === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

/** Subida simulada: avisa el avance en pasos y tarda UPLOAD_MS. */
async function simulateUpload(onProgress, signal) {
  const steps = 10;
  for (let i = 1; i <= steps; i++) {
    await wait(UPLOAD_MS / steps, signal);
    onProgress?.(i / steps);
  }
}

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
 * @param {{
 *   body?: object | FormData,
 *   headers?: Record<string, string>,
 *   signal?: AbortSignal,
 *   onProgress?: (fraction: number) => void,   // subida del comprobante
 * }} req
 */
export async function mockFetch(method, path, { body, headers = {}, signal, onProgress } = {}) {
  const isUpload = method === 'POST' && /^\/orders\/[^/]+\/receipt$/.test(path);
  let receiptData = null;
  if (isUpload) {
    await simulateUpload(onProgress, signal);
    receiptData = await readSmallFile(body);
  } else await wait(LATENCY_MIN + Math.random() * LATENCY_SPREAD, signal);
  if (failuresLeft > 0) {
    failuresLeft--;
    // Sin conexión (status 0) o error del servidor (500)
    if (failureKind === 'network') return fail(0, 'NETWORK_ERROR', 'No pudimos conectar. Revisa tu conexión e inténtalo de nuevo.');
    return fail(500, 'SERVER_ERROR', 'Algo salió mal. Inténtalo de nuevo en unos segundos.');
  }
  const [pathname, search = ''] = path.split('?');
  const db = load();

  for (const [m, re, handler, isAdmin] of ROUTES) {
    const match = pathname.match(re);
    if (!match || m !== method) continue;
    if (isAdmin) {
      const denied = requireAdmin(db, headers);
      if (denied) return denied;
    }
    const params = match.slice(1).map(decodeURIComponent);
    const jsonBody = body && !(typeof FormData !== 'undefined' && body instanceof FormData) ? structuredClone(body) : body;
    const res = handler(db, { body: jsonBody, headers, query: new URLSearchParams(search), receiptData }, params);
    return { status: res.status, data: res.data == null ? null : structuredClone(res.data) };
  }
  return fail(404, 'NOT_FOUND', `Ruta simulada inexistente: ${method} ${pathname}`);
}

/* ============ Inicio de sesión simulado (en lugar de Supabase Auth) ============ */

export const mockAuth = {
  /**
   * Acepta solo admin@jola.test / jola1234. Devuelve la sesión como la armaría el login real:
   * { data: { email, token, expiresAt } } o { error }.
   */
  async signIn(email, password) {
    await wait(LATENCY_MIN + Math.random() * LATENCY_SPREAD);
    if (String(email).trim().toLowerCase() !== MOCK_ADMIN.email || password !== MOCK_ADMIN.password) {
      return { error: 'Correo o contraseña incorrectos' };
    }
    const db = load();
    const token = `mock.${hex(24)}`;
    const expiresAt = now() + SESSION_MS;
    db.admin_tokens = { ...db.admin_tokens, [token]: expiresAt };
    save(db);
    return { data: { email: MOCK_ADMIN.email, token, expiresAt } };
  },
  /** Cierra la sesión: el token deja de servir. */
  async signOut(token) {
    const db = load();
    if (db.admin_tokens?.[token]) {
      delete db.admin_tokens[token];
      save(db);
    }
  },
};

/* ============ Herramientas para probar desde la consola ============ */

/** Cuántas de las próximas peticiones fallan, y cómo (ver mockTools.failNext). */
let failuresLeft = 0;
let failureKind = 'server';

export const mockTools = {
  /**
   * Hace fallar las próximas `count` peticiones. kind: 'server' (500 SERVER_ERROR) o
   * 'network' (sin conexión). Sirve para probar estados de error.
   */
  failNext(count = 1, kind = 'server') {
    failuresLeft = count;
    failureKind = kind;
  },
  /**
   * Aprueba o rechaza una orden en revisión, como lo haría la directiva desde /admin.
   * @param {string} orderId
   * @param {'approved' | 'rejected'} outcome
   */
  review(orderId, outcome, reason = SAMPLE_REJECT_REASON) {
    const db = load();
    const res = outcome === 'approved' ? approveOrder(db, orderId) : rejectOrder(db, orderId, { reason });
    return res.data;
  },
  /** Retención de 1 minuto (true) o de HOLD_MINUTES (false) para las próximas órdenes. */
  shortHold(on = true) {
    holdMinutes = on ? 1 : HOLD_MINUTES;
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
