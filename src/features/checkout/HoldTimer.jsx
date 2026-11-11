'use client';

import { useEffect, useRef } from 'react';
import { IconTimer } from '@/components/ui/icons';
import { useAnnounce } from '@/components/ui/ToastProvider';
import useHoldTimer from './hooks/useHoldTimer';

/**
 * Píldora con el tiempo que queda de la retención ("13:42"); en rojo en el último minuto.
 * Es el único componente que se vuelve a pintar cada segundo.
 * @param {{
 *   deadline: number,
 *   onExpire: () => void,
 *   size?: 'sm' | 'lg',     // lg: bien visible, arriba de la pantalla de pago
 *   className?: string,
 * }} props
 */
export default function HoldTimer({ deadline, onExpire, size = 'sm', className = '' }) {
  const timer = useHoldTimer(deadline, onExpire);
  const announce = useAnnounce();
  const warned = useRef(false);
  const warning = !!timer?.isWarning;

  // Aviso a lectores de pantalla una sola vez, al entrar en el último minuto
  useEffect(() => {
    if (warning && !warned.current) {
      warned.current = true;
      announce('Queda menos de un minuto para pagar');
    }
  }, [warning, announce]);

  const label = timer?.label ?? '--:--';
  return (
    <div
      role="timer"
      aria-label={timer ? `Tiempo para pagar: ${timer.minutes} min ${timer.seconds} s` : 'Tiempo para pagar'}
      className={
        'inline-flex items-center rounded-full border font-extrabold tabular-nums bg-surface-2 transition-colors duration-300 ' +
        (size === 'lg'
          ? 'gap-2 px-3.5 py-2 text-[1.15rem] [&_svg]:size-[18px] '
          : 'gap-1.5 px-2.5 py-[5px] text-[.8rem] [&_svg]:size-3.5 ') +
        (warning ? 'border-[rgba(224,68,95,.35)] text-danger' : 'border-line text-ink') +
        ` ${className}`
      }
    >
      <IconTimer aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
