'use client';

import { useEffect, useRef } from 'react';
import Rays from '@/components/brand/Rays';
import AnimatedNumber from '@/components/ui/AnimatedNumber';
import Button from '@/components/ui/Button';
import { useToast } from '@/components/ui/ToastProvider';
import { usePurchaseFlow, useSelection } from '@/context/PurchaseContext';
import { PRICE_VIP, ROWS, SEATS_PER_ROW, TOTAL_SEATS, formatMoney, seatCode, sortSeatCodes } from '@/lib/event';
import useMapZoom from './hooks/useMapZoom';
import useSeats from './hooks/useSeats';
import MapDock from './MapDock';
import SeatGrid, { GRID_CLASS, seatColumn } from './SeatGrid';

const SWATCH = 'size-4 flex-none rounded-[5px] border-[1.5px]';

const LEGEND = [
  { label: 'Disponible', swatch: 'border-line bg-surface' },
  { label: 'Tu selección', swatch: 'border-sel bg-sel' },
  {
    label: 'Ocupado',
    swatch: 'border-transparent bg-[repeating-linear-gradient(135deg,var(--taken)_0_3px,var(--taken-line)_3px_4.5px)]',
  },
  { label: `Preferencial · ${formatMoney(PRICE_VIP)}`, swatch: 'border-dashed border-band-line bg-band' },
];

/** "El asiento C7 ya fue ocupado…" o "Los asientos C7 y D2 ya fueron ocupados…" */
function lostSeatsMessage(codes) {
  if (codes.length === 1) return `El asiento ${codes[0]} ya fue ocupado y lo quitamos de tu selección`;
  const list = `${codes.slice(0, -1).join(', ')} y ${codes.at(-1)}`;
  return `Los asientos ${list} ya fueron ocupados y los quitamos de tu selección`;
}

/**
 * Tarjeta del mapa: saludo, título, disponibles, leyenda, escenario, grilla, ayuda y widget de zoom.
 * Pide los asientos con useSeats (se actualizan cada 15 s mientras el mapa está activo).
 * @param {{
 *   titleId: string,    // id del título (recibe el foco al entrar al paso)
 *   active?: boolean,   // false mientras se paga: el mapa queda escondido y sin actualizarse
 * }} props
 */
