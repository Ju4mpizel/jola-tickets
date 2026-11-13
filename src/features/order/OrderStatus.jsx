'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import Topbar from '@/components/layout/Topbar';
import Button, { Spinner } from '@/components/ui/Button';
import Confetti from '@/components/ui/Confetti';
import { IconArrowRight, IconCheck, IconClock, IconTicket } from '@/components/ui/icons';
import { EVENT, ORDER_REFRESH_MS, formatMoney, seatCode } from '@/lib/event';
import { devSimulateReview, getOrder } from '@/services/api';

const CARD = 'rounded-card border border-line bg-surface px-5 pt-7 pb-6 text-center shadow-elev transition-colors duration-300';
const LINK_BTN =
  'inline-flex h-[54px] items-center justify-center gap-2.5 rounded-2xl bg-primary px-5 text-base font-extrabold text-on-primary ' +
  'shadow-[0_8px_20px_-8px_rgba(10,31,92,.5)] transition-transform duration-150 active:scale-[.97]';

/** Ícono redondo del estado. */
function StatusIcon({ tone, children }) {
  const tones = {
    ok: 'bg-ok text-white',
    wait: 'bg-band text-accent-ink border-[1.5px] border-band-line',
    bad: 'bg-[rgba(224,68,95,.12)] text-danger-ink border-[1.5px] border-[rgba(224,68,95,.35)]',
  };
  return (
    <span aria-hidden="true" className={`mx-auto grid size-16 animate-pop place-items-center rounded-full [&_svg]:size-8 ${tones[tone]}`}>
      {children}
    </span>
  );
}

/** Asientos como etiquetas: "A1", "C7". */
function SeatList({ seats }) {
  return (
    <ul aria-label="Asientos" className="mt-4 flex list-none flex-wrap justify-center gap-1.5">
      {seats.map((s) => (
        <li key={`${s.row}${s.number}`} className="rounded-[10px] border border-line bg-surface-2 px-2.5 py-1 text-[.85rem] font-extrabold">
          {seatCode(s.row, s.number)}
        </li>
      ))}
    </ul>
  );
}

/**
 * Estado de una orden (GET /orders/{orderId} con X-Order-Token = ?k=). Se actualiza cada 30 s
 * mientras está en revisión. Muestra: en revisión, aprobada (con un enlace por entrada),
 * rechazada (con el motivo) o "No encontramos tu orden".
 * @param {{ orderId: string, token: string, mock?: string }} props
 *   mock: solo en desarrollo con datos simulados, 'approved' o 'rejected' para probar las vistas
 */
