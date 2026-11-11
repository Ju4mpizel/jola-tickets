'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AISLE_AFTER, ROWS, SEATS_PER_ROW, VIP_ROWS, formatMoney, seatCode } from '@/lib/event';
import useRovingGrid from './hooks/useRovingGrid';
import Seat, { ADMIN_STATUS, seatLabel } from './Seat';

/**
 * Plantilla de la grilla: letra | 10 sillas | pasillo | 10 sillas | letra.
 * Todo escala con --zoom (lo cambia useMapZoom). La usa también el esqueleto de carga de SeatMap.
 */
export const GRID_CLASS =
  'relative mx-auto grid w-[calc(100%*var(--zoom))] items-center ' +
  'grid-cols-[22px_repeat(10,minmax(0,1fr))_calc(8px+6px*var(--zoom))_repeat(10,minmax(0,1fr))_22px] ' +
  '[row-gap:calc(6px+3px*var(--zoom))] [column-gap:calc(2px+1.5px*var(--zoom))]';

/**
 * Píxeles fijos que crecen con cada unidad de --zoom en GRID_CLASS: el pasillo (6px)
 * y los 22 espacios entre columnas (1,5px cada uno). useMapZoom lo usa para calcular
 * el tamaño de silla de cada nivel con una sola medición. Cambiarlo junto con GRID_CLASS.
 */
export const GRID_PX_PER_ZOOM = 6 + 22 * 1.5;

/** Transición del ancho: solo cuando el usuario pulsa + o −. */
const ZOOM_TRANSITION = 'transition-[width] duration-[350ms] ease-[cubic-bezier(.4,0,.2,1)]';

/** Columna de la grilla para el asiento n (1–20): deja la columna 12 para el pasillo. */
export const seatColumn = (number) => (number <= AISLE_AFTER ? number + 1 : number + 2);

const ROW_LABEL =
  'sticky z-[2] grid self-stretch place-items-center rounded-lg bg-surface text-[.75rem] font-extrabold text-muted ' +
  'animate-[rise_.3s_ease_backwards] [animation-delay:calc(var(--r)*45ms)] transition-colors duration-300';

/**
 * Grilla de 9 filas × 20 sillas con pasillo central, letras de fila fijas a ambos lados
 * y la franja punteada de preferencial detrás de las filas A y B.
 * Un solo onClick por delegación, teclado con useRovingGrid y tooltip solo en PC.
 * No sabe de compras: la selección y qué hacer al tocar una silla vienen por props
 * (el comprador elige asientos; la directiva marca sillas para bloquear o ve su orden).
 * @param {{
 *   seats: { id: number, row: string, number: number, price?: number, vip: boolean, status: string, order_code?: string }[],
 *   selected: number[],
 *   onSeatClick: (cell: object, button: HTMLButtonElement) => void,   // cell: la silla con code, r, c, taken…
 *   admin?: boolean,         // cinco estados (GET /admin/seats) en lugar de libre / ocupado
 *   zoom?: number,
 *   tiny?: boolean,          // sillas de menos de 20 px: se ocultan los números
 *   animateZoom?: boolean,   // el cambio de zoom lo pidió el usuario: con transición
 *   finePointer?: boolean,   // PC con mouse: muestra el tooltip (lo calcula useMapZoom)
 *   ref?: React.RefObject<HTMLDivElement>,   // lo usa useMapZoom para medir las sillas
 * }} props
 */
