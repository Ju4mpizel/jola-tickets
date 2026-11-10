'use client';

import { useCallback, useRef, useState } from 'react';
import { prefersReducedMotion } from '@/lib/feedback';

/**
 * Foco móvil (roving tabindex) para una grilla: un solo elemento enfocable con Tab,
 * flechas para moverse, Inicio y Fin para ir al principio o al final de la fila.
 * Enter y Espacio no se manejan aquí: el botón enfocado dispara su propio clic.
 * @param {{
 *   rows: number,
 *   cols: number,
 *   getElement: (r: number, c: number) => HTMLElement | null | undefined,
 * }} options
 * @returns {{
 *   focus: { r: number, c: number },
 *   setFocus: (r: number, c: number, move?: boolean) => void,
 *   onKeyDown: (e: React.KeyboardEvent) => void,
 * }}
 */
export default function useRovingGrid({ rows, cols, getElement }) {
  const [focus, setFocusState] = useState({ r: 0, c: 0 });
  const focusRef = useRef(focus);
  const getRef = useRef(getElement);
  getRef.current = getElement;

  /** move = true: enfoca el elemento y hace scroll hasta que quede visible. */
  const setFocus = useCallback(
    (r, c, move = true) => {
      const next = { r: Math.max(0, Math.min(rows - 1, r)), c: Math.max(0, Math.min(cols - 1, c)) };
      focusRef.current = next;
      setFocusState((prev) => (prev.r === next.r && prev.c === next.c ? prev : next));
      if (!move) return;
      const el = getRef.current(next.r, next.c);
      if (!el) return;
      el.focus({ preventScroll: true });
      el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    },
    [rows, cols],
  );

  const onKeyDown = useCallback(
    (e) => {
      let { r, c } = focusRef.current;
      switch (e.key) {
        case 'ArrowRight': c++; break;
        case 'ArrowLeft': c--; break;
        case 'ArrowDown': r++; break;
        case 'ArrowUp': r--; break;
        case 'Home': c = 0; break;
        case 'End': c = cols - 1; break;
        default: return;
      }
      e.preventDefault();
      setFocus(r, c);
    },
    [cols, setFocus],
  );

  return { focus, setFocus, onKeyDown };
}
