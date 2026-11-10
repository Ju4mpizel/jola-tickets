'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SEATS_REFRESH_MS } from '@/lib/event';
import { getSeats } from '@/services/api';

/**
 * Mapa de asientos desde GET /seats, actualizado cada 15 s.
 * `loading` solo es true en la primera carga (o al reintentar tras un error sin datos):
 * las actualizaciones periódicas son silenciosas. Mientras la pestaña está oculta no consulta.
 * @returns {{
 *   seats: { id: number, row: string, number: number, price: number, vip: boolean, status: 'available' | 'taken' }[],
 *   loading: boolean,
 *   error: import('@/services/api').ApiError | null,
 *   refresh: () => Promise<void>,
 * }}
 */
export default function useSeats() {
  const [seats, setSeats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const controller = useRef(null);
  const hasData = useRef(false);

  const refresh = useCallback(async () => {
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    if (!hasData.current) setLoading(true);
    try {
      const data = await getSeats({ signal: ctrl.signal });
      hasData.current = true;
      setSeats(data);
      setError(null);
    } catch (err) {
      if (err?.name === 'AbortError') return;
      setError(err);
    } finally {
      if (controller.current === ctrl) setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, SEATS_REFRESH_MS);
    // Al volver a la pestaña, actualiza enseguida
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      controller.current?.abort();
    };
  }, [refresh]);

  return { seats, loading, error, refresh };
}
