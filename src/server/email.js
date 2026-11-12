import 'server-only';
import emailjs from '@emailjs/nodejs';
import { getServerEnv } from '@/lib/env';
import { approvedParams, rejectedParams } from './emailParams';

/**
 * Correos con EmailJS, siempre desde el servidor (la llave privada nunca llega al navegador).
 * Ninguna función lanza error: devuelven true o false, para que una aprobación o un rechazo
 * no fallen por el correo (el panel ofrece "Reenviar correo" con email_sent: false).
 */

/**
 * @param {string} templateId
 * @param {Record<string, unknown>} params
 * @returns {Promise<boolean>}
 */
export async function sendTemplate(templateId, params) {
  try {
    const { emailjs: cfg } = getServerEnv();
    await emailjs.send(cfg.serviceId, templateId, params, { publicKey: cfg.publicKey, privateKey: cfg.privateKey });
    return true;
  } catch (err) {
    // Sin datos personales en el registro: solo el estado y el texto de EmailJS
    console.error('[email] No se pudo enviar:', err?.status ?? '', err?.text ?? err?.message ?? err);
    return false;
  }
}

/**
 * boleto_aprobado: una entrada (QR + enlace) por asiento.
 * @param {{ order_id: string, order_code: string, access_token: string, buyer_name: string,
 *           buyer_email: string, total?: number, total_amount?: number }} order
 * @param {{ token: string, row: string, number: number }[]} tickets
 * @returns {Promise<boolean>}
 */
export async function sendApproved(order, tickets) {
  try {
    const { appUrl, emailjs: cfg } = getServerEnv();
    return await sendTemplate(cfg.templateApproved, approvedParams(order, tickets, appUrl));
  } catch (err) {
    console.error('[email] No se pudo preparar el correo de aprobación:', err?.message ?? err);
    return false;
  }
}

/**
 * orden_rechazada: el motivo y un enlace para volver a comprar.
 * @param {{ order_code: string, buyer_name: string, buyer_email: string }} order
 * @param {string} reason
 * @returns {Promise<boolean>}
 */
export async function sendRejected(order, reason) {
  try {
    const { appUrl, emailjs: cfg } = getServerEnv();
    return await sendTemplate(cfg.templateRejected, rejectedParams(order, reason, appUrl));
  } catch (err) {
    console.error('[email] No se pudo preparar el correo de rechazo:', err?.message ?? err);
    return false;
  }
}
