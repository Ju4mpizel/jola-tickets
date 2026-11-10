'use client';

import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '@/lib/feedback';

/**
 * Número que cuenta desde su valor anterior hasta el nuevo (curva ease-out cúbica).
 * Con movimiento reducido salta directo al valor.
 * @param {{
 *   value: number,
 *   prefix?: string,      // ej. "Bs "
 *   startFrom?: number,   // valor inicial al montar (ej. 0 para contar al entrar)
 *   duration?: number,    // ms
 *   delay?: number,       // ms antes de empezar
 *   className?: string,
 * }} props
 */
export default function AnimatedNumber({ value, prefix = '', startFrom, duration = 380, delay = 0, className = '' }) {
  const [shown, setShown] = useState(startFrom ?? value);
  const shownRef = useRef(startFrom ?? value);

  useEffect(() => {
    const set = (n) => {
      shownRef.current = n;
      setShown(n);
    };
    if (prefersReducedMotion()) {
      set(value);
      return;
    }
    const from = shownRef.current;
    if (from === value) return;
    let raf;
    const t0 = performance.now() + delay;
    const step = (t) => {
      const p = Math.max(0, Math.min(1, (t - t0) / duration));
      const eased = 1 - Math.pow(1 - p, 3);
      set(Math.round(from + (value - from) * eased));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, delay]);

  return (
    <span className={`tabular-nums ${className}`}>
      {prefix}
      {shown}
    </span>
  );
}
