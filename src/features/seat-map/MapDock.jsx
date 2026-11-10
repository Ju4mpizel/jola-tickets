'use client';

import { useEffect, useRef } from 'react';
import { AISLE_AFTER, ROWS, SEATS_PER_ROW } from '@/lib/event';

const ZOOM_BUTTON =
  'flex-1 w-11 min-h-[38px] border-0 bg-transparent text-[1.3rem] leading-none font-bold text-ink ' +
  'transition-[background-color,opacity] duration-150 ' +
  'enabled:hover:bg-surface-3 enabled:active:bg-sel enabled:active:text-on-sel disabled:opacity-30 ' +
  'max-lg:w-9 max-lg:min-h-[31px] max-lg:text-[1.1rem]';

/**
 * Widget flotante del mapa: minimapa (role="slider") y botones + / −.
 * Queda fijo abajo a la derecha mientras se recorre el mapa (position: sticky);
 * en celular sube por encima de la barra de reserva con --sum-h.
 * @param {{
 *   seats: { id: number, row: string, number: number, status: string }[],
 *   selected: number[],
 *   zoom: ReturnType<typeof import('./hooks/useMapZoom').default>,
 * }} props
 */
export default function MapDock({ seats, selected, zoom }) {
  const { zoomIn, zoomOut, canZoomIn, canZoomOut, overflows, minimapProps, windowRef } = zoom;
  const inRef = useRef(null);
  const outRef = useRef(null);

  // Si el botón enfocado queda deshabilitado en un extremo, el foco pasa al otro
  useEffect(() => {
    if (!canZoomIn && document.activeElement === inRef.current) outRef.current?.focus();
    if (!canZoomOut && document.activeElement === outRef.current) inRef.current?.focus();
  }, [canZoomIn, canZoomOut]);

  return (
    <div
      role="group"
      aria-label="Controles del mapa"
      className={
        'pointer-events-none sticky z-[6] flex h-0 animate-[rise_.5s_1.1s_ease_both] items-start justify-end ' +
        'bottom-[calc(var(--sum-h,0px)+12px)] lg:bottom-4 ' +
        (overflows ? 'mt-24 max-lg:mt-[76px]' : 'mt-10')
      }
    >
      <div
        className={
          'pointer-events-auto flex -translate-y-full items-stretch gap-1.5 rounded-[18px] border border-line p-1.5 ' +
          'bg-[color-mix(in_srgb,var(--surface)_82%,transparent)] backdrop-blur-[14px] backdrop-saturate-[1.3] ' +
          'shadow-[0_12px_30px_-10px_rgba(6,13,34,.35)] transition-colors duration-300 ' +
          'max-lg:gap-1 max-lg:rounded-[15px] max-lg:p-1'
        }
      >
        <div
          {...minimapProps}
          hidden={!overflows}
          role="slider"
          tabIndex={0}
          aria-label="Vista general del mapa. Arrastra o usa las flechas para moverte"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={50}
          className={
            'relative w-[118px] origin-right animate-[mm-in_.35s_cubic-bezier(.2,.9,.3,1.2)] cursor-grab touch-none rounded-xl bg-surface-2 p-1.5 ' +
            'active:cursor-grabbing max-lg:w-[86px] max-lg:rounded-[10px] max-lg:p-[5px]'
          }
        >
          <MinimapDots seats={seats} selected={selected} />
          <div
            ref={windowRef}
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-[3px] rounded-md border-2 border-cyan-strong bg-[rgba(127,214,230,.15)]"
          />
        </div>

        <div
          role="group"
          aria-label="Zoom del mapa"
          className="flex flex-col items-center justify-center overflow-hidden rounded-xl bg-surface-2 max-lg:rounded-[10px]"
        >
          <button ref={inRef} type="button" aria-label="Acercar mapa" disabled={!canZoomIn} onClick={zoomIn} className={ZOOM_BUTTON}>
            +
          </button>
          <span aria-hidden="true" className="h-px w-3/5 bg-line" />
          <button ref={outRef} type="button" aria-label="Alejar mapa" disabled={!canZoomOut} onClick={zoomOut} className={ZOOM_BUTTON}>
            −
          </button>
        </div>
      </div>
    </div>
  );
}

/** Las 180 sillas en miniatura: libre, ocupada o tuya (paintMinimap). */
function MinimapDots({ seats, selected }) {
  const status = new Map(seats.map((s) => [`${s.row}${s.number}`, s.status === 'available' ? '' : 't']));
  const ids = new Map(seats.map((s) => [`${s.row}${s.number}`, s.id]));
  const mine = new Set(selected);

  return (
    <div aria-hidden="true" className="grid grid-cols-[repeat(10,1fr)_3px_repeat(10,1fr)] gap-px">
      {ROWS.map((row) =>
        Array.from({ length: SEATS_PER_ROW }, (_, c) => {
          const key = `${row}${c + 1}`;
          const state = mine.has(ids.get(key)) ? 's' : status.get(key);
          return [
            c === AISLE_AFTER && <b key={`${row}-aisle`} />,
            <i
              key={key}
              className={
                'aspect-square rounded-[1px] ' +
                (state === 's' ? 'bg-sel' : state === 't' ? 'bg-taken-line' : 'bg-surface-3')
              }
            />,
          ];
        }),
      )}
    </div>
  );
}
