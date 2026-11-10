'use client';

import Rays from '@/components/brand/Rays';
import AnimatedNumber from '@/components/ui/AnimatedNumber';
import Button from '@/components/ui/Button';
import { usePurchase } from '@/context/PurchaseContext';
import { PRICE_VIP, ROWS, SEATS_PER_ROW, TOTAL_SEATS, formatMoney } from '@/lib/event';
import useSeats from './hooks/useSeats';
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

/**
 * Tarjeta del mapa: saludo, título, disponibles, leyenda, escenario y grilla.
 * Pide los asientos con useSeats (se actualizan cada 15 s).
 * @param {{ titleId: string }} props   id del título (recibe el foco al entrar al paso)
 */
export default function SeatMap({ titleId }) {
  const { buyer } = usePurchase();
  const { seats, loading, error, refresh } = useSeats();
  const free = seats.filter((s) => s.status === 'available').length;
  const ready = seats.length > 0;
  const firstName = buyer?.name.split(' ')[0];

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

      <div className="overflow-x-auto overflow-y-hidden px-1 pt-2.5 pb-2 [scrollbar-color:var(--line)_transparent] [scrollbar-width:thin] [-webkit-overflow-scrolling:touch]">
        {ready ? (
          <SeatGrid seats={seats} />
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
    </section>
  );
}

/** Escenario con los rayos del logo. */
function Stage() {
  return (
    <div aria-hidden="true" className="mx-auto mb-[22px] flex max-w-[620px] flex-col items-center">
      <Rays variant="stage" />
      <div
        className={
          'grid h-11 w-full animate-[stage-in_.7s_.35s_cubic-bezier(.2,.9,.3,1.15)_both] place-items-center ' +
          'rounded-[12px_12px_999px_999px/12px_12px_22px_22px] bg-primary pl-[.4em] text-[.78rem] font-extrabold tracking-[.4em] text-on-primary shadow-elev ' +
          'transition-colors duration-300'
        }
      >
        ESCENARIO
      </div>
    </div>
  );
}

/** Grilla gris del mismo tamaño que el mapa mientras llegan los datos. */
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
            className="aspect-square w-full animate-pulse rounded-[26%] bg-surface-3"
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
