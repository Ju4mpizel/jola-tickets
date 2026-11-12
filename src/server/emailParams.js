/**
 * Parámetros de las plantillas de EmailJS (boleto_aprobado y orden_rechazada).
 * Módulo puro, sin 'server-only' ni el alias @/: lo usan src/server/email.js y también
 * scripts/test-email.mjs (que corre con node directo), así la prueba envía exactamente
 * los mismos parámetros que el servidor.
 */
import { EVENT, ROWS, formatMoney, seatCode, sortSeatCodes } from '../lib/event.js';

const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const orderUrl = (appUrl, order) =>
  `${appUrl}/orden/${encodeURIComponent(order.order_id)}?k=${encodeURIComponent(order.access_token)}`;

/**
 * boleto_aprobado
 * @param {{ order_id: string, order_code: string, access_token: string, buyer_name: string,
 *           buyer_email: string, total?: number, total_amount?: number }} order
 * @param {{ token: string, row: string, number: number }[]} tickets
 * @param {string} appUrl                       sin "/" final
 * @param {{ qrUrl?: (token: string) => string }} [options]   para pruebas (la ruta qr.png aún no existe)
 */
export function approvedParams(order, tickets, appUrl, { qrUrl } = {}) {
  const sorted = [...tickets].sort((a, b) => ROWS.indexOf(a.row) - ROWS.indexOf(b.row) || a.number - b.number);
  const list = sorted.map((t) => ({
    label: `Fila ${t.row} · Asiento ${t.number}`,
    url: `${appUrl}/tickets/${encodeURIComponent(t.token)}`,
    qr_url: qrUrl ? qrUrl(t.token) : `${appUrl}/api/v1/tickets/${encodeURIComponent(t.token)}/qr.png`,
  }));
  // Mismo bloque del plan, para plantillas que usan {{{tickets_html}}}: QR + enlace por entrada
  const ticketsHtml = list
    .map(
      (t) =>
        `<div style="margin:16px 0;text-align:center">` +
        `<img src="${escapeHtml(t.qr_url)}" width="180" height="180" alt="QR de ${escapeHtml(t.label)}">` +
        `<p>${escapeHtml(t.label)} · <a href="${escapeHtml(t.url)}">Ver mi boleto</a></p></div>`,
    )
    .join('');

  return {
    to_email: order.buyer_email,
    to_name: order.buyer_name,
    order_code: order.order_code,
    seats: sortSeatCodes(tickets.map((t) => seatCode(t.row, t.number))).join(', '),
    total: formatMoney(order.total ?? order.total_amount),
    event_name: EVENT.name,
    event_date: EVENT.dateLong,
    doors_open: EVENT.doorsOpen,
    event_place: EVENT.place,
    order_url: orderUrl(appUrl, order),
    site_url: appUrl,
    tickets: list,
    tickets_html: ticketsHtml,
  };
}

/**
 * orden_rechazada
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
    event_name: EVENT.name,
    retry_url: appUrl,
    site_url: appUrl,
  };
}
