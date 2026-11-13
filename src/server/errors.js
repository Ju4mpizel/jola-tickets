import 'server-only';

/**
 * Errores de /api/v1 con la forma del contrato: { error: '<CÓDIGO>', message: '<texto para el usuario>' }.
 * Los códigos y estados HTTP son los de la tabla "Errores" de docs/PLAN.md; las funciones SQL
 * lanzan el código en error.message (raise exception 'SEAT_TAKEN') y aquí se traduce.
 */

const ERRORS = {
  INVALID_DATA: [400, 'Revisa los datos marcados'],
  INVALID_SEAT_COUNT: [400, 'Elige entre 1 y 8 asientos'],
  UNAUTHORIZED: [401, 'Inicia sesión para continuar'],
  ORDER_NOT_FOUND: [404, 'No encontramos tu orden'],
  TICKET_NOT_FOUND: [404, 'No encontramos este boleto'],
  SEAT_TAKEN: [409, 'Alguien acaba de tomar uno de tus asientos'],
  ORDER_NOT_AWAITING_PAYMENT: [409, 'Esta orden ya fue procesada'],
  ORDER_NOT_PENDING: [409, 'Esta orden ya fue procesada'],
  HOLD_EXPIRED: [410, 'Se acabó el tiempo de reserva'],
  FILE_TOO_LARGE: [413, 'Sube una imagen o PDF de máximo 4 MB'],
  FILE_TYPE: [415, 'Sube una imagen o PDF de máximo 4 MB'],
  SERVER_ERROR: [500, 'Algo salió mal. Inténtalo de nuevo en unos segundos.'],
};

/** Ninguna respuesta de la API se guarda en caché (salvo la imagen del QR). */
export const NO_STORE = { 'Cache-Control': 'no-store' };

/** Respuesta JSON sin caché. */
export const json = (data, status = 200) => Response.json(data, { status, headers: NO_STORE });

/** 204 sin cuerpo y sin caché. */
export const noContent = () => new Response(null, { status: 204, headers: NO_STORE });

/**
 * Error esperado de la API (se lanza en validate.js o en las rutas).
 * @param {keyof typeof ERRORS} code
 * @param {number} [status]    por defecto el del contrato
 * @param {string} [message]   por defecto el genérico del código
 */
export function apiError(code, status, message) {
  const [defaultStatus, defaultMessage] = ERRORS[code] ?? ERRORS.SERVER_ERROR;
  const err = new Error(message || defaultMessage);
  err.name = 'ApiError';
  err.code = code;
  err.status = status ?? defaultStatus;
  err.isApiError = true;
  return err;
}

/**
 * Convierte cualquier error en Response { error, message }:
 * - ApiError → su código y estado;
 * - error de Supabase cuyo message es un código del contrato → ese código (SEAT_TAKEN → 409…);
 * - violación de CHECK (Postgres 23514) → 400 INVALID_DATA;
 * - todo lo demás → 500 genérico, registrado en el servidor sin detalles para el usuario.
 */
export function errorResponse(err) {
  if (err?.isApiError) return json({ error: err.code, message: err.message }, err.status);

  const sqlCode = typeof err?.message === 'string' ? err.message.trim() : '';
  if (sqlCode in ERRORS && sqlCode !== 'SERVER_ERROR') {
    const [status, message] = ERRORS[sqlCode];
    return json({ error: sqlCode, message }, status);
  }
  if (err?.code === '23514') {
    return json({ error: 'INVALID_DATA', message: ERRORS.INVALID_DATA[1] }, 400);
  }

  // Solo el código y el texto técnico: nunca el cuerpo de la petición ni datos del comprador
  console.error('[api] Error inesperado:', err?.code ?? '', err?.message ?? err);
  return json({ error: 'SERVER_ERROR', message: ERRORS.SERVER_ERROR[1] }, 500);
}