export default function SeatGrid({
  seats,
  selected,
  onSeatClick,
  admin = false,
  zoom = 1,
  tiny = false,
  animateZoom = false,
  finePointer = false,
  ref,
}) {
  const ownRef = useRef(null);
  const gridRef = ref ?? ownRef;
  const tipRef = useRef(null);

  // Sillas ordenadas por fila y número, con su posición en la grilla
  const cells = useMemo(
    () =>
      seats
        .filter((s) => ROWS.includes(s.row) && s.number >= 1 && s.number <= SEATS_PER_ROW)
        .map((s) => {
          const taken = s.status !== 'available';
          const code = seatCode(s.row, s.number);
          const state = ADMIN_STATUS[s.status] ?? s.status;
          return {
            ...s,
            r: ROWS.indexOf(s.row),
            c: s.number - 1,
            code,
            taken,
            status: admin ? s.status : taken ? 'taken' : 'available',
            label: admin
              ? `Fila ${s.row}, asiento ${s.number}, ${state.toLowerCase()}${s.order_code ? `, orden ${s.order_code}` : ''}`
              : seatLabel({ ...s, taken }),
            tip: admin
              ? `${code} · ${state}${s.order_code ? ` · ${s.order_code}` : ''}`
              : `Fila ${s.row} · Asiento ${s.number} · ${taken ? 'Ocupado' : formatMoney(s.price)}`,
            column: seatColumn(s.number),
            dist: Math.round(Math.abs(s.number - 1 - (SEATS_PER_ROW - 1) / 2)),
          };
        })
        .sort((a, b) => a.r - b.r || a.number - b.number),
    [seats, admin],
  );
  const byId = useMemo(() => new Map(cells.map((s) => [s.id, s])), [cells]);
  const byPos = useMemo(() => new Map(cells.map((s) => [`${s.r}:${s.c}`, s])), [cells]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const getElement = useCallback(
    (r, c) => {
      const cell = byPos.get(`${r}:${c}`);
      return cell ? gridRef.current?.querySelector(`[data-seat-id="${cell.id}"]`) : null;
    },
    [byPos, gridRef],
  );
  const { setFocus, onKeyDown } = useRovingGrid({ rows: ROWS.length, cols: SEATS_PER_ROW, getElement });
  // Solo la primera silla nace enfocable; después useRovingGrid mueve el tabIndex por el DOM
  const firstId = cells[0]?.id;

  /** Clic, toque, Enter o Espacio sobre una silla: lo resuelve quien usa la grilla. */
  function handleClick(e) {
    const button = e.target.closest('[data-seat-id]');
    const cell = button && byId.get(Number(button.dataset.seatId));
    if (!cell) return;
    setFocus(cell.r, cell.c, false);
    onSeatClick(cell, button);
  }

  /* ---------- Tooltip (solo PC): se mueve por el DOM para no volver a pintar la grilla ---------- */
  const hideTip = useCallback(() => tipRef.current?.classList.remove('opacity-100'), []);

  function handleMouseOver(e) {
    const tip = tipRef.current;
    const button = e.target.closest('[data-seat-id]');
    const cell = button && byId.get(Number(button.dataset.seatId));
    if (!tip || !cell) return;
    const rect = button.getBoundingClientRect();
    tip.textContent = cell.tip;
    tip.style.left = `${rect.left + rect.width / 2}px`;
    tip.style.top = `${rect.top}px`;
    tip.classList.add('opacity-100');
  }

  // Se oculta con cualquier scroll: la página o el mapa (capture alcanza al contenedor del mapa)
  useEffect(() => {
    if (!finePointer) return;
    window.addEventListener('scroll', hideTip, { capture: true, passive: true });
    return () => window.removeEventListener('scroll', hideTip, { capture: true });
  }, [finePointer, hideTip]);

  const vipRows = VIP_ROWS.map((r) => ROWS.indexOf(r) + 1);

  return (
    <div
      ref={gridRef}
      role="group"
      aria-label={`Asientos. El escenario está al frente. Usa las flechas para moverte y Enter para ${admin ? 'ver o marcar' : 'elegir'}.`}
      data-tiny={tiny}
      style={{ '--zoom': zoom }}
      className={`group/grid ${GRID_CLASS} ${animateZoom ? ZOOM_TRANSITION : ''}`}
      onClick={handleClick}
      onKeyDown={onKeyDown}
      onMouseOver={finePointer ? handleMouseOver : undefined}
      onMouseLeave={finePointer ? hideTip : undefined}
    >
      {/* Franja preferencial detrás de las filas A y B */}
      <div
        aria-hidden="true"
        style={{ gridRow: `${Math.min(...vipRows)} / ${Math.max(...vipRows) + 1}`, gridColumn: '2 / 23' }}
        className="pointer-events-none -mx-1 -my-[5px] animate-[band-in_.4s_ease_both] self-stretch rounded-xl border-[1.5px] border-dashed border-band-line bg-band"
      />

      {ROWS.map((row, r) => (
        <RowLabels key={row} row={row} r={r} />
      ))}

      {cells.map((s) => (
        <Seat
          key={s.id}
          id={s.id}
          number={s.number}
          label={s.label}
          status={s.status}
          selected={selectedSet.has(s.id)}
          disabled={!admin && s.taken}
          vip={s.vip}
          gridRow={s.r + 1}
          gridColumn={s.column}
          waveRow={s.r}
          waveDist={s.dist}
          focusable={s.id === firstId}
        />
      ))}

      {finePointer &&
        createPortal(
          <div
            ref={tipRef}
            aria-hidden="true"
            className={
              'pointer-events-none fixed z-40 -translate-x-1/2 -translate-y-[calc(100%+6px)] rounded-[10px] bg-ink px-3 py-2 ' +
              'text-[.8rem] font-bold whitespace-nowrap text-bg opacity-0 shadow-elev transition-opacity duration-150'
            }
          />,
          document.body,
        )}
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
