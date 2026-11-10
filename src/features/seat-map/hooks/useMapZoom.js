'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { hasFinePointer, prefersReducedMotion } from '@/lib/feedback';

/** Tamaños de silla (px) de los niveles de zoom, además de la vista completa. */
const TARGET_SEAT_PX = [26, 36];
/** En pantallas táctiles, si la vista completa deja sillas más chicas que esto, se abre acercado. */
const TOUCH_MIN_SEAT_PX = 22;
/** Lo que dura la transición de ancho de la grilla (GRID_CLASS) más un margen. */
const ZOOM_SETTLE_MS = 370;

const scrollBehavior = (smooth = true) => (smooth && !prefersReducedMotion() ? 'smooth' : 'auto');

/**
 * Zoom del mapa adaptado a la pantalla y minimapa (computeZooms, applyZoom, syncWindow y jumpTo
 * del prototipo). Los niveles se calculan midiendo una silla real: vista completa y sillas de
 * unos 26 px y 36 px. Se recalculan al girar la pantalla o cambiar el tamaño de la ventana.
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
  const [zooms, setZooms] = useState([1]);
  const [index, setIndex] = useState(0);
  const [overflows, setOverflows] = useState(false);
  const [measured, setMeasured] = useState(false);
  const [finePointer, setFinePointer] = useState(false);
  const minimapRef = useRef(null);
  const windowRef = useRef(null);
  const zoomRef = useRef(1);
  const centerNext = useRef(true);
  const dragging = useRef(false);

  const zoom = zooms[index] ?? 1;
  zoomRef.current = zoom;

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

  /** Mide una silla en --zoom 1 y 2 y calcula los niveles (computeZooms). */
  const computeZooms = useCallback(() => {
    const grid = gridRef.current;
    const seat = grid?.querySelector('[data-seat-id]');
    if (!grid || !seat) return;
    const prev = zoomRef.current;
    grid.style.transition = 'none';
    const measure = (z) => {
      grid.style.setProperty('--zoom', String(z));
      return seat.offsetWidth;
    };
    const fit = measure(1) || 14;
    const slope = Math.max(1, (measure(2) || 28) - fit);
    grid.style.setProperty('--zoom', String(prev));
    void grid.offsetWidth;
    grid.style.transition = '';

    const next = [1];
    TARGET_SEAT_PX.forEach((target) => {
      const z = +(1 + (target - fit) / slope).toFixed(2);
      if (z > 1.08) next.push(z);
    });
    if (next.length === 1) next.push(1.3);

    // Si ya estaba acercado, sigue acercado. Si no: táctil con sillas chicas → nivel de 26 px; PC → vista completa
    const fine = hasFinePointer();
    const nextIndex = prev !== 1 ? Math.min(next.length - 1, 1) : fit < TOUCH_MIN_SEAT_PX && !fine ? 1 : 0;
    setFinePointer(fine);
    setZooms(next);
    setIndex(nextIndex);
    setMeasured(true);
  }, [gridRef]);

  // Primera medición cuando llegan las sillas
  useEffect(() => {
    if (ready) computeZooms();
  }, [ready, computeZooms]);

  // Al girar o cambiar el tamaño: recalcula sin centrar
  useEffect(() => {
    if (!ready) return;
    let t;
    const onResize = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        centerNext.current = false;
        computeZooms();
      }, 200);
    };
    window.addEventListener('resize', onResize);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', onResize);
    };
  }, [ready, computeZooms]);

  // Después de cada cambio de nivel (applyZoom): espera el fin de la transición de ancho
  // (o un tiempo máximo, si el ancho no cambió), mide y centra
  useEffect(() => {
    if (!measured) return;
    const center = centerNext.current;
    centerNext.current = true;
    const grid = gridRef.current;
    let done = false;
    const settle = () => {
      const sc = scrollerRef.current;
      if (done || !sc) return;
      done = true;
      setOverflows(sc.scrollWidth > sc.clientWidth + 2);
      if (center) sc.scrollTo({ left: (sc.scrollWidth - sc.clientWidth) / 2, behavior: scrollBehavior() });
      syncWindow();
    };
    const onEnd = (e) => e.target === grid && e.propertyName === 'width' && settle();
    grid?.addEventListener('transitionend', onEnd);
    // Con movimiento reducido la transición dura .01ms y transitionend llega enseguida
    const t = setTimeout(settle, ZOOM_SETTLE_MS + 150);
    return () => {
      clearTimeout(t);
      grid?.removeEventListener('transitionend', onEnd);
    };
  }, [zooms, index, measured, scrollerRef, gridRef, syncWindow]);

  // Si la grilla o el contenedor cambian de tamaño (transición del zoom, giro), se vuelve a medir
  // sin depender de que la transición haya terminado a tiempo
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

  const zoomIn = useCallback(() => setIndex((i) => Math.min(zooms.length - 1, i + 1)), [zooms.length]);
  const zoomOut = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

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
    jumpTo,
    minimapProps,
    windowRef,
  };
}
