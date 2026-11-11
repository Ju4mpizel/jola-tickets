'use client';

import { useEffect, useRef, useState } from 'react';

/** Último minuto: el temporizador se pone en rojo. */
const WARNING_MS = 60_000;

/**
 * Cuenta regresiva hasta `deadline` (calculado desde el expires_at del servidor, no desde
 * el reloj del navegador al hacer clic). Se actualiza cada segundo: solo vuelve a pintar
 * al componente que lo usa (HoldTimer).
 * @param {number | null} deadline   ms (Date)
 * @param {() => void} onExpire      se llama una sola vez al llegar a 0
 * @returns {{ remaining: number, minutes: number, seconds: number, isWarning: boolean, label: string } | null}
 *   null hasta montarse en el cliente (sin Date.now en el render del servidor)
 */
export default function useHoldTimer(deadline, onExpire) {
  const [remaining, setRemaining] = useState(null);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    if (deadline == null) return;
    let fired = false;
    let id;
    const tick = () => {
      const left = Math.max(0, deadline - Date.now());
      // Redondeado al segundo: el estado solo cambia una vez por segundo
      setRemaining(Math.ceil(left / 1000) * 1000);
      if (left === 0 && !fired) {
        fired = true;
        clearInterval(id);
        onExpireRef.current?.();
      }
    };
    tick();
    id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [deadline]);

  if (remaining == null) return null;
  const minutes = Math.floor(remaining / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);
  return {
    remaining,
    minutes,
    seconds,
    isWarning: remaining <= WARNING_MS,
    label: `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
  };
}
