/**
 * Datos fijos del evento y reglas de venta.
 * Los precios de aquí son solo informativos: el total que se cobra lo calcula el servidor.
 */

export const EVENT = {
  name: 'Festival de Talentos 2026',
  /** El título del inicio va en dos líneas; el año se resalta en cian. */
  titleLines: ['Festival de', 'Talentos'],
  year: '2026',
  tagline: 'Una noche llena de música, baile y teatro hecha por nuestros estudiantes. Reserva tu lugar frente al escenario.',
  school: 'Joy of Learning Academy',
  startsAt: '2026-11-21T19:00:00-04:00',
  doorsOpen: '18:30',
  time: '19:00',
  dateShort: 'Vie 21 Nov',
  dateTicket: 'Vie 21 Nov 2026',
  dateLong: 'Viernes 21 de noviembre, 19:00',
  place: 'Patio principal',
};

export const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
export const SEATS_PER_ROW = 20;
/** El pasillo va entre el asiento 10 y el 11. */
export const AISLE_AFTER = 10;
export const TOTAL_SEATS = ROWS.length * SEATS_PER_ROW;

export const VIP_ROWS = ['A', 'B'];
export const PRICE_VIP = 50;
export const PRICE_GENERAL = 30;
export const MIN_PRICE = Math.min(PRICE_VIP, PRICE_GENERAL);

export const MAX_SEATS = 8;
/** Minutos que el servidor retiene los asientos. */
export const HOLD_MINUTES = 15;
/** El temporizador del frontend muestra este margen menos. */
export const HOLD_MARGIN_MINUTES = 1;
/** Cada cuánto se actualiza el mapa. */
export const SEATS_REFRESH_MS = 15_000;

export const CURRENCY = 'Bs';

/**
 * Datos de pago del colegio: QR estático del banco y, como alternativa al QR, los datos de la
 * cuenta. Los valores son de EJEMPLO hasta recibir los reales.
 * Si public/images/qr-pago.png no existe, PaymentStep muestra un placeholder "QR de ejemplo".
 */
export const PAYMENT = {
  qrSrc: '/images/qr-pago.png',
  bank: 'Banco EJEMPLO',
  holder: 'Joy of Learning Academy (EJEMPLO)',
  account: '0000-000000-EJEMPLO',
};

/** Comprobante: imagen JPG, PNG o WEBP, o PDF, de máximo 4 MB (igual que el servidor). */
export const RECEIPT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
export const RECEIPT_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'pdf'];
export const RECEIPT_MAX_BYTES = 4 * 1024 * 1024;
/** Las imágenes se comprimen en el navegador por debajo de este tamaño antes de subir. */
export const RECEIPT_TARGET_BYTES = 2 * 1024 * 1024;
/** Cada cuánto se actualiza la página de la orden mientras está en revisión. */
export const ORDER_REFRESH_MS = 30_000;

/** @param {string} row */
export const isVipRow = (row) => VIP_ROWS.includes(row);

/** @param {string} row */
export const priceForRow = (row) => (isVipRow(row) ? PRICE_VIP : PRICE_GENERAL);

/** "Bs 130" */
export const formatMoney = (amount) => `${CURRENCY} ${Number(amount).toLocaleString('es-BO', { maximumFractionDigits: 2 })}`;

/** "C7" */
export const seatCode = (row, number) => `${row}${number}`;

/** Ordena códigos de asiento por fila y número: ["C5", "A2", "A1"] → ["A1", "A2", "C5"]. */
export const sortSeatCodes = (codes) =>
  [...codes].sort((a, b) => ROWS.indexOf(a[0]) - ROWS.indexOf(b[0]) || parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10));
