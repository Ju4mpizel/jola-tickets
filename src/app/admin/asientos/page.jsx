'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Topbar from '@/components/layout/Topbar';
import Button, { Spinner } from '@/components/ui/Button';
import { useAnnounce, useToast } from '@/components/ui/ToastProvider';
import AdminNav from '@/features/admin/AdminNav';
import useAdmin from '@/features/admin/hooks/useAdmin';
import { ADMIN_STATUS } from '@/features/seat-map/Seat';
import SeatMap from '@/features/seat-map/SeatMap';
import { SEATS_REFRESH_MS, seatCode } from '@/lib/event';
import { copyText } from '@/lib/feedback';
import { admin } from '@/services/api';

const BAR =
  'fixed inset-x-0 bottom-0 z-20 animate-sheet-up rounded-t-[22px] border-t border-line bg-surface px-4 pt-3.5 ' +
  'pb-[calc(14px+env(safe-area-inset-bottom))] shadow-[0_-10px_30px_-12px_rgba(10,31,92,.18)] transition-colors duration-300 ' +
  'sm:mx-auto sm:max-w-[640px] sm:border-x';

/**
 * Gestión de asientos de la directiva: mapa con los cinco estados (GET /admin/seats).
 * Tocar una silla vendida, en revisión o retenida muestra su orden; las libres y bloqueadas
 * se marcan para bloquearlas o desbloquearlas juntas (POST /admin/seats/block).
 */
export default function AdminSeatsPage() {
  const { session, ready, logout, call } = useAdmin({ require: true });
  const toast = useToast();
  const announce = useAnnounce();
  const [seats, setSeats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState([]);
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(null); // 'block' | 'unblock'
  const barRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const list = await call(admin.listSeats);
      setSeats(list);
      setError(null);
    } catch (err) {
      if (err?.error !== 'UNAUTHORIZED') setError(err);
    } finally {
      setLoading(false);
    }
  }, [call]);

  // Carga y se actualiza cada 15 s con la pestaña visible (como el mapa público)
  useEffect(() => {
    if (!session) return;
    load();
    const tick = () => document.visibilityState === 'visible' && load();
    const id = setInterval(tick, SEATS_REFRESH_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [session, load]);

  const byId = useMemo(() => new Map(seats.map((s) => [s.id, s])), [seats]);
  // Si una silla marcada cambió de estado (ej. alguien la compró), deja de estar marcada
  const marked = selected.filter((id) => ['available', 'blocked'].includes(byId.get(id)?.status));
  const toBlock = marked.filter((id) => byId.get(id).status === 'available');
  const toUnblock = marked.filter((id) => byId.get(id).status === 'blocked');

  const onSeatClick = useCallback(
    (cell) => {
      if (cell.status === 'available' || cell.status === 'blocked') {
        setInfo(null);
        setSelected((list) => (list.includes(cell.id) ? list.filter((id) => id !== cell.id) : [...list, cell.id]));
        return;
      }
      setInfo(cell);
      announce(`${cell.code}: ${ADMIN_STATUS[cell.status]}${cell.order_code ? `, orden ${cell.order_code}` : ''}`);
    },
    [announce],
  );

  async function apply(blocked) {
    const ids = blocked ? toBlock : toUnblock;
    setBusy(blocked ? 'block' : 'unblock');
    try {
      const { changed } = await call(admin.blockSeats, ids, blocked);
      toast(`${changed} ${changed === 1 ? 'silla' : 'sillas'} ${blocked ? 'bloqueada' : 'desbloqueada'}${changed === 1 ? '' : 's'}`);
      setSelected((list) => list.filter((id) => !ids.includes(id)));
      await load();
    } catch (err) {
      if (err?.error !== 'UNAUTHORIZED') toast(err?.message || 'No pudimos cambiar las sillas');
    } finally {
      setBusy(null);
    }
  }

  // Altura de la barra en --sum-h: el widget del mapa flota justo encima
  const barOpen = marked.length > 0 || !!info;
  useEffect(() => {
    const el = barRef.current;
    const root = document.documentElement;
    if (!el || typeof ResizeObserver === 'undefined') {
      root.style.removeProperty('--sum-h');
      return;
    }
    let last = -1;
    const update = () => {
      const h = Math.round(el.offsetHeight);
      if (h === last) return;
      last = h;
      root.style.setProperty('--sum-h', `${h}px`);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty('--sum-h');
    };
  }, [barOpen]);

  if (!ready || !session) {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        <Spinner className="text-accent-ink" />
      </div>
    );
  }

  return (
    <>
      <Topbar subtitle="Panel de la directiva" />
      <AdminNav email={session.email} onLogout={logout} />

      <main className={barOpen ? 'pb-[calc(var(--sum-h,120px)+20px)]' : ''}>
        <SeatMap
          mode="admin"
          titleId="admin-seats-title"
          seats={seats}
          loading={loading}
          error={error}
          onRetry={load}
          selected={marked}
          onSeatClick={onSeatClick}
        />
      </main>

      {barOpen && (
        <aside ref={barRef} aria-label={info ? 'Silla elegida' : 'Sillas marcadas'} className={BAR}>
          {info ? (
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1" aria-live="polite">
                <p className="text-[.8rem] font-bold text-muted">
                  Silla {info.code} · {ADMIN_STATUS[info.status]}
                </p>
                <p className="font-brand text-[1.25rem] font-bold tracking-[.04em] whitespace-nowrap">{info.order_code ?? 'Sin orden'}</p>
              </div>
              {info.order_code && (
                <Button
                  variant="ghost"
                  className="h-11 px-4 text-[.9rem]"
                  onClick={async () => toast((await copyText(info.order_code)) ? 'Código copiado' : 'No pudimos copiar')}
                >
                  Copiar código
                </Button>
              )}
              <Button variant="ghost" className="h-11 px-4 text-[.9rem]" onClick={() => setInfo(null)}>
                Cerrar
              </Button>
            </div>
          ) : (
            <div className="grid gap-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[.9rem] font-extrabold" aria-live="polite">
                  {marked.length} {marked.length === 1 ? 'silla marcada' : 'sillas marcadas'}
                  <span className="block text-[.78rem] font-semibold text-muted">
                    {marked
                      .map((id) => byId.get(id))
                      .map((s) => seatCode(s.row, s.number))
                      .join(', ')}
                  </span>
                </p>
                <button
                  type="button"
                  onClick={() => setSelected([])}
                  className="rounded-lg px-2 py-1 text-[.85rem] font-bold text-muted underline underline-offset-4"
                >
                  Limpiar
                </button>
              </div>
              <div className="flex gap-2.5">
                {toBlock.length > 0 && (
                  <Button
                    className="h-12 flex-1"
                    loading={busy === 'block'}
                    loadingText="Bloqueando"
                    disabled={!!busy}
                    onClick={() => apply(true)}
                  >
                    Bloquear {toBlock.length}
                  </Button>
                )}
                {toUnblock.length > 0 && (
                  <Button
                    variant="ghost"
                    className="h-12 flex-1"
                    loading={busy === 'unblock'}
                    loadingText="Desbloqueando"
                    disabled={!!busy}
                    onClick={() => apply(false)}
                  >
                    Desbloquear {toUnblock.length}
                  </Button>
                )}
              </div>
            </div>
          )}
        </aside>
      )}
    </>
  );
}
