'use client';

import useCountdown from '@/hooks/useCountdown';

const UNITS = [
  { key: 'days', label: 'Días' },
  { key: 'hours', label: 'Horas' },
  { key: 'minutes', label: 'Min' },
  { key: 'seconds', label: 'Seg' },
];

const pad = (n) => String(n).padStart(2, '0');

/**
 * Cuenta regresiva del hero: días, horas, minutos y segundos.
 * Cada número cambia con una animación corta (se vuelve a montar con su valor como key).
 * Muestra "--" hasta montarse en el cliente.
 * @param {{ target: string }} props   fecha ISO del evento
 */
export default function Countdown({ target }) {
  const parts = useCountdown(target);

  const label = parts
    ? parts.done
      ? 'El evento ya comenzó'
      : `${parts.days} días, ${parts.hours} horas y ${parts.minutes} minutos para el evento`
    : undefined;

  return (
    <>
      <span
        id="cd-label"
        className="mt-[22px] mb-2 block animate-[rise_.5s_1.25s_ease_both] text-[.72rem] font-extrabold tracking-[.14em] text-white/60 uppercase"
      >
        {parts?.done ? '¡El evento ya comenzó!' : 'Faltan'}
      </span>
      <div role="timer" aria-labelledby={label ? undefined : 'cd-label'} aria-label={label} className="flex gap-1.5 min-[560px]:gap-2">
        {UNITS.map(({ key, label: unit }, i) => {
          const text = parts ? pad(parts[key]) : '--';
          return (
            <div
              key={key}
              style={{ animationDelay: `${1.3 + i * 0.07}s` }}
              className={
                'flex-1 animate-rise overflow-hidden rounded-[14px] border border-white/12 bg-white/6 px-1 pt-[9px] pb-[7px] text-center ' +
                'min-[560px]:max-w-[76px] min-[560px]:rounded-2xl min-[560px]:px-1.5 min-[560px]:pt-2.5 min-[560px]:pb-2'
              }
            >
              <b
                key={text}
                aria-hidden="true"
                className={`block text-[1.4rem] leading-[1.1] font-extrabold tabular-nums min-[560px]:text-[1.6rem] ${parts ? 'animate-tick' : ''}`}
              >
                {text}
              </b>
              <small aria-hidden="true" className="text-[.64rem] font-extrabold tracking-[.1em] text-white/60 uppercase">
                {unit}
              </small>
            </div>
          );
        })}
      </div>
    </>
  );
}
