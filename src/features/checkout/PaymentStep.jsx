'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/ui/ToastProvider';
import { holdDeadline, useOrder, usePurchaseFlow } from '@/context/PurchaseContext';
import { PAYMENT, formatMoney } from '@/lib/event';
import { copyText } from '@/lib/feedback';
import useHold from './hooks/useHold';
import HoldTimer from './HoldTimer';
import ReceiptUpload from './ReceiptUpload';

const CARD = 'rounded-card border border-line bg-surface p-5 shadow-elev transition-colors duration-300';
const GHOST_BTN =
  'inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-[14px] border border-line bg-surface-2 px-3 text-[.9rem] font-extrabold text-ink ' +
  'transition-[transform,border-color] duration-150 active:scale-[.97] pointer-fine:hover:border-cyan-strong';

/** Placeholder mientras no exista public/images/qr-pago.png (también es lo que se descarga). */
const EXAMPLE_QR =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">' +
      '<rect width="240" height="240" fill="#fff"/>' +
      [
        [16, 16],
        [164, 16],
        [16, 164],
      ]
        .map(
          ([x, y]) =>
            `<rect x="${x}" y="${y}" width="60" height="60" rx="6" fill="#0A1F5C"/>` +
            `<rect x="${x + 9}" y="${y + 9}" width="42" height="42" rx="3" fill="#fff"/>` +
            `<rect x="${x + 18}" y="${y + 18}" width="24" height="24" rx="2" fill="#0A1F5C"/>`,
        )
        .join('') +
      '<rect x="20" y="98" width="200" height="44" rx="10" fill="#7FD6E6"/>' +
      '<text x="120" y="127" text-anchor="middle" font-family="sans-serif" font-size="19" font-weight="700" fill="#0A1F5C">QR de ejemplo</text>' +
      '<text x="196" y="200" text-anchor="middle" font-family="sans-serif" font-size="13" font-weight="700" fill="#E0445F">EJEMPLO</text>' +
      '</svg>',
  );

/**
 * Paso "pago": temporizador, total del servidor y asientos; QR del colegio con descarga y datos
 * de la cuenta; código de orden para la glosa; los tres pasos; y la subida del comprobante.
 * @param {{ titleId: string }} props   id del título (recibe el foco al entrar al paso)
 */
