'use client';

import { useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import { IconCheck } from '@/components/ui/icons';
import { useToast } from '@/components/ui/ToastProvider';
import { useOrder, usePurchaseFlow } from '@/context/PurchaseContext';
import { EVENT } from '@/lib/event';
import { copyText } from '@/lib/feedback';

const GHOST_BTN =
  'inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-[14px] border border-line bg-surface-2 px-3 text-[.9rem] font-extrabold text-ink ' +
  'transition-[transform,border-color] duration-150 active:scale-[.97] pointer-fine:hover:border-cyan-strong';

/** Enlace permanente para ver el estado de la orden desde cualquier dispositivo. */
export const orderUrl = (origin, order) =>
  `${origin}/orden/${encodeURIComponent(order.order_id)}?k=${encodeURIComponent(order.access_token)}`;

/**
 * Paso "revision": el comprobante llegó. Muestra el código, el enlace de la orden (copiar y
 * compartir) y permite empezar otra compra.
 * Va en su propio archivo por tener estado propio (enlace y soporte de compartir) y por tamaño.
 * @param {{ titleId: string }} props   id del título (recibe el foco al entrar al paso)
 */
export default function ReviewStep({ titleId }) {
  const { buyer, goTo } = usePurchaseFlow();
  const { order, reset } = useOrder();
  const toast = useToast();
  const [link, setLink] = useState('');
  const [canShare, setCanShare] = useState(false);

  // El enlace usa el origen real (solo existe en el navegador)
  useEffect(() => {
    if (!order) return;
    setLink(orderUrl(window.location.origin, order));
    setCanShare(typeof navigator.share === 'function');
  }, [order]);

  if (!order) return null;

  async function share() {
    try {
      await navigator.share({ title: `Mi compra · ${EVENT.name}`, text: `Orden ${order.order_code}`, url: link });
    } catch (err) {
      if (err?.name !== 'AbortError') toast('No pudimos compartir. Copia el enlace.');
    }
  }

  function newPurchase() {
    reset();
    goTo('asientos');
  }

  return (
    <main className="mx-auto grid w-full max-w-[560px] animate-card-in gap-4">
      <section
        aria-labelledby={titleId}
        className="rounded-card border border-line bg-surface px-5 pt-7 pb-5 text-center shadow-elev transition-colors duration-300"
      >
        <span
          aria-hidden="true"
          className="mx-auto grid size-16 animate-pop place-items-center rounded-full bg-ok text-white shadow-[0_8px_24px_-8px_rgba(34,176,125,.6)] [&_svg]:size-8"
        >
          <IconCheck />
        </span>
        <h2 id={titleId} tabIndex={-1} className="mt-4 text-[1.3rem] font-extrabold focus:outline-none">
          ¡Comprobante recibido!
        </h2>
        <p className="mt-1.5 text-[.95rem] font-semibold text-muted">
          La directiva lo revisará y te enviaremos tus entradas a{' '}
          <b className="break-all text-ink">{buyer?.email}</b>.
        </p>
        <p className="mt-1.5 text-[.85rem] font-semibold text-muted">Revisa también tu carpeta de Spam o Promociones.</p>

        <div className="mt-5 rounded-2xl border-[1.5px] border-dashed border-cyan-strong bg-band px-4 py-3">
          <small className="block text-[.72rem] font-bold tracking-[.06em] text-muted uppercase">Código de orden</small>
          <span className="font-brand text-[1.5rem] font-bold tracking-[.05em]">{order.order_code}</span>
        </div>

        <div className="mt-5 text-left">
          <label htmlFor="order-link" className="text-[.85rem] font-bold text-ink">
            Enlace de tu compra
          </label>
          <input
            id="order-link"
            readOnly
            value={link}
            onFocus={(e) => e.target.select()}
            className="mt-1.5 h-11 w-full rounded-[14px] border border-line bg-surface-2 px-3 text-[.85rem] font-semibold text-muted"
          />
          <p className="mt-1.5 text-[.82rem] font-semibold text-muted">Guarda este enlace para ver el estado de tu compra.</p>
          <div className="mt-3 flex flex-wrap gap-2.5">
            <button
              type="button"
              className={GHOST_BTN}
              disabled={!link}
              onClick={async () => toast((await copyText(link)) ? 'Enlace copiado' : 'No pudimos copiar el enlace')}
            >
              Copiar enlace
            </button>
            {canShare && (
              <button type="button" className={GHOST_BTN} onClick={share}>
                Compartir
              </button>
            )}
          </div>
        </div>

        <Button variant="ghost" className="mt-5 w-full" onClick={newPurchase}>
          Hacer otra compra
        </Button>
      </section>
    </main>
  );
}
