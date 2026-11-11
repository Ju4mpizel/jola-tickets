import { RECEIPT_TARGET_BYTES } from './event';

/** Lado mayor (px) con el que se empieza a reducir; una captura sigue legible con esto. */
const START_SIDE = 2000;
const MIN_QUALITY = 0.5;
const MAX_ATTEMPTS = 7;

async function loadBitmap(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      /* algunos navegadores no lo soportan con WEBP: sigue con <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const toBlob = (canvas, quality) => new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));

/**
 * Reduce la captura del comprobante por debajo de 2 MB (JPEG), bajando primero la calidad
 * y después el tamaño. Si ya pesa menos, o no es una imagen (PDF), se devuelve igual.
 * Solo en el navegador.
 * @param {File} file
 * @param {{ maxBytes?: number }} [options]
 * @returns {Promise<File>}
 */
export default async function compressImage(file, { maxBytes = RECEIPT_TARGET_BYTES } = {}) {
  if (!file.type.startsWith('image/') || file.size <= maxBytes) return file;

  const source = await loadBitmap(file);
  const width = source.width;
  const height = source.height;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  let side = Math.min(START_SIDE, Math.max(width, height));
  let quality = 0.85;
  let blob = null;

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const scale = Math.min(1, side / Math.max(width, height));
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    // Fondo blanco: los PNG con transparencia no quedan negros al pasar a JPEG
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    blob = await toBlob(canvas, quality);
    if (blob && blob.size <= maxBytes) break;
    if (quality > MIN_QUALITY) quality = Math.max(MIN_QUALITY, quality - 0.15);
    else side = Math.round(side * 0.8);
  }
  source.close?.();
  if (!blob) return file;

  const name = `${file.name.replace(/\.[^.]+$/, '') || 'comprobante'}.jpg`;
  return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() });
}