export default function PaymentStep({ titleId }) {
  const { goBack } = usePurchaseFlow();
  const { order } = useOrder();
  const { expireHold } = useHold();
  const toast = useToast();
  const uploading = useRef(false);
  const expiredDuringUpload = useRef(false);

  // Si el tiempo se acaba mientras sube el comprobante, decide el servidor:
  // si lo acepta, la compra sigue; si responde HOLD_EXPIRED, recién ahí se vuelve al mapa
  const onExpire = useCallback(() => {
    if (uploading.current) expiredDuringUpload.current = true;
    else expireHold();
  }, [expireHold]);
  const onUploadStart = useCallback(() => {
    uploading.current = true;
  }, []);
  const onUploadEnd = useCallback(
    (ok, expired) => {
      uploading.current = false;
      if (!ok && (expired || expiredDuringUpload.current)) expireHold();
      expiredDuringUpload.current = false;
    },
    [expireHold],
  );

  if (!order) return null;
  const total = formatMoney(order.total);

  async function copy(text, done) {
    toast((await copyText(text)) ? done : 'No pudimos copiar. Mantén presionado el texto para copiarlo.');
  }

  return (
    <main className="grid animate-card-in gap-4 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start lg:gap-6">
      <div className="grid min-w-0 gap-4">
        {/* Resumen: tiempo, total y asientos */}
        <section aria-labelledby={titleId} className={CARD}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <span className="mb-0.5 block text-[.8rem] font-extrabold text-accent-ink">Tus asientos están guardados</span>
              <h2 id={titleId} tabIndex={-1} className="text-[1.15rem] font-extrabold focus:outline-none">
                Paga tu reserva
              </h2>
            </div>
            <HoldTimer size="lg" deadline={holdDeadline(order)} onExpire={onExpire} />
          </div>

          <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-dashed border-line pt-4">
            <div>
              <small className="block text-[.72rem] font-bold tracking-[.06em] text-muted uppercase">Total a pagar</small>
              <b className="text-[1.9rem] leading-tight font-extrabold tracking-[-.02em] tabular-nums">{total}</b>
            </div>
            {order.seats?.length > 0 && (
              <ul aria-label="Asientos" className="flex list-none flex-wrap justify-end gap-1.5">
                {order.seats.map((code) => (
                  <li key={code} className="rounded-[10px] border border-line bg-surface-2 px-2.5 py-1 text-[.85rem] font-extrabold">
                    {code}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <ol className="mt-4 grid list-none gap-2.5">
            {[
              <>
                Paga exactamente <b className="text-ink">{total}</b> con el QR desde la app de tu banco.
              </>,
              <>
                Escribe el código <b className="text-ink">{order.order_code}</b> en la glosa.
              </>,
              <>Sube aquí la captura del comprobante.</>,
            ].map((text, i) => (
              <li key={i} className="flex items-start gap-3 text-[.9rem] font-semibold text-muted">
                <span
                  aria-hidden="true"
                  className="grid size-7 flex-none place-items-center rounded-full bg-primary text-[.85rem] font-extrabold text-on-primary"
                >
                  {i + 1}
                </span>
                <span className="pt-0.5">
                  <span className="sr-only">Paso {i + 1}: </span>
                  {text}
                </span>
              </li>
            ))}
          </ol>
        </section>

        <QrCard total={total} code={order.order_code} onCopy={copy} />
      </div>

      <div className="grid min-w-0 gap-4 lg:sticky lg:top-6">
        {/* Código para la glosa */}
        <section aria-labelledby="order-code-title" className={CARD}>
          <h3 id="order-code-title" className="text-[.8rem] font-bold tracking-[.06em] text-muted uppercase">
            Código de orden
          </h3>
          <div className="mt-2 flex items-center justify-between gap-3 rounded-2xl border-[1.5px] border-dashed border-cyan-strong bg-band px-4 py-3">
            <span className="font-brand text-[1.5rem] font-bold tracking-[.05em] break-all">{order.order_code}</span>
            <button type="button" className={`${GHOST_BTN} flex-none`} onClick={() => copy(order.order_code, 'Código copiado')}>
              Copiar código
            </button>
          </div>
          <p className="mt-3 text-[.9rem] font-semibold text-muted">
            Escribe <b className="text-ink">{order.order_code}</b> en la glosa o descripción de tu transferencia.
          </p>
        </section>

        <ReceiptUpload onUploadStart={onUploadStart} onUploadEnd={onUploadEnd} />

        <button
          type="button"
          onClick={goBack}
          className="justify-self-center rounded-lg px-2 py-1 text-[.9rem] font-bold text-muted underline underline-offset-4 pointer-fine:hover:text-ink"
        >
          Cancelar y volver al mapa
        </button>
      </div>
    </main>
  );
}

/**
 * QR del colegio en grande, con descarga (para abrirlo desde la app del banco) y los datos
 * de la cuenta como alternativa. Si la imagen real no existe, muestra el placeholder.
 */
function QrCard({ total, code, onCopy }) {
  const [missing, setMissing] = useState(false);
  const imgRef = useRef(null);

  // Si la imagen falló antes de hidratar, onError no llega: se revisa al montar
  useEffect(() => {
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth === 0) setMissing(true);
  }, []);

  const accountText = [
    `Banco: ${PAYMENT.bank}`,
    `Titular: ${PAYMENT.holder}`,
    `Cuenta: ${PAYMENT.account}`,
    `Monto: ${total}`,
    `Glosa: ${code}`,
  ].join('\n');

  return (
    <section aria-labelledby="qr-title" className={CARD}>
      <h3 id="qr-title" className="text-base font-extrabold">
        Paga con QR
      </h3>
      <p className="mt-0.5 text-[.85rem] font-semibold text-muted">Escanéalo con la app de tu banco o descárgalo y ábrelo desde ahí.</p>

      <div className="mx-auto mt-4 grid aspect-square w-full max-w-[280px] place-items-center rounded-2xl bg-white p-3 shadow-elev-sm">
        {missing ? (
          // eslint-disable-next-line @next/next/no-img-element -- data URL local, sin optimizar
          <img src={EXAMPLE_QR} alt="QR de ejemplo (todavía no está el QR real del colegio)" className="size-full" />
        ) : (
          <Image
            ref={imgRef}
            src={PAYMENT.qrSrc}
            alt={`Código QR para pagar a ${PAYMENT.holder}`}
            width={512}
            height={512}
            unoptimized
            onError={() => setMissing(true)}
            className="size-full object-contain"
          />
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2.5">
        <a
          href={missing ? EXAMPLE_QR : PAYMENT.qrSrc}
          download={missing ? 'qr-de-ejemplo.svg' : 'qr-pago-jola.png'}
          className={GHOST_BTN}
        >
          Descargar QR
        </a>
        <button type="button" className={GHOST_BTN} onClick={() => onCopy(accountText, 'Datos de la cuenta copiados')}>
          Copiar datos de la cuenta
        </button>
      </div>

      <dl className="mt-4 grid gap-1 text-[.85rem] font-semibold">
        {[
          ['Banco', PAYMENT.bank],
          ['Titular', PAYMENT.holder],
          ['Cuenta', PAYMENT.account],
        ].map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3">
            <dt className="text-muted">{label}</dt>
            <dd className="text-right break-all">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
