import { memo } from 'react';
import { formatMoney } from '@/lib/event';

/** Texto completo para lectores de pantalla: "Fila C, asiento 7, general, Bs 30". */
export function seatLabel({ row, number, vip, price, taken }) {
  return `Fila ${row}, asiento ${number}, ${vip ? 'preferencial' : 'general'}, ${taken ? 'ocupado' : formatMoney(price)}`;
}

/**
 * Una silla del mapa. Va en su propio archivo para usar React.memo: son 180 botones
 * y solo deben volver a pintarse los que cambian.
 * Sin onClick propio: SeatGrid maneja los clics por delegación (data-seat-id).
 * @param {{
 *   id: number, row: string, number: number, vip: boolean, price: number,
 *   taken: boolean, selected?: boolean,
 *   gridRow: number, gridColumn: number,
 *   waveRow: number,                 // --r: fila, para la ola de entrada desde el escenario
 *   waveDist: number,                // --i: distancia al pasillo central
 *   tabIndex: number,                 // 0 solo en la silla enfocable (tabIndex móvil)
 * }} props
 */
function Seat({ id, row, number, vip, price, taken, selected = false, gridRow, gridColumn, waveRow, waveDist, tabIndex }) {
  return (
    <button
      type="button"
      data-seat-id={id}
      tabIndex={tabIndex}
      aria-pressed={selected}
      aria-disabled={taken || undefined}
      aria-label={seatLabel({ row, number, vip, price, taken })}
      style={{ gridRow, gridColumn, '--r': waveRow, '--i': waveDist }}
      className={
        'relative z-[1] aspect-square w-full min-w-0 animate-seat-in rounded-[26%] border-[1.5px] p-0 ' +
        'text-[clamp(9px,2.5vw,12px)] leading-none font-bold [-webkit-tap-highlight-color:transparent] [touch-action:manipulation] ' +
        '[animation-delay:calc(var(--r)*60ms+var(--i)*22ms+600ms)] ' +
        'transition-[background-color,border-color,color,transform,box-shadow] duration-200 focus-visible:rounded-[26%] ' +
        (taken
          ? 'cursor-not-allowed border-transparent text-transparent bg-[repeating-linear-gradient(135deg,var(--taken)_0_4px,var(--taken-line)_4px_5.5px)]'
          : selected
            ? 'border-sel bg-sel text-on-sel shadow-[0_4px_14px_-2px_var(--sel-glow)]'
            : 'border-line text-muted pointer-fine:hover:-translate-y-0.5 pointer-fine:hover:border-cyan-strong pointer-fine:hover:text-ink ' +
              (vip ? 'bg-[color-mix(in_srgb,var(--surface)_70%,var(--color-cyan)_6%)]' : 'bg-surface'))
      }
    >
      <span aria-hidden="true" className="transition-opacity group-data-[tiny=true]/grid:opacity-0">
        {number}
      </span>
    </button>
  );
}

export default memo(Seat);