export default function SeatMap({ titleId, active = true }) {
  const { buyer } = usePurchaseFlow();
  const { selected, removeSeats } = useSelection();
  const { seats, loading, error, refresh } = useSeats({ active });
  const toast = useToast();
  const scrollerRef = useRef(null);
  const gridRef = useRef(null);
  const ready = seats.length > 0;
  const zoom = useMapZoom({ scrollerRef, gridRef, ready });
  const free = seats.filter((s) => s.status === 'available' && !selected.includes(s.id)).length;
  const firstName = buyer?.name.split(' ')[0];

  // Si al actualizar el mapa (o al recuperar la selección) una silla elegida ya no está libre, se quita.
  // Solo con el mapa activo: con una orden en curso, las sillas propias figuran ocupadas
  useEffect(() => {
    if (!active || !ready || !selected.length) return;
    const byId = new Map(seats.map((s) => [s.id, s]));
    const lost = selected.filter((id) => byId.get(id)?.status !== 'available');
    if (!lost.length) return;
    removeSeats(lost);
    const codes = lost.map((id) => byId.get(id)).filter(Boolean).map((s) => seatCode(s.row, s.number));
    if (codes.length) toast(lostSeatsMessage(sortSeatCodes(codes)));
  }, [active, seats, selected, ready, removeSeats, toast]);

  const hint = !zoom.measured
    ? ''
    : zoom.overflows
      ? 'Desliza para ver más asientos'
      : zoom.finePointer
        ? 'Pasa el cursor sobre un asiento para ver su precio'
        : 'Acerca el mapa con + para elegir con más comodidad';

  return (
    <section
      aria-labelledby={titleId}
      aria-busy={loading || undefined}
      className={
        'relative animate-card-in rounded-card border border-line bg-surface px-3 pt-[18px] pb-4 shadow-elev ' +
        'transition-colors duration-300 sm:px-[22px] sm:pt-[22px]'
      }
    >
      <div className="mb-3 flex animate-[rise_.5s_.25s_ease_both] items-center justify-between gap-3 px-1">
        <div>
          {firstName && <span className="mb-0.5 block text-[.8rem] font-extrabold text-accent-ink">Hola, {firstName}</span>}
          <h2 id={titleId} tabIndex={-1} className="text-[1.1rem] font-extrabold focus:outline-none">
            Elige tus asientos
          </h2>
          <p className="mt-0.5 text-[.82rem] font-semibold text-muted">
            {ready ? (
              <b className="text-ink">
                <AnimatedNumber value={free} startFrom={0} delay={500} duration={1200} />
              </b>
            ) : (
              <b className="text-ink">–</b>
            )}{' '}
            de {TOTAL_SEATS} disponibles
          </p>
        </div>
      </div>

      <ul aria-label="Leyenda" className="mb-[22px] flex list-none flex-wrap gap-x-4 gap-y-2 px-1">
        {LEGEND.map((item, i) => (
          <li
            key={item.label}
            style={{ animationDelay: `${0.3 + i * 0.06}s` }}
            className="flex animate-[rise_.4s_ease_both] items-center gap-[7px] text-[.8rem] font-bold text-muted"
          >
            <span aria-hidden="true" className={`${SWATCH} ${item.swatch}`} />
            {item.label}
          </li>
        ))}
      </ul>

      <Stage />

      <div
        ref={scrollerRef}
        className="overflow-x-auto overflow-y-hidden px-1 pt-2.5 pb-2 [contain:layout_paint] [scrollbar-color:var(--line)_transparent] [scrollbar-width:thin] [-webkit-overflow-scrolling:touch]"
      >
        {ready ? (
          <SeatGrid ref={gridRef} seats={seats} zoom={zoom.zoom} tiny={zoom.tiny} animateZoom={zoom.animate} finePointer={zoom.finePointer} />
        ) : error && !loading ? (
          <LoadError message={error.message} onRetry={refresh} />
        ) : (
          <SkeletonGrid />
        )}
      </div>

      {/* Si una actualización falla después de tener el mapa, se avisa sin ocultarlo */}
      {ready && error && (
        <p role="status" className="mt-2 px-1 text-[.8rem] font-bold text-danger-ink">
          No pudimos actualizar el mapa. Lo intentaremos de nuevo en unos segundos.
        </p>
      )}

      {ready && (
        <>
          <p
            className="mt-3.5 max-w-[calc(100%-190px)] animate-[rise_.5s_1.4s_ease_both] px-1 text-[.8rem] font-semibold text-muted max-lg:max-w-[calc(100%-150px)] max-lg:text-[.76rem]"
          >
            {hint}
          </p>
          <MapDock seats={seats} selected={selected} zoom={zoom} />
        </>
      )}
    </section>
  );
}

/** Escenario con los rayos del logo. */
function Stage() {
  return (
    <div aria-hidden="true" className="mx-auto mb-[22px] flex max-w-[620px] flex-col items-center short:mb-3.5">
      <Rays variant="stage" className="short:h-[22px]" />
      <div
        className={
          'grid h-11 w-full short:h-9 animate-[stage-in_.7s_.35s_cubic-bezier(.2,.9,.3,1.15)_both] place-items-center ' +
          'rounded-[12px_12px_999px_999px/12px_12px_22px_22px] bg-primary pl-[.4em] text-[.78rem] font-extrabold tracking-[.4em] text-on-primary shadow-elev ' +
          'transition-colors duration-300'
        }
      >
        ESCENARIO
      </div>
    </div>
  );
}

/** Grilla gris del mismo tamaño que el mapa mientras llegan los datos (sin animación). */
function SkeletonGrid() {
  return (
    <div style={{ '--zoom': 1 }} className={GRID_CLASS}>
      <span className="sr-only" role="status">
        Cargando asientos…
      </span>
      {ROWS.map((row, r) =>
        Array.from({ length: SEATS_PER_ROW }, (_, c) => (
          <span
            key={`${row}${c}`}
            aria-hidden="true"
            style={{ gridRow: r + 1, gridColumn: seatColumn(c + 1) }}
            className="aspect-square w-full rounded-[26%] bg-surface-3"
          />
        )),
      )}
    </div>
  );
}

/** Error al cargar el mapa por primera vez. */
function LoadError({ message, onRetry }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      <p className="text-[.92rem] font-bold text-ink">No pudimos cargar el mapa de asientos.</p>
      <p className="text-[.85rem] font-semibold text-muted">{message}</p>
      <Button variant="ghost" className="h-11 px-5 text-[.92rem]" onClick={onRetry}>
        Reintentar
      </Button>
    </div>
  );
}
