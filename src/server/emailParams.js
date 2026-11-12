/**
 * Parámetros de las plantillas de EmailJS (email-templates/boleto_aprobado.html y
 * email-templates/orden_rechazada.html). Deben coincidir EXACTAMENTE con las variables
 * {{...}} de cada plantilla; to_email no aparece en el HTML porque va en el campo
 * "To Email" de la plantilla en EmailJS.
 *
 * Módulo puro, sin 'server-only' ni el alias @/: lo usan src/server/email.js y también
 * scripts/test-email.mjs (que corre con node directo), así la prueba envía exactamente
 * los mismos parámetros que el servidor.
 */
import { EVENT, ROWS, formatMoney, seatCode, sortSeatCodes } from '../lib/event.js';

const orderUrl = (appUrl, order) =>
  `${appUrl}/orden/${encodeURIComponent(order.order_id)}?k=${encodeURIComponent(order.access_token)}`;

/**
 * boleto_aprobado: to_email, to_name, order_code, seats, total, event_date, doors_time,
 * event_place, order_url, site_url y tickets ({{#tickets}} con label, url y qr_url).
 * @param {{ order_id: string, order_code: string, access_token: string, buyer_name: string,
 *           buyer_email: string, total?: number, total_amount?: number }} order
 * @param {{ token: string, row: string, number: number }[]} tickets
 * @param {string} appUrl                       sin "/" final
 * @param {{ qrUrl?: (token: string) => string }} [options]   para pruebas (la ruta qr.png aún no existe)
 */
export function approvedParams(order, tickets, appUrl, { qrUrl } = {}) {
  const sorted = [...tickets].sort((a, b) => ROWS.indexOf(a.row) - ROWS.indexOf(b.row) || a.number - b.number);
  return {
    to_email: order.buyer_email,
    to_name: order.buyer_name,
    order_code: order.order_code,
    seats: sortSeatCodes(tickets.map((t) => seatCode(t.row, t.number))).join(', '),
    total: formatMoney(order.total ?? order.total_amount),
    event_date: EVENT.dateLong,
    doors_time: EVENT.doorsOpen,
    event_place: EVENT.place,
    order_url: orderUrl(appUrl, order),
    site_url: appUrl,
    tickets: sorted.map((t) => ({
      label: `Fila ${t.row} · Asiento ${t.number}`,
      url: `${appUrl}/tickets/${encodeURIComponent(t.token)}`,
      qr_url: qrUrl ? qrUrl(t.token) : `${appUrl}/api/v1/tickets/${encodeURIComponent(t.token)}/qr.png`,
    })),
  };
}

/**
 * orden_rechazada: to_email, to_name, order_code, reason, retry_url y site_url.
 * @param {{ order_code: string, buyer_name: string, buyer_email: string }} order
 * @param {string} reason
 * @param {string} appUrl   sin "/" final
 */
export function rejectedParams(order, reason, appUrl) {
  return {
    to_email: order.buyer_email,
    to_name: order.buyer_name,
    order_code: order.order_code,
    reason,
    retry_url: appUrl,
    site_url: appUrl,
  };
}