export default function OrderStatus({ orderId, token, mock }) {
  const [state, setState] = useState({ status: 'loading', order: null, error: null });
  const celebrated = useRef(false);
  const [confetti, setConfetti] = useState(0);

  const load = useCallback(
    async (signal) => {
      if (!token) {
        setState({ status: 'not_found', order: null, error: null });
        return;
      }
      try {
        const order = await getOrder(orderId, token, { signal });
        setState({ status: 'ready', order, error: null });
      } catch (err) {
        if (err?.name === 'AbortError') return;
        if (err?.error === 'ORDER_NOT_FOUND' || err?.status === 404) setState({ status: 'not_found', order: null, error: null });
        else setState((s) => ({ ...s, status: s.order ? 'ready' : 'error', error: err }));
      }
    },
    [orderId, token],
  );

  // Primera carga (en desarrollo, antes simula la revisión si se pidió con ?mock=)
  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      if (mock === 'approved' || mock === 'rejected') await devSimulateReview(orderId, mock);
      await load(ctrl.signal);
    })();
    return () => ctrl.abort();
  }, [load, mock, orderId]);

  const order = state.order;
  const pending = order?.status === 'pending_review';

  // En revisión: se actualiza cada 30 s (solo con la pestaña visible) y al volver a ella
  useEffect(() => {
    if (!pending) return;
    const ctrl = new AbortController();
    const tick = () => document.visibilityState === 'visible' && load(ctrl.signal);
    const id = setInterval(tick, ORDER_REFRESH_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
      ctrl.abort();
    };
  }, [pending, load]);

  // Orden resuelta: si es la compra en curso de esta pestaña, se cierra (así "Volver a comprar"
  // empieza de cero en lugar de mostrar otra vez la pantalla de revisión)
  const resolved = order && order.status !== 'pending_review' && order.status !== 'awaiting_payment';
  useEffect(() => {
    if (!resolved) return;
    try {
      const current = JSON.parse(sessionStorage.getItem('jola-order') || 'null');
      if (current?.order_id === orderId) {
        sessionStorage.removeItem('jola-order');
        sessionStorage.removeItem('jola-selection');
      }
    } catch {
      /* sin almacenamiento: nada que limpiar */
    }
  }, [resolved, orderId]);

  // Confeti una sola vez por orden aprobada (no en cada recarga)
  useEffect(() => {
    if (order?.status !== 'approved' || celebrated.current) return;
    celebrated.current = true;
    const key = `jola-celebrated-${orderId}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, '1');
    } catch {
      /* sin almacenamiento: se celebra igual */
    }
    setConfetti(1);
  }, [order?.status, orderId]);

  return (
    <div className="mx-auto max-w-[1180px] px-3.5 pt-3.5 pb-[calc(32px+env(safe-area-inset-bottom))] max-[380px]:px-2.5 lg:px-7 lg:pt-6">
      <Topbar className="min-[560px]:max-lg:mx-auto min-[560px]:max-lg:max-w-[560px]" />
      <main className="mx-auto grid w-full max-w-[560px] animate-card-in gap-4">
        <Content state={state} onRetry={() => load()} />
      </main>
      <Confetti trigger={confetti} />
    </div>
  );
}

function Content({ state, onRetry }) {
  const { status, order, error } = state;

  if (status === 'loading') {
    return (
      <section className={CARD} aria-busy="true">
        <Spinner className="mx-auto text-accent-ink" />
        <p role="status" className="mt-3 text-[.95rem] font-semibold text-muted">
          Buscando tu orden…
        </p>
      </section>
    );
  }

  if (status === 'not_found') {
    return (
      <section className={CARD} aria-labelledby="order-title">
        <StatusIcon tone="bad">
          <span className="text-[1.6rem] font-extrabold">?</span>
        </StatusIcon>
        <h1 id="order-title" className="mt-4 text-[1.3rem] font-extrabold">
          No encontramos tu orden
        </h1>
        <p className="mt-1.5 text-[.95rem] font-semibold text-muted">
          Revisa que el enlace esté completo, tal como lo guardaste al enviar tu comprobante.
        </p>
        <Link href="/" className={`${LINK_BTN} mt-5 w-full`}>
          Ir al inicio
        </Link>
      </section>
    );
  }

  if (status === 'error') {
    return (
      <section className={CARD} role="alert">
        <h1 className="text-[1.2rem] font-extrabold">No pudimos cargar tu orden</h1>
        <p className="mt-1.5 text-[.95rem] font-semibold text-muted">{error?.message}</p>
        <Button variant="ghost" className="mt-5 w-full" onClick={onRetry}>
          Reintentar
        </Button>
      </section>
    );
  }

  const code = <p className="mt-1 font-brand text-[1.1rem] font-bold tracking-[.05em] text-accent-ink">{order.order_code}</p>;

  if (order.status === 'approved') {
    return (
      <section className={CARD} aria-labelledby="order-title">
        <StatusIcon tone="ok">
          <IconCheck />
        </StatusIcon>
        <h1 id="order-title" className="mt-4 text-[1.4rem] font-extrabold">
          ¡Tus entradas están listas!
        </h1>
        {code}
        <p className="mt-1.5 text-[.95rem] font-semibold text-muted">
          {EVENT.name} · {EVENT.dateLong}. Muestra el QR de cada entrada en la puerta.
        </p>
        <ul className="mt-5 grid list-none gap-2.5 text-left">
          {(order.tickets ?? []).map((t) => (
            <li key={t.token}>
              <Link
                href={`/tickets/${encodeURIComponent(t.token)}`}
                className="flex items-center gap-3 rounded-2xl border border-line bg-surface-2 px-4 py-3 font-extrabold transition-colors duration-200 pointer-fine:hover:border-cyan-strong [&_svg]:size-5"
              >
                <IconTicket className="text-accent-ink" />
                <span className="flex-1">Entrada {seatCode(t.row, t.number)}</span>
                <IconArrowRight className="text-muted" />
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[.85rem] font-semibold text-muted">
          También te enviamos las entradas por correo. Si no lo ves, revisa también tu carpeta de Spam o Promociones.
        </p>
      </section>
    );
  }

  if (order.status === 'rejected') {
    return (
      <section className={CARD} aria-labelledby="order-title">
        <StatusIcon tone="bad">
          <span className="text-[1.6rem] font-extrabold">!</span>
        </StatusIcon>
        <h1 id="order-title" className="mt-4 text-[1.3rem] font-extrabold">
          No pudimos confirmar tu pago
        </h1>
        {code}
        {order.reject_reason && (
          <p className="mt-4 rounded-2xl border border-[rgba(224,68,95,.35)] bg-[rgba(224,68,95,.08)] px-4 py-3 text-left text-[.92rem] font-semibold">
            <span className="block text-[.72rem] font-bold tracking-[.06em] text-danger-ink uppercase">Motivo</span>
            {order.reject_reason}
          </p>
        )}
        <p className="mt-3 text-[.9rem] font-semibold text-muted">Los asientos se liberaron. Puedes volver a elegirlos y pagar de nuevo.</p>
        <Link href="/?paso=asientos" className={`${LINK_BTN} mt-5 w-full`}>
          Volver a comprar
        </Link>
      </section>
    );
  }

  if (order.status === 'pending_review') {
    return (
      <section className={CARD} aria-labelledby="order-title">
        <StatusIcon tone="wait">
          <IconClock />
        </StatusIcon>
        <h1 id="order-title" className="mt-4 text-[1.3rem] font-extrabold">
          En revisión
        </h1>
        {code}
        <p className="mt-1.5 text-[.95rem] font-semibold text-muted">
          La directiva está revisando tu comprobante. Cuando lo apruebe te enviaremos tus entradas por correo.
        </p>
        <SeatList seats={order.seats} />
        <p className="mt-4 text-[1.6rem] font-extrabold tracking-[-.02em] tabular-nums">{formatMoney(order.total)}</p>
        <p className="mt-3 text-[.8rem] font-semibold text-muted">Esta página se actualiza sola cada 30 segundos.</p>
      </section>
    );
  }

  // awaiting_payment o cancelled: el enlace llegó antes de enviar el comprobante, o la reserva se canceló
  const waiting = order.status === 'awaiting_payment';
  return (
    <section className={CARD} aria-labelledby="order-title">
      <StatusIcon tone={waiting ? 'wait' : 'bad'}>{waiting ? <IconClock /> : <span className="text-[1.6rem] font-extrabold">!</span>}</StatusIcon>
      <h1 id="order-title" className="mt-4 text-[1.3rem] font-extrabold">
        {waiting ? 'Todavía no recibimos tu comprobante' : 'Esta reserva se canceló'}
      </h1>
      {code}
      <Link href="/?paso=asientos" className={`${LINK_BTN} mt-5 w-full`}>
        {waiting ? 'Volver a la compra' : 'Volver a comprar'}
      </Link>
    </section>
  );
}
