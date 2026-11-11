'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { SEATS_REFRESH_MS } from '@/lib/event';
import { getSeats } from '@/services/api';

/*
 * Mapa de asientos desde GET /seats, compartido por toda la página (un solo pedido y un solo
 * intervalo aunque lo lean el mapa y el resumen). Se actualiza cada 15 s mientras haya un
 * lector activo y la pestaña esté visible, y solo cambia el estado si algo cambió.
 */

const EMPTY = { seats: [], loading: true, error: null };
let snapshot = EMPTY;
const listeners = new Set();
let controller = null;
let activeReaders = 0;
let timer = null;

function setSnapshot(patch) {
  const next = { ...snapshot, ...patch };
  if (next.seats === snapshot.seats && next.loading === snapshot.loading && next.error === snapshot.error) return;
  snapshot = next;
  listeners.forEach((l) => l());
}

/** true si las dos listas tienen las mismas sillas con el mismo estado y precio. */
function sameSeats(a, b) {
  if (a.length !== b.length) return false;
  return a.every((s, i) => {
    const o = b[i];
    return s.id === o.id && s.status === o.status && s.price === o.price && s.row === o.row && s.number === o.number && s.vip === o.vip;
  });
}

/**
 * Pide el mapa ya mismo. `loading` solo pasa a true si todavía no hay datos (primera carga o
 * reintento tras un error): las actualizaciones periódicas son silenciosas.
 * @returns {Promise<object[]>}  las sillas vigentes (o las anteriores si falló)
 */
export async function refreshSeats() {
  controller?.abort();
  const ctrl = new AbortController();
  controller = ctrl;
  if (!snapshot.seats.length) setSnapshot({ loading: true });
  try {
    const data = await getSeats({ signal: ctrl.signal });
    setSnapshot({ seats: sameSeats(snapshot.seats, data) ? snapshot.seats : data, error: null });
  } catch (err) {
    if (err?.name === 'AbortError') return snapshot.seats;
    setSnapshot({ error: err });
  } finally {
    if (controller === ctrl) setSnapshot({ loading: false });
  }
  return snapshot.seats;
}

const onVisible = () => document.visibilityState === 'visible' && refreshSeats();

function startPolling() {
  refreshSeats();
  timer = setInterval(() => document.visibilityState === 'visible' && refreshSeats(), SEATS_REFRESH_MS);
  document.addEventListener('visibilitychange', onVisible);
}

function stopPolling() {
  clearInterval(timer);
  timer = null;
  document.removeEventListener('visibilitychange', onVisible);
  controller?.abort();
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * @param {{ active?: boolean }} [options]
 *   active: este lector mantiene el mapa al día (el mapa visible). false: solo lee lo que hay
 *   (ej. el resumen, o el mapa escondido mientras se paga).
 * @returns {{
 *   seats: { id: number, row: string, number: number, price: number, vip: boolean, status: 'available' | 'taken' }[],
 *   loading: boolean,
 *   error: import('@/services/api').ApiError | null,
 *   refresh: () => Promise<object[]>,
 * }}
 */
export default function useSeats({ active = true } = {}) {
  const state = useSyncExternalStore(subscribe, () => snapshot, () => EMPTY);

  useEffect(() => {
    if (!active) return;
    activeReaders += 1;
    if (activeReaders === 1) startPolling();
    return () => {
      activeReaders -= 1;
      if (activeReaders === 0) stopPolling();
    };
  }, [active]);

  return { ...state, refresh: refreshSeats };
}
