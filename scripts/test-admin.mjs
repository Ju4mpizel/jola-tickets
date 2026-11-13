/**
 * Prueba el flujo completo de la directiva contra las rutas /api/v1 de un servidor local.
 * Uso, con `pnpm dev` corriendo:
 *   node --env-file=.env.local scripts/test-admin.mjs http://localhost:3000
 *
 * Necesita en .env.local: ADMIN_TEST_EMAIL, ADMIN_TEST_PASSWORD (cuenta de la tabla admins) y
 * TEST_BUYER_EMAIL (recibe DOS correos reales: aprobación y rechazo).
 * OJO: escribe en la base de Supabase de .env.local. La orden aprobada deja 1 silla vendida;
 * los id quedan impresos al final para limpiarlos.
 */
import { createClient } from '@supabase/supabase-js';

const base = (process.argv[2] || '').replace(/\/+$/, '');
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base)) {
  console.error('Uso: node --env-file=.env.local scripts/test-admin.mjs http://localhost:3000   (solo servidores locales)');
  process.exit(1);
}
const env = (name) => process.env[name]?.trim() ?? '';
const required = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'ADMIN_TEST_EMAIL', 'ADMIN_TEST_PASSWORD', 'TEST_BUYER_EMAIL'];
const missing = required.filter((name) => !env(name));
if (missing.length) {
  console.error(`Faltan variables en .env.local: ${missing.join(', ')}`);
  process.exit(1);
}

const api = `${base}/api/v1`;
const appUrl = env('APP_URL').replace(/\/+$/, '') || base;
const BUYER = { name: 'Prueba Directiva JOLA', phone: '71111111', email: env('TEST_BUYER_EMAIL') };
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

let failures = 0;
const created = new Map(); // order_id → { code, seat, state }
const touchedSeats = new Set();

function check(label, condition, detail = '') {
  if (condition) console.log(`✓ ${label}`);
  else {
    failures += 1;
    console.log(`✗ ${label}${detail ? `  → ${detail}` : ''}`);
  }
  return condition;
}

async function call(method, path, { body, token, jwt, form } = {}) {
  const headers = {};
  if (token) headers['X-Order-Token'] = token;
  if (jwt) headers.Authorization = `Bearer ${jwt}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${api}${path}`, { method, headers, body: form ?? (body ? JSON.stringify(body) : undefined) });
  const type = res.headers.get('content-type') || '';
  let data = null;
  if (type.includes('application/json')) data = await res.json().catch(() => null);
  else await res.arrayBuffer();
  return { status: res.status, data, type, cache: res.headers.get('cache-control') };
}

const show = (r) => `${r.status} ${r.data ? JSON.stringify(r.data) : r.type}`.slice(0, 220);

/** Retiene una silla libre y sube su comprobante → { order_id, order_code, access_token } o null */
async function orderInReview(seatId) {
  const hold = await call('POST', '/holds', { body: { seat_ids: [seatId], buyer: BUYER } });
  if (hold.status !== 200) return { error: show(hold) };
  created.set(hold.data.order_id, { code: hold.data.order_code, seat: seatId, state: 'retenida', token: hold.data.access_token });
  const form = new FormData();
  form.append('file', new Blob([PNG_1PX], { type: 'image/png' }), 'comprobante.png');
  const up = await call('POST', `/orders/${hold.data.order_id}/receipt`, { token: hold.data.access_token, form });
  if (up.status !== 200) return { error: show(up) };
  created.get(hold.data.order_id).state = 'en revisión';
  return hold.data;
}

console.log(`Probando la directiva en ${api}…\n`);

