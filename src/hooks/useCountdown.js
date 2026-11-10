'use client';

import { useEffect, useState } from 'react';

function partsUntil(targetMs) {
  const left = Math.max(0, targetMs - Date.now());
  return {
    days: Math.floor(left / 864e5),
    hours: Math.floor(left / 36e5) % 24,
    minutes: Math.floor(left / 6e4) % 60,
    seconds: Math.floor(left / 1e3) % 60,
    done: left === 0,
  };
}

/**
 * Cuenta regresiva hasta una fecha. Se actualiza cada segundo.
 * Devuelve null hasta montarse en el cliente: así el HTML del servidor
 * no depende de Date.now y no hay desajuste de hidratación.
 * @param {string | number | Date} target
 * @returns {{ days: number, hours: number, minutes: number, seconds: number, done: boolean } | null}
 */
export default function useCountdown(target) {
  const targetMs = new Date(target).getTime();
  const [parts, setParts] = useState(null);

  useEffect(() => {
    const update = () => setParts(partsUntil(targetMs));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [targetMs]);

  return parts;
}
