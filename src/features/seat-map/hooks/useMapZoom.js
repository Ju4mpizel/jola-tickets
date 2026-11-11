'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { SEATS_PER_ROW } from '@/lib/event';
import { hasFinePointer, prefersReducedMotion } from '@/lib/feedback';
import { GRID_PX_PER_ZOOM } from '../SeatGrid';

/** Tamaños de silla (px) de los niveles de zoom, además de la vista completa. */
const TARGET_SEAT_PX = [26, 36];
/** En pantallas táctiles, si la vista completa deja sillas más chicas que esto, se abre acercado. */
const TOUCH_MIN_SEAT_PX = 22;
/** Debajo de este ancho de silla se ocultan los números. */
const TINY_SEAT_PX = 20;
/** Lo que dura la transición de ancho de la grilla (SeatGrid) más un margen. */
const ZOOM_SETTLE_MS = 370;

const scrollBehavior = (smooth = true) => (smooth && !prefersReducedMotion() ? 'smooth' : 'auto');

/**
 * Zoom del mapa adaptado a la pantalla y minimapa (computeZooms, applyZoom, syncWindow y jumpTo
 * del prototipo). Los niveles se calculan con una sola lectura de layout: el ancho de una silla
 * y el de la grilla. De ahí salen la vista completa y los niveles de unos 26 px y 36 px.
 *
 * - El nivel inicial se aplica antes del primer pintado (useLayoutEffect), sin transición,
 *   y el scroll se centra al instante.
 * - La transición del ancho solo corre cuando el usuario pulsa + o −; ahí se centra con scroll suave.
 * - Al girar o cambiar el tamaño de la ventana se recalcula sin transición y sin centrar.
 *
 * El recuadro del minimapa se mueve directo en el DOM (refs) para no volver a pintar
 * el mapa en cada evento de scroll.
 * @param {{
 *   scrollerRef: React.RefObject<HTMLElement>,   // contenedor con overflow-x
 *   gridRef: React.RefObject<HTMLElement>,       // grilla con --zoom (SeatGrid)
 *   ready: boolean,                               // ya hay sillas para medir
 * }} options
 */
