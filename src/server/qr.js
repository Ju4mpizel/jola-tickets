import 'server-only';
import QRCode from 'qrcode';

/**
 * PNG del QR de un boleto (para el correo, que no puede dibujar SVG con JavaScript).
 * Contiene la URL completa <APP_URL>/tickets/<token>, igual que el QR de la página del boleto.
 * @param {string} appUrl   sin "/" final
 * @param {string} token
 * @returns {Promise<Buffer>}
 */
export function ticketQrPng(appUrl, token) {
  return QRCode.toBuffer(`${appUrl}/tickets/${encodeURIComponent(token)}`, {
    type: 'png',
    width: 300,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#0A1F5C', light: '#FFFFFF' },
  });
}
