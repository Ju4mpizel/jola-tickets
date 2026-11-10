'use client';

import { useEffect, useState } from 'react';
import { prefersReducedMotion } from '@/lib/feedback';

const COLORS = ['#7FD6E6', '#0A1F5C', '#FFFFFF', '#2BB3CC'];
const PIECES = 50;
const LIFETIME_MS = 3800;

function makeBurst(key) {
  return Array.from({ length: PIECES }, (_, i) => ({
    id: `${key}-${i}`,
    left: Math.random() * 100,
    color: COLORS[i % COLORS.length],
    dx: Math.random() * 140 - 70,
    rot: Math.random() * 600 - 300,
    duration: 1.8 + Math.random() * 1.4,
    delay: Math.random() * 0.3,
  }));
}

/**
 * Lluvia de papelitos. Se dispara cada vez que cambia `trigger` a un valor verdadero
 * (ej. un contador o el id de la orden aprobada). No hace nada con movimiento reducido.
 * @param {{ trigger?: unknown }} props
 */
export default function Confetti({ trigger }) {
  const [pieces, setPieces] = useState([]);

  useEffect(() => {
    if (!trigger || prefersReducedMotion()) return;
    setPieces(makeBurst(Date.now()));
    const t = setTimeout(() => setPieces([]), LIFETIME_MS);
    return () => clearTimeout(t);
  }, [trigger]);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-70 overflow-hidden">
      {pieces.map((p) => (
        <i
          key={p.id}
          className="absolute -top-4 h-3 w-2 animate-fall rounded-[2px] shadow-[0_0_0_1px_rgba(10,31,92,.12)]"
          style={{
            left: `${p.left}vw`,
            background: p.color,
            '--dx': `${p.dx}px`,
            '--rot': `${p.rot}deg`,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  );
}