export default function useMapZoom({ scrollerRef, gridRef, ready }) {
  const [state, setState] = useState({ zooms: [1], index: 0, fit: 0, slope: 0, finePointer: false, measured: false });
  const [overflows, setOverflows] = useState(false);
  const [animate, setAnimate] = useState(false);
  const minimapRef = useRef(null);
  const windowRef = useRef(null);
  const zoomRef = useRef(1);
  /** Qué hacer con el scroll después del próximo cambio de nivel. */
  const centerMode = useRef('instant');
  const dragging = useRef(false);

  const { zooms, index, fit, slope, finePointer, measured } = state;
  const zoom = zooms[index] ?? 1;
  zoomRef.current = zoom;
  const tiny = measured && fit + slope * (zoom - 1) < TINY_SEAT_PX;

  /** Mueve el recuadro del minimapa según el scroll del mapa (syncWindow). */
  const syncWindow = useCallback(() => {
    const sc = scrollerRef.current;
    const mm = minimapRef.current;
    const win = windowRef.current;
    if (!sc || !mm || !win || mm.hidden) return;
    const max = sc.scrollWidth - sc.clientWidth;
    const pos = max > 0 ? sc.scrollLeft / max : 0.5;
    const pad = parseFloat(getComputedStyle(mm).paddingLeft) || 6;
    const inner = mm.clientWidth - pad * 2;
    const w = Math.max(14, (inner * sc.clientWidth) / sc.scrollWidth);
    win.style.width = `${w + 4}px`;
    win.style.left = `${pad - 2 + (inner - w) * pos}px`;
    mm.setAttribute('aria-valuenow', String(Math.round(pos * 100)));
  }, [scrollerRef]);

  /**
   * Calcula los niveles (computeZooms) con una sola lectura de layout y sin tocar --zoom:
   * con el --zoom actual se leen el ancho de una silla y el de la grilla, y como el ancho
   * de silla crece en línea recta con el zoom, se deduce el de cualquier nivel.
   */
  const computeZooms = useCallback(
    (initial) => {
      const grid = gridRef.current;
      const seat = grid?.querySelector('[data-seat-id]');
      if (!grid || !seat) return;
      const current = zoomRef.current;
      // offsetWidth y no getBoundingClientRect: ignora los transform de las animaciones de entrada
      // (la silla arranca en scale(.6) y la tarjeta en scale(.985))
      const seatPx = seat.offsetWidth;
      const gridPx = grid.offsetWidth;
      const nextSlope = Math.max(1, (gridPx / current - GRID_PX_PER_ZOOM) / SEATS_PER_ROW);
      const nextFit = seatPx - nextSlope * (current - 1);

      const next = [1];
      TARGET_SEAT_PX.forEach((target) => {
        const z = +(1 + (target - nextFit) / nextSlope).toFixed(2);
        if (z > 1.08) next.push(z);
      });
      if (next.length === 1) next.push(1.3);

      // Si ya estaba acercado, sigue acercado. Si no: táctil con sillas chicas → nivel de 26 px; PC → vista completa
      const fine = hasFinePointer();
      const nextIndex =
        !initial && current !== 1 ? Math.min(next.length - 1, 1) : nextFit < TOUCH_MIN_SEAT_PX && !fine ? 1 : 0;
      centerMode.current = initial ? 'instant' : 'none';
      setAnimate(false);
      // La grilla mide 100 % × zoom del contenedor: desborda en cualquier nivel mayor que 1.
      // Se fija en el mismo render que el zoom (el ResizeObserver lo confirma después)
      setOverflows(next[nextIndex] > 1);
      setState({ zooms: next, index: nextIndex, fit: nextFit, slope: nextSlope, finePointer: fine, measured: true });
    },
    [gridRef],
  );

  // Nivel inicial antes del primer pintado de las sillas
  useLayoutEffect(() => {
    if (ready) computeZooms(true);
  }, [ready, computeZooms]);

  // Al girar o cambiar el tamaño: recalcula sin transición y sin centrar
  useEffect(() => {
    if (!ready) return;
    let t;
    const onResize = () => {
      clearTimeout(t);
      t = setTimeout(() => computeZooms(false), 200);
    };
    window.addEventListener('resize', onResize);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', onResize);
    };
  }, [ready, computeZooms]);

  // Después de cada cambio de nivel: al instante (entrada) o al terminar la transición (+ / −)
  useLayoutEffect(() => {
    if (!measured) return;
    const mode = centerMode.current;
    centerMode.current = 'none';
    const sc = scrollerRef.current;
    const grid = gridRef.current;
    if (!sc || mode === 'none') return;

    const center = (behavior) => {
      sc.scrollTo({ left: (sc.scrollWidth - sc.clientWidth) / 2, behavior });
      syncWindow();
    };
    if (mode === 'instant') {
      center('auto');
      return;
    }
    let done = false;
    const settle = () => {
      if (done) return;
      done = true;
      setOverflows(sc.scrollWidth > sc.clientWidth + 2);
      center(scrollBehavior());
    };
    const onEnd = (e) => e.target === grid && e.propertyName === 'width' && settle();
    grid?.addEventListener('transitionend', onEnd);
    const t = setTimeout(settle, ZOOM_SETTLE_MS + 150);
    return () => {
      clearTimeout(t);
      grid?.removeEventListener('transitionend', onEnd);
    };
  }, [zoom, measured, scrollerRef, gridRef, syncWindow]);

  // Si la grilla o el contenedor cambian de tamaño (zoom, giro), se vuelve a ver si desborda
  useEffect(() => {
    const sc = scrollerRef.current;
    const grid = gridRef.current;
    if (!ready || !sc || !grid || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      setOverflows(sc.scrollWidth > sc.clientWidth + 2);
      syncWindow();
    });
    ro.observe(grid);
    ro.observe(sc);
    return () => ro.disconnect();
  }, [ready, scrollerRef, gridRef, syncWindow]);

  // El minimapa recién mostrado necesita su recuadro; luego lo mueve el scroll del mapa
  useEffect(() => {
    const sc = scrollerRef.current;
    if (!sc) return;
    syncWindow();
    sc.addEventListener('scroll', syncWindow, { passive: true });
    return () => sc.removeEventListener('scroll', syncWindow);
  }, [overflows, ready, scrollerRef, syncWindow]);

  /** + / −: con movimiento reducido, sin transición y centrado al instante. */
  const changeLevel = useCallback(
    (delta) => {
      const reduce = prefersReducedMotion();
      centerMode.current = reduce ? 'instant' : 'smooth';
      setAnimate(!reduce);
      setState((s) => ({ ...s, index: Math.max(0, Math.min(s.zooms.length - 1, s.index + delta)) }));
    },
    [],
  );
  const zoomIn = useCallback(() => changeLevel(1), [changeLevel]);
  const zoomOut = useCallback(() => changeLevel(-1), [changeLevel]);

  /** Lleva el mapa al punto x (clientX) del minimapa. */
  const jumpTo = useCallback(
    (x, smooth) => {
      const sc = scrollerRef.current;
      const mm = minimapRef.current;
      if (!sc || !mm) return;
      const rect = mm.getBoundingClientRect();
      const pad = parseFloat(getComputedStyle(mm).paddingLeft) || 6;
      const p = Math.min(1, Math.max(0, (x - rect.left - pad) / (rect.width - pad * 2)));
      sc.scrollTo({ left: p * sc.scrollWidth - sc.clientWidth / 2, behavior: scrollBehavior(smooth) });
    },
    [scrollerRef],
  );

  /** Tocar o arrastrar el minimapa, y flechas izquierda/derecha cuando tiene el foco. */
  const minimapProps = {
    ref: minimapRef,
    onPointerDown: (e) => {
      dragging.current = true;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      jumpTo(e.clientX, true);
    },
    onPointerMove: (e) => dragging.current && jumpTo(e.clientX, false),
    onPointerUp: () => (dragging.current = false),
    onPointerCancel: () => (dragging.current = false),
    onKeyDown: (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      const sc = scrollerRef.current;
      sc?.scrollBy({ left: (e.key === 'ArrowRight' ? 1 : -1) * sc.clientWidth * 0.5, behavior: scrollBehavior() });
    },
  };

  return {
    zoom,
    zoomIn,
    zoomOut,
    canZoomIn: index < zooms.length - 1,
    canZoomOut: index > 0,
    overflows,
    measured,
    finePointer,
    tiny,
    animate,
    jumpTo,
    minimapProps,
    windowRef,
  };
}