try {
  /* 1. Sin token */
  const anon = await call('GET', '/admin/orders');
  check('GET /admin/orders sin token responde 401 UNAUTHORIZED', anon.status === 401 && anon.data?.error === 'UNAUTHORIZED', show(anon));
  const fake = await call('GET', '/admin/orders', { jwt: 'token-falso' });
  check('GET /admin/orders con un token inválido responde 401', fake.status === 401, show(fake));

  /* 2. Inicio de sesión (Supabase Auth, llave publishable) */
  const supabase = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('NEXT_PUBLIC_SUPABASE_ANON_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: auth, error: authError } = await supabase.auth.signInWithPassword({
    email: env('ADMIN_TEST_EMAIL'),
    password: env('ADMIN_TEST_PASSWORD'),
  });
  const jwt = auth?.session?.access_token;
  if (!check('Iniciar sesión con la cuenta de prueba', !!jwt, authError?.message)) throw new Error('Sin sesión no se puede seguir');

  // Sillas libres desde el final de la sala
  const seats = await call('GET', '/seats');
  const free = (seats.data ?? []).filter((s) => s.status === 'available').map((s) => s.id).reverse();
  if (free.length < 3) throw new Error('No hay 3 sillas libres para probar');
  const [seatApprove, seatReject, seatBlock] = free;

  /* 3. Orden de prueba con comprobante */
  const order = await orderInReview(seatApprove);
  check(`Crear una orden de prueba (silla ${seatApprove}) y subir su comprobante`, !order.error, order.error);

  if (!order.error) {
    /* 4. Lista de pendientes */
    const list = await call('GET', '/admin/orders?status=pending_review', { jwt });
    const item = list.data?.find?.((o) => o.id === order.order_id);
    check('La orden aparece en las pendientes con receipt_url', list.status === 200 && !!item?.receipt_url, show(list));
    check('La lista no devuelve access_token ni receipt_path', !!item && !('access_token' in item) && !('receipt_path' in item));
    if (item?.receipt_url) {
      const img = await fetch(item.receipt_url);
      check('La receipt_url firmada abre el comprobante', img.ok && (img.headers.get('content-type') || '').startsWith('image/png'), `${img.status}`);
    }

    /* 5. Aprobar (correo real) */
    const approve = await call('POST', `/admin/orders/${order.order_id}/approve`, { jwt });
    const tickets = approve.data?.tickets ?? [];
    check('Aprobar la orden devuelve sus boletos', approve.status === 200 && tickets.length === 1, show(approve));
    check(`El correo de aprobación salió (email_sent: true) a TEST_BUYER_EMAIL`, approve.data?.email_sent === true, show(approve));
    if (approve.status === 200) created.get(order.order_id).state = 'aprobada (1 silla vendida)';
    const again = await call('POST', `/admin/orders/${order.order_id}/approve`, { jwt });
    check('Aprobarla otra vez responde 409 ORDER_NOT_PENDING', again.status === 409 && again.data?.error === 'ORDER_NOT_PENDING', show(again));

    /* 6. La orden con sus boletos */
    const got = await call('GET', `/orders/${order.order_id}`, { token: order.access_token });
    check(
      'GET /orders muestra approved con boletos { token, row, number, is_used }',
      got.status === 200 && got.data.status === 'approved' && got.data.tickets?.[0]?.token === tickets[0]?.token && got.data.tickets[0].is_used === false,
      show(got),
    );

    if (tickets[0]) {
      const ticketToken = tickets[0].token;
      /* 7. QR del boleto */
      const qr = await call('GET', `/tickets/${ticketToken}/qr.png`);
      check('GET qr.png responde 200 con image/png', qr.status === 200 && qr.type.startsWith('image/png'), show(qr));
      check('qr.png se guarda en caché (public, max-age=86400, immutable)', qr.cache === 'public, max-age=86400, immutable', qr.cache);

      /* 8. Check-in: primero con la URL completa del QR, después con el token solo */
      const first = await call('POST', '/admin/check-in', { jwt, body: { token: `${appUrl}/tickets/${ticketToken}` } });
      check('Check-in del boleto (URL completa del QR) → OK', first.status === 200 && first.data?.result === 'OK' && !!first.data?.scanned_at, show(first));
      const second = await call('POST', '/admin/check-in', { jwt, body: { token: ticketToken } });
      check('Check-in otra vez → ALREADY_USED', second.status === 200 && second.data?.result === 'ALREADY_USED', show(second));
      const ticket = await call('GET', `/tickets/${ticketToken}`);
      check('GET /tickets muestra is_used: true con scanned_at', ticket.data?.is_used === true && !!ticket.data?.scanned_at, show(ticket));
    }
  }

  /* 9. Token falso */
  const bogus = await call('POST', '/admin/check-in', { jwt, body: { token: 'f'.repeat(64) } });
  check('Check-in de un token falso → 404 TICKET_NOT_FOUND', bogus.status === 404 && bogus.data?.error === 'TICKET_NOT_FOUND', show(bogus));

  /* 10. Rechazar otra orden (correo real) */
  const other = await orderInReview(seatReject);
  if (check(`Crear otra orden (silla ${seatReject}) con comprobante`, !other.error, other.error)) {
    const short = await call('POST', `/admin/orders/${other.order_id}/reject`, { jwt, body: { reason: 'no' } });
    check('Rechazar con un motivo de menos de 3 caracteres → 400 INVALID_DATA', short.status === 400 && short.data?.error === 'INVALID_DATA', show(short));
    const reject = await call('POST', `/admin/orders/${other.order_id}/reject`, {
      jwt,
      body: { reason: 'Prueba: el monto del comprobante no coincide con el total.' },
    });
    check('Rechazar la orden (correo de rechazo, email_sent: true)', reject.status === 200 && reject.data?.email_sent === true, show(reject));
    if (reject.status === 200) created.get(other.order_id).state = 'rechazada (silla liberada)';
    // Reenviar solo vale para aprobadas (no se prueba con una aprobada para no gastar otro correo)
    const resend = await call('POST', `/admin/orders/${other.order_id}/resend`, { jwt });
    check('Reenviar el correo de una orden rechazada → 409 (solo aprobadas)', resend.status === 409, show(resend));
    const after = await call('GET', '/seats');
    check('La silla rechazada vuelve a estar libre', after.data?.find?.((s) => s.id === seatReject)?.status === 'available');
  }

  /* 11. Bloquear y desbloquear */
  touchedSeats.add(seatBlock);
  const block = await call('POST', '/admin/seats/block', { jwt, body: { seat_ids: [seatBlock], blocked: true } });
  check(`Bloquear la silla ${seatBlock} → { changed: 1 }`, block.status === 200 && block.data?.changed === 1, show(block));
  const adminSeats = await call('GET', '/admin/seats', { jwt });
  const adminList = Array.isArray(adminSeats.data) ? adminSeats.data : [];
  check('GET /admin/seats devuelve 180 sillas y la bloqueada como blocked', adminList.length === 180 && adminList.find((s) => s.id === seatBlock)?.status === 'blocked', show(adminSeats));
  if (order && !order.error) {
    const sold = adminList.find((s) => s.id === seatApprove);
    check('La silla aprobada figura como sold con su order_code', sold?.status === 'sold' && sold?.order_code === order.order_code, JSON.stringify(sold));
  }
  const publicMap = await call('GET', '/seats');
  check('En el mapa público la bloqueada se ve ocupada', publicMap.data?.find?.((s) => s.id === seatBlock)?.status === 'taken');
  const unblock = await call('POST', '/admin/seats/block', { jwt, body: { seat_ids: [seatBlock], blocked: false } });
  check(`Desbloquear la silla ${seatBlock} → { changed: 1 }`, unblock.status === 200 && unblock.data?.changed === 1, show(unblock));
  if (unblock.data?.changed === 1) touchedSeats.delete(seatBlock);

  /* 12. Estadísticas */
  const stats = await call('GET', '/admin/stats', { jwt });
  const keys = stats.data ? Object.keys(stats.data).sort().join(',') : '';
  check('GET /admin/stats → { sold, pending_review, revenue, checked_in, blocked }', stats.status === 200 && keys === 'blocked,checked_in,pending_review,revenue,sold', show(stats));
  check('Las estadísticas cuentan la venta y el ingreso', stats.data?.sold >= 1 && stats.data?.revenue > 0 && stats.data?.checked_in >= 1, show(stats));
  check('Las rutas de la directiva responden con Cache-Control: no-store', stats.cache === 'no-store', stats.cache);

  await supabase.auth.signOut();
} catch (err) {
  failures += 1;
  console.log(`✗ La prueba se detuvo: ${err.message}`);
}

console.log('\nÓrdenes creadas:');
for (const [id, o] of created) console.log(`  ${id}  ${o.code}  silla ${o.seat}  ${o.state}`);
if (touchedSeats.size) console.log(`Sillas que quedaron bloqueadas: ${[...touchedSeats].join(', ')}`);
console.log(failures ? `\n${failures} ${failures === 1 ? 'prueba falló' : 'pruebas fallaron'}.` : '\nTodo en orden.');
process.exitCode = failures ? 1 : 0;
