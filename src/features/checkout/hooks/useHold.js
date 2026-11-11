'use client';

import { useCallback, useState } from 'react';
import { useToast } from '@/components/ui/ToastProvider';
import { useOrder, usePurchaseFlow, useSelectionActions } from '@/context/PurchaseContext';
import { ROWS, seatCode } from '@/lib/event';
import { createHold as apiCreateHold, getSeats, releaseHold as apiReleaseHold } from '@/services/api';
import { refreshSeats } from '@/features/seat-map/hooks/useSeats';

/** Ids ordenados por fila y número (como los verá el comprador en el resumen y la orden). */
function sortIds(ids, seats) {
  const byId = new Map(seats.map((s) => [s.id, s]));
  return [...ids].sort((a, b) => {
    const sa = byId.get(a);
    const sb = byId.get(b);
    if (!sa || !sb) return a - b;
    return ROWS.indexOf(sa.row) - ROWS.indexOf(sb.row) || sa.number - sb.number;
  });
}

/**
 * Retención de asientos (POST /holds y DELETE /holds/{order_id}).
 * El total y el vencimiento siempre vienen del servidor.
 * No lee la selección (la recibe createHold): así quien solo libera la retención
 * no se vuelve a pintar al elegir asientos.
 * @returns {{
 *   creating: boolean,
 *   releasing: boolean,
 *   createHold: (ids: number[], seats: object[]) => Promise<void>,   // seats: el mapa actual, para ordenar los ids
 *   releaseHold: () => Promise<void>,
 *   expireHold: () => void,
 * }}
 */
export default function useHold() {
  const { buyer, goTo } = usePurchaseFlow();
  const { removeSeats } = useSelectionActions();
  const { order, holdCreated, holdReleased, holdExpired } = useOrder();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [releasing, setReleasing] = useState(false);

  const createHold = useCallback(
    async (selected, seats = []) => {
      if (!buyer || !selected.length || creating) return;
      setCreating(true);
      try {
        const ids = sortIds(selected, seats);
        const data = await apiCreateHold(ids, buyer);
        const byId = new Map(seats.map((s) => [s.id, s]));
        holdCreated(
          data,
          ids.map((id) => byId.get(id)).filter(Boolean).map((s) => seatCode(s.row, s.number)),
        );
        goTo('pago');
      } catch (err) {
        if (err?.error === 'SEAT_TAKEN') {
          // Quedan elegidas solo las que siguen libres; luego se actualiza el mapa
          try {
            const fresh = await getSeats();
            const free = new Set(fresh.filter((s) => s.status === 'available').map((s) => s.id));
            removeSeats(selected.filter((id) => !free.has(id)));
          } catch {
            /* sin conexión: el refresco del mapa lo resolverá */
          }
          toast('Alguien acaba de tomar uno de tus asientos');
          refreshSeats();
        } else {
          toast(err?.message || 'No pudimos reservar tus asientos. Inténtalo de nuevo.');
        }
      } finally {
        setCreating(false);
      }
    },
    [buyer, creating, holdCreated, goTo, removeSeats, toast],
  );

  /** Libera la retención al volver al mapa. Si falla, la retención igual vence sola en el servidor. */
  const releaseHold = useCallback(async () => {
    if (!order) return;
    setReleasing(true);
    try {
      await apiReleaseHold(order.order_id, order.access_token);
    } catch {
      /* se ignora: release_hold no hace nada si la orden ya no está pendiente */
    } finally {
      holdReleased();
      setReleasing(false);
    }
  }, [order, holdReleased]);

  /**
   * El temporizador llegó a 0: HOLD_EXPIRED, vuelta al mapa y aviso. El frontend vence con un
   * margen antes que el servidor, así que PurchaseFlow libera la retención (releaseHold) antes de
   * que el mapa se actualice; si no, sus sillas figurarían ocupadas.
   */
  const expireHold = useCallback(() => {
    holdExpired();
    goTo('asientos', { replace: true });
    toast('Se acabó el tiempo de reserva');
  }, [holdExpired, goTo, toast]);

  return { creating, releasing, createHold, releaseHold, expireHold };
}
