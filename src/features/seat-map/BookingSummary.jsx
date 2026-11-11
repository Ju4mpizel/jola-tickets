'use client';

import { useEffect, useMemo, useRef } from 'react';
import AnimatedNumber from '@/components/ui/AnimatedNumber';
import Button from '@/components/ui/Button';
import { IconArrowRight } from '@/components/ui/icons';
import { useAnnounce } from '@/components/ui/ToastProvider';
import { useOrder, useSelection } from '@/context/PurchaseContext';
import useHold from '@/features/checkout/hooks/useHold';
import { HOLD_MINUTES, MAX_SEATS, ROWS, formatMoney, seatCode } from '@/lib/event';
import useSeats from './hooks/useSeats';

/*
 * Celular: barra fija abajo (fondo sólido, sin backdrop-filter). Tablet: centrada, máx. 640 px.
 * PC: panel en la columna lateral de 360 px. Celular horizontal: una sola fila compacta.
 */
const PANEL =
  'fixed inset-x-0 bottom-0 z-20 rounded-t-[22px] border-t border-line bg-surface px-4 pt-3.5 ' +
  'pb-[calc(14px+env(safe-area-inset-bottom))] shadow-[0_-10px_30px_-12px_rgba(10,31,92,.18)] ' +
  'animate-[sheet-up_.5s_.3s_ease_both] transition-colors duration-300 ' +
  'min-[560px]:max-lg:mx-auto min-[560px]:max-lg:max-w-[640px] min-[560px]:max-lg:border-x ' +
  'lg:static lg:rounded-card lg:border lg:p-5 lg:shadow-elev lg:animate-[rise_.5s_.2s_ease_both] ' +
  'short:flex short:items-center short:gap-3.5 short:rounded-t-[18px] short:pt-2.5 short:pb-[calc(10px+env(safe-area-inset-bottom))]';

const CHIP =
  'flex h-8 flex-none animate-chip items-center gap-1.5 rounded-[10px] border border-line bg-surface-2 pr-1.5 pl-[11px] ' +
  'text-[.85rem] font-extrabold text-ink transition-colors duration-200 pointer-fine:hover:border-danger';

/**
 * Resumen de la reserva: asientos elegidos (chips para quitarlos), desglose en PC, total
 * informativo y botón para retener los asientos (POST /holds). En PC lleva debajo la ayuda.
 * Publica su altura en --sum-h para que el widget del mapa flote justo encima de la barra.
 */
