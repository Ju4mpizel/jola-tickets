'use client';

import { useCallback, useRef } from 'react';
import { prefersReducedMotion } from '@/lib/feedback';

/**
 * Foco móvil (roving tabindex) para una grilla: un solo elemento enfocable con Tab,
 * flechas para moverse, Inicio y Fin para ir al principio o al final de la fila.
 * Enter y Espacio no se manejan aquí: el botón enfocado dispara su propio clic.
 *
 * El tabIndex se mueve directo en el DOM (sin estado de React): mover el foco o elegir
 * una silla no vuelve a pintar ninguna otra silla. Los elementos solo deben fijar su
 * tabIndex inicial (0 en el primero, -1 en el resto) y no cambiarlo después.
 * @param {{
 *   rows: number,
 *   cols: number,
 *   getElement: (r: number, c: number) => HTMLElement | null | undefined,
 * }} options
 * @returns {{
 *   focusRef: React.RefObject<{ r: number, c: number }>,   // fila y columna con foco
 *   setFocus: (r: number, c: number, move?: boolean) => void,
 *   onKeyDown: (e: React.KeyboardEvent) => void,
 * }}
 */
export default function useRovingGrid({ rows, cols, getElement }) {
  const focusRef = useRef({ r: 0, c: 0 });
  const getRef = useRef(getElement);
  getRef.current = getElement;

  /** move = true: enfoca el elemento y hace scroll hasta que quede visible. */
  const setFocus = useCallback(
    (r, c, move = true) => {
      const prev = focusRef.current;
      const next = { r: Math.max(0, Math.min(rows - 1, r)), c: Math.max(0, Math.min(cols - 1, c)) };
      const prevEl = getRef.current(prev.r, prev.c);
      const el = getRef.current(next.r, next.c);
      focusRef.current = next;
      if (prevEl && prevEl !== el) prevEl.tabIndex = -1;
      if (!el) return;
      el.tabIndex = 0;
      if (!move) return;
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

  return { focusRef, setFocus, onKeyDown };
}
