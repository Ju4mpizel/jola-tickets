/**
 * Prueba el flujo del comprador contra las rutas /api/v1 de un servidor local (Versión B).
 * Uso, con `pnpm dev` corriendo:  node scripts/test-api.mjs http://localhost:3000
 *
 * OJO: escribe en la base de Supabase de .env.local (crea órdenes y deja UNA en revisión).
 * Las retenciones que puede, las libera al final; los order_id quedan impresos para limpiarlos.
 */

const base = (process.argv[2] || '').replace(/\/+$/, '');
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base)) {
  console.error('Uso: node scripts/test-api.mjs http://localhost:3000   (solo servidores locales)');
  process.exit(1);
}
const api = `${base}/api/v1`;

const BUYER = { name: 'Prueba API JOLA', phone: '7000 0000', email: 'prueba-api@jola.test' };
// PNG real de 1×1 px
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

let failures = 0;
const created = new Map(); // order_id → { token, seat, state }

function check(label, condition, detail = '') {
  if (condition) console.log(`✓ ${label}`);
  else {
    failures += 1;
    console.log(`✗ ${label}${detail ? `  → ${detail}` : ''}`);
  }
  return condition;
}

async function call(method, path, { body, token, form } = {}) {
  const headers = {};
  if (token) headers['X-Order-Token'] = token;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${api}${path}`, { method, headers, body: form ?? (body ? JSON.stringify(body) : undefined) });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data, cache: res.headers.get('cache-control') };
}

const show = (r) => `${r.status} ${typeof r.data === 'object' ? JSON.stringify(r.data) : r.data}`.slice(0, 200);

async function hold(seatId) {
  const r = await call('POST', '/holds', { body: { seat_ids: [seatId], buyer: BUYER } });
  if (r.status === 200) created.set(r.data.order_id, { token: r.data.access_token, seat: seatId, state: 'retenida' });
  return r;
}

function receiptForm(bytes, name, type) {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type }), name);
  return form;
}

console.log(`Probando ${api}…\n`);

try {
  /* 1. Mapa */
  const seats = await call('GET', '/seats');
  const list = Array.isArray(seats.data) ? seats.data : [];
  check('GET /seats devuelve 180 sillas', seats.status === 200 && list.length === 180, show(seats));
  const keys = list[0] ? Object.keys(list[0]).sort().join(',') : '';
  check('Cada silla es { id, row, number, price, vip, status }', keys === 'id,number,price,row,status,vip', keys);
  check('GET /seats responde con Cache-Control: no-store', seats.cache === 'no-store', seats.cache);

  // Sillas libres desde el final de la sala (fila I) para no estorbar
  const free = list.filter((s) => s.status === 'available').map((s) => s.id).reverse();
  if (free.length < 3) throw new Error('No hay 3 sillas libres para probar');
  const [seatMain, seatRace, seatTxt] = free;

  /* 2. Retención */
  const main = await hold(seatMain);
  check(
    `POST /holds retiene la silla ${seatMain}`,
    main.status === 200 && main.data.order_id && main.data.access_token && typeof main.data.total === 'number' && main.data.expires_at,
    show(main),
  );

  /* 3. La misma silla otra vez */
  const again = await hold(seatMain);
  check('Retener la misma silla responde 409 SEAT_TAKEN', again.status === 409 && again.data?.error === 'SEAT_TAKEN', show(again));

  /* 4. Carrera: 10 retenciones a la vez */
  const race = await Promise.all(Array.from({ length: 10 }, () => hold(seatRace)));
  const winners = race.filter((r) => r.status === 200);
  const losers = race.filter((r) => r.status === 409 && r.data?.error === 'SEAT_TAKEN');
  check(
    `10 retenciones en paralelo de la silla ${seatRace}: gana exactamente 1`,
    winners.length === 1 && losers.length === 9,
    `${winners.length} ganaron, ${losers.length} SEAT_TAKEN, otras: ${race.filter((r) => r.status !== 200 && r.status !== 409).map(show).join(' | ')}`,
  );

  /* 5. Liberar */
  if (winners[0]) {
    const { order_id, access_token } = winners[0].data;
    const del = await call('DELETE', `/holds/${order_id}`, { token: access_token });
    const after = await call('GET', '/seats');
    const back = after.data?.find?.((s) => s.id === seatRace)?.status;
    check('DELETE /holds libera la retención (204 y la silla vuelve a estar libre)', del.status === 204 && back === 'available', `${del.status}, silla: ${back}`);
    if (del.status === 204) created.get(order_id).state = 'liberada';
  }

  /* 6. Comprobante PNG */
  let mainOk = false;
  if (main.status === 200) {
    const up = await call('POST', `/orders/${main.data.order_id}/receipt`, {
      token: main.data.access_token,
      form: receiptForm(PNG_1PX, 'comprobante.png', 'image/png'),
    });
    mainOk = check(
      'Subir un comprobante PNG responde { order_code, status: "pending_review" }',
      up.status === 200 && up.data?.status === 'pending_review' && up.data?.order_code === main.data.order_code,
      show(up),
    );
    if (mainOk) created.get(main.data.order_id).state = 'en revisión (con comprobante)';
  }

  /* 7. Un .txt renombrado a .png */
  const txtHold = await hold(seatTxt);
  if (txtHold.status === 200) {
    const fake = await call('POST', `/orders/${txtHold.data.order_id}/receipt`, {
      token: txtHold.data.access_token,
      form: receiptForm(Buffer.from('esto no es una imagen\n'), 'comprobante.png', 'image/png'),
    });
    check('Un .txt renombrado a .png responde 415 FILE_TYPE', fake.status === 415 && fake.data?.error === 'FILE_TYPE', show(fake));
  } else check('Retener una silla para probar el .txt', false, show(txtHold));

  /* 8. Token incorrecto */
  if (main.status === 200) {
    const wrong = await call('GET', `/orders/${main.data.order_id}`, { token: 'f'.repeat(64) });
    check('GET /orders con token incorrecto responde 404 ORDER_NOT_FOUND', wrong.status === 404 && wrong.data?.error === 'ORDER_NOT_FOUND', show(wrong));

    /* 9. Estado de la orden */
    const order = await call('GET', `/orders/${main.data.order_id}`, { token: main.data.access_token });
    const leaked = order.data && ('access_token' in order.data || 'receipt_path' in order.data);
    check(
      'GET /orders muestra pending_review con total y asientos',
      order.status === 200 && order.data.status === 'pending_review' && Array.isArray(order.data.seats) && order.data.seats.length === 1,
      show(order),
    );
    check('GET /orders no devuelve access_token ni receipt_path', order.status === 200 && !leaked);
  }

  /* 10. Boleto inexistente */
  const ticket = await call('GET', `/tickets/${'0'.repeat(64)}`);
  check('GET /tickets de un boleto inexistente responde 404 TICKET_NOT_FOUND', ticket.status === 404 && ticket.data?.error === 'TICKET_NOT_FOUND', show(ticket));
  const qr = await call('GET', `/tickets/${'0'.repeat(64)}/qr.png`);
  check('GET /tickets/…/qr.png de un boleto inexistente responde 404', qr.status === 404, show(qr));
} catch (err) {
  failures += 1;
  console.log(`✗ La prueba se detuvo: ${err.message}`);
}

/* Limpieza: libera las retenciones que siguen esperando el pago */
for (const [id, o] of created) {
  if (o.state !== 'retenida') continue;
  const r = await call('DELETE', `/holds/${id}`, { token: o.token });
  if (r.status === 204) o.state = 'liberada';
}

console.log('\nÓrdenes creadas:');
for (const [id, o] of created) console.log(`  ${id}  silla ${o.seat}  ${o.state}`);
console.log(failures ? `\n${failures} ${failures === 1 ? 'prueba falló' : 'pruebas fallaron'}.` : '\nTodo en orden.');
process.exitCode = failures ? 1 : 0;