export default function BookingSummary() {
  const { selected, toggleSeat } = useSelection();
  const { order } = useOrder();
  const { seats } = useSeats({ active: false });
  const { creating, createHold } = useHold();
  const announce = useAnnounce();
  const panelRef = useRef(null);
  const chipsRef = useRef(null);
  const titleRef = useRef(null);

  // Asientos elegidos con sus datos, ordenados por fila y número
  const picked = useMemo(() => {
    const byId = new Map(seats.map((s) => [s.id, s]));
    return selected
      .map((id) => byId.get(id))
      .filter(Boolean)
      .sort((a, b) => ROWS.indexOf(a.row) - ROWS.indexOf(b.row) || a.number - b.number);
  }, [seats, selected]);

  const n = selected.length;
  const vip = picked.filter((s) => s.vip);
  const general = picked.filter((s) => !s.vip);
  // Solo informativo: el total que se cobra lo calcula el servidor
  const total = picked.reduce((sum, s) => sum + s.price, 0);

  // Altura de la barra en --sum-h (0 en PC o si está escondida); solo se escribe si cambió
  useEffect(() => {
    const el = panelRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const root = document.documentElement;
    const desktop = window.matchMedia('(min-width: 1024px)');
    let last = -1;
    const update = () => {
      const h = desktop.matches ? 0 : Math.round(el.offsetHeight);
      if (h === last) return;
      last = h;
      root.style.setProperty('--sum-h', `${h}px`);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    desktop.addEventListener('change', update);
    return () => {
      ro.disconnect();
      desktop.removeEventListener('change', update);
      root.style.removeProperty('--sum-h');
    };
  }, []);

  /** Quitar desde un chip: el foco pasa al chip vecino (o al título si no queda ninguno). */
  function removeChip(seat, index) {
    const neighbor = picked[index + 1] ?? picked[index - 1];
    toggleSeat(seat.id);
    announce(`Asiento ${seatCode(seat.row, seat.number)} liberado`);
    requestAnimationFrame(() => {
      const next = neighbor && chipsRef.current?.querySelector(`[data-chip="${neighbor.id}"]`);
      (next || titleRef.current)?.focus();
    });
  }

  return (
    <>
      <aside ref={panelRef} aria-label="Resumen de tu reserva" className={PANEL}>
        <div className="flex items-center justify-between gap-2.5 short:min-w-0 short:flex-1">
          <div className="min-w-0">
            <h2 ref={titleRef} tabIndex={-1} className="text-base font-extrabold focus:outline-none short:text-[.9rem]">
              Tu reserva
            </h2>
            <p className="text-[.8rem] font-semibold text-muted" aria-live="polite">
              {n ? `${n} de ${MAX_SEATS} asientos` : 'Ningún asiento elegido'}
            </p>
          </div>
        </div>

        <div
          ref={chipsRef}
          className="flex min-h-[52px] items-center gap-2 overflow-x-auto py-2.5 [scrollbar-width:none] lg:flex-wrap lg:overflow-visible short:hidden [&::-webkit-scrollbar]:hidden"
        >
          {picked.length ? (
            picked.map((s, i) => {
              const code = seatCode(s.row, s.number);
              return (
                <button
                  key={s.id}
                  type="button"
                  data-chip={s.id}
                  aria-label={`Quitar asiento ${code}`}
                  onClick={() => removeChip(s, i)}
                  className={CHIP}
                >
                  {code}
                  <span aria-hidden="true" className="grid size-5 place-items-center rounded-md text-[.85rem] text-muted">
                    ×
                  </span>
                </button>
              );
            })
          ) : (
            <span className="text-[.85rem] font-semibold text-muted">
              <span className="pointer-fine:hidden">Toca</span>
              <span className="hidden pointer-fine:inline">Haz clic en</span> un asiento libre para empezar
            </span>
          )}
        </div>

        {picked.length > 0 && (
          <ul className="mb-1.5 hidden list-none border-t border-dashed border-line pt-3 lg:block">
            {general.length > 0 && (
              <li className="flex justify-between py-[3px] text-[.88rem] font-semibold text-muted">
                <span>General × {general.length}</span>
                <span>{formatMoney(general.reduce((sum, s) => sum + s.price, 0))}</span>
              </li>
            )}
            {vip.length > 0 && (
              <li className="flex justify-between py-[3px] text-[.88rem] font-semibold text-muted">
                <span>Preferencial × {vip.length}</span>
                <span>{formatMoney(vip.reduce((sum, s) => sum + s.price, 0))}</span>
              </li>
            )}
          </ul>
        )}

        <div className="flex items-center gap-3.5 short:flex-none short:gap-3">
          <div>
            <small className="block text-[.72rem] font-bold tracking-[.06em] text-muted uppercase">Total</small>
            <b className="text-2xl font-extrabold tracking-[-.02em] short:text-[1.2rem]">
              <AnimatedNumber value={total} prefix="Bs " />
            </b>
          </div>
          <Button
            className="flex-1 short:h-11 short:flex-none short:px-[18px]"
            disabled={!n || !!order}
            loading={creating}
            loadingText="Reservando"
            icon={<IconArrowRight />}
            onClick={() => createHold(selected, seats)}
          >
            {n ? `Pagar ${n} entrada${n > 1 ? 's' : ''}` : 'Continuar'}
          </Button>
        </div>
      </aside>

      <section
        aria-labelledby="help-title"
        className="hidden animate-[rise_.5s_.45s_ease_both] rounded-card border border-line bg-surface p-[18px] text-[.85rem] leading-normal font-semibold text-muted shadow-elev transition-colors duration-300 lg:block"
      >
        <h3 id="help-title" className="mb-1.5 text-[.95rem] text-ink">
          ¿Cómo funciona?
        </h3>
        Haz clic en los asientos libres para elegirlos (máximo {MAX_SEATS}). Al tocar «Pagar» los guardamos {HOLD_MINUTES} minutos
        mientras completas la transferencia. Con el teclado, usa las flechas y Enter.
      </section>
    </>
  );
}
