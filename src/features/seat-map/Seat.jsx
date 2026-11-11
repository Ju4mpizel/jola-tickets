import { memo } from 'react';
import { formatMoney } from '@/lib/event';

/** Texto completo para lectores de pantalla: "Fila C, asiento 7, general, Bs 30". */
export function seatLabel({ row, number, vip, price, taken }) {
  return `Fila ${row}, asiento ${number}, ${vip ? 'preferencial' : 'general'}, ${taken ? 'ocupado' : formatMoney(price)}`;
}

/** Estados del mapa de la directiva (GET /admin/seats), con su nombre visible. */
export const ADMIN_STATUS = {
  available: 'Libre',
  held: 'Retenida',
  pending_review: 'En revisión',
  sold: 'Vendida',
  blocked: 'Bloqueada',
};

const STRIPES = 'bg-[repeating-linear-gradient(135deg,var(--taken)_0_4px,var(--taken-line)_4px_5.5px)]';

/**
 * Colores de cada estado (los usa también la leyenda del mapa).
 * - Comprador: available y taken (ocupado, rayado).
 * - Directiva: los cinco estados; bloqueada se ve rayada como el "ocupado" del mapa público.
 */
export const STATUS_CLASS = {
  taken: `border-transparent text-transparent ${STRIPES}`,
  blocked: `border-danger border-dashed text-transparent ${STRIPES}`,
  held: 'border-[#E8A23A] bg-[rgba(232,162,58,.22)] text-[#9A6200] dark:text-[#F3C27A]',
  pending_review: 'border-cyan-strong border-dashed bg-band text-accent-ink',
  // Gris pizarra fijo: en modo oscuro el color primario es el mismo cian de la selección
  sold: 'border-[#41507A] bg-[#41507A] text-white',
};

/*
 * Entrada en ola (menos de 0,8 s en total, solo opacity y transform):
 * - PC: silla por silla desde el escenario y el pasillo, con un leve rebote de escala.
 * - Táctil: fila por fila (9 retrasos), sin escala.
 * Con movimiento reducido, globals.css la deja en .01ms.
 */
const ENTRY =
  'animate-seat-in [animation-delay:calc(var(--r)*25ms+var(--i)*12ms)] ' +
  'pointer-coarse:animate-seat-row pointer-coarse:[animation-delay:calc(var(--r)*45ms)]';

/**
 * Una silla del mapa. Va en su propio archivo para usar React.memo: son 180 botones
 * y al elegir una solo debe volver a pintarse esa.
 * Solo recibe primitivas y no tiene onClick propio: SeatGrid maneja el clic por delegación
 * (data-seat-id) y mueve el tabIndex por el DOM (useRovingGrid), así que tabIndex
 * solo se fija al montar.
 * @param {{
 *   id: number, number: number, label: string,
 *   status: 'available' | 'taken' | 'held' | 'pending_review' | 'sold' | 'blocked',
 *   selected: boolean, vip: boolean,
 *   disabled?: boolean,    // comprador: ocupada (aria-disabled, cursor no permitido)
 *   gridRow: number, gridColumn: number,
 *   waveRow: number,       // --r: fila, para la ola de entrada desde el escenario
 *   waveDist: number,      // --i: distancia al pasillo central
 *   focusable: boolean,    // true solo en la primera silla (tabIndex móvil)
 * }} props
 */
function Seat({ id, number, label, status, selected, vip, disabled = false, gridRow, gridColumn, waveRow, waveDist, focusable }) {
  const look = selected
    ? 'border-sel bg-sel text-on-sel shadow-[0_4px_14px_-2px_var(--sel-glow)]'
    : status === 'available'
      ? 'border-line text-muted pointer-fine:hover:-translate-y-0.5 pointer-fine:hover:border-cyan-strong pointer-fine:hover:text-ink ' +
        (vip ? 'bg-[color-mix(in_srgb,var(--surface)_70%,var(--color-cyan)_6%)]' : 'bg-surface')
      : STATUS_CLASS[status];

  return (
    <button
      type="button"
      data-seat-id={id}
      tabIndex={focusable ? 0 : -1}
      aria-pressed={selected}
      aria-disabled={disabled || undefined}
      aria-label={label}
      style={{ gridRow, gridColumn, '--r': waveRow, '--i': waveDist }}
      className={
        `relative z-[1] aspect-square w-full min-w-0 rounded-[26%] border-[1.5px] p-0 ${ENTRY} ` +
        'text-[clamp(9px,2.5vw,12px)] leading-none font-bold [-webkit-tap-highlight-color:transparent] [touch-action:manipulation] ' +
        'transition-[background-color,border-color,color,transform,box-shadow] duration-200 focus-visible:rounded-[26%] ' +
        `${disabled ? 'cursor-not-allowed ' : ''}${look}`
      }
    >
      <span aria-hidden="true" className="transition-opacity group-data-[tiny=true]/grid:opacity-0">
        {number}
      </span>
    </button>
  );
}

export default memo(Seat);
