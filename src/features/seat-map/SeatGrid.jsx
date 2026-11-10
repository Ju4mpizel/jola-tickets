'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AISLE_AFTER, ROWS, SEATS_PER_ROW, VIP_ROWS } from '@/lib/event';
import Seat from './Seat';

/** Ancho mínimo (px) de una silla para mostrar su número. */
const TINY_SEAT_PX = 20;

/**
 * Plantilla de la grilla: letra | 10 sillas | pasillo | 10 sillas | letra.
 * Todo escala con --zoom (el paso 4 solo tiene que cambiar esa variable).
 * La usa también el esqueleto de carga de SeatMap.
 */
export const GRID_CLASS =
  'relative mx-auto grid w-[calc(100%*var(--zoom))] items-center ' +
  'grid-cols-[22px_repeat(10,minmax(0,1fr))_calc(8px+6px*var(--zoom))_repeat(10,minmax(0,1fr))_22px] ' +
  '[row-gap:calc(6px+3px*var(--zoom))] [column-gap:calc(2px+1.5px*var(--zoom))] ' +
  'transition-[width] duration-[350ms] ease-[cubic-bezier(.4,0,.2,1)]';

/** Columna de la grilla para el asiento n (1–20): deja la columna 12 para el pasillo. */
export const seatColumn = (number) => (number <= AISLE_AFTER ? number + 1 : number + 2);

const ROW_LABEL =
  'sticky z-[2] grid self-stretch place-items-center rounded-lg bg-surface text-[.75rem] font-extrabold text-muted ' +
  'animate-[rise_.4s_ease_backwards] [animation-delay:calc(var(--r)*60ms+550ms)] transition-colors duration-300';

/**
 * Grilla de 9 filas × 20 sillas con pasillo central, letras de fila fijas a ambos lados
 * y la franja punteada de preferencial detrás de las filas A y B.
 * @param {{
 *   seats: { id: number, row: string, number: number, price: number, vip: boolean, status: string }[],
 *   zoom?: number,
 * }} props
 */
export default function SeatGrid({ seats, zoom = 1 }) {
  const gridRef = useRef(null);
  const [tiny, setTiny] = useState(false);

  // Sillas ordenadas por fila y número, con su posición en la grilla
  const cells = useMemo(
    () =>
      seats
        .filter((s) => ROWS.includes(s.row))
        .map((s) => ({
          ...s,
          r: ROWS.indexOf(s.row),
          taken: s.status !== 'available',
          dist: Math.round(Math.abs(s.number - 1 - (SEATS_PER_ROW - 1) / 2)),
        }))
        .sort((a, b) => a.r - b.r || a.number - b.number),
    [seats],
  );
  const focusId = cells[0]?.id;

  // Con sillas muy pequeñas se ocultan los números (ej. celular sin zoom)
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const seat = grid.querySelector('[data-seat-id]');
      if (seat) setTiny(seat.offsetWidth < TINY_SEAT_PX);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(grid);
    return () => ro.disconnect();
  }, [cells.length]);

  const vipRows = VIP_ROWS.map((r) => ROWS.indexOf(r) + 1);

  return (
    <div
      ref={gridRef}
      role="group"
      aria-label="Asientos. El escenario está al frente."
      data-tiny={tiny}
      style={{ '--zoom': zoom }}
      className={`group/grid ${GRID_CLASS}`}
    >
      {/* Franja preferencial detrás de las filas A y B */}
      <div
        aria-hidden="true"
        style={{ gridRow: `${Math.min(...vipRows)} / ${Math.max(...vipRows) + 1}`, gridColumn: '2 / 23' }}
        className="pointer-events-none -mx-1 -my-[5px] animate-[band-in_.6s_.7s_ease_both] self-stretch rounded-xl border-[1.5px] border-dashed border-band-line bg-band"
      />

      {ROWS.map((row, r) => (
        <RowLabels key={row} row={row} r={r} />
      ))}

      {cells.map((s) => (
        <Seat
          key={s.id}
          id={s.id}
          row={s.row}
          number={s.number}
          vip={s.vip}
          price={s.price}
          taken={s.taken}
          gridRow={s.r + 1}
          gridColumn={seatColumn(s.number)}
          waveRow={s.r}
          waveDist={s.dist}
          tabIndex={s.id === focusId ? 0 : -1}
        />
      ))}
    </div>
  );
}

/** Letra de la fila a la izquierda y a la derecha; quedan fijas al deslizar. */
function RowLabels({ row, r }) {
  return (
    <>
      <div aria-hidden="true" style={{ gridRow: r + 1, gridColumn: 1, '--r': r }} className={`${ROW_LABEL} -left-1`}>
        {row}
      </div>
      <div aria-hidden="true" style={{ gridRow: r + 1, gridColumn: 23, '--r': r }} className={`${ROW_LABEL} -right-1`}>
        {row}
      </div>
    </>
  );
}
