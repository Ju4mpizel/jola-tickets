'use client';

import { useCallback, useEffect, useState } from 'react';
import Topbar from '@/components/layout/Topbar';
import Button, { Spinner } from '@/components/ui/Button';
import AdminNav from '@/features/admin/AdminNav';
import OrderList from '@/features/admin/OrderList';
import useAdmin from '@/features/admin/hooks/useAdmin';
import { ORDER_REFRESH_MS, TOTAL_SEATS, formatMoney } from '@/lib/event';
import { admin } from '@/services/api';

const FILTERS = [
  { id: 'pending_review', label: 'En revisión', empty: 'No hay comprobantes por revisar.' },
  { id: 'approved', label: 'Aprobadas', empty: 'Todavía no hay órdenes aprobadas.' },
  { id: 'rejected', label: 'Rechazadas', empty: 'No hay órdenes rechazadas.' },
];

/** Bandeja de la directiva: números del evento, filtros y órdenes. Se actualiza cada 30 s. */
export default function AdminPage() {
  const { session, ready, logout, call } = useAdmin({ require: true });
  const [status, setStatus] = useState('pending_review');
  const [orders, setOrders] = useState(null);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const [list, numbers] = await Promise.all([call(admin.listOrders, status), call(admin.getStats)]);
      setOrders(list);
      setStats(numbers);
      setError(null);
    } catch (err) {
      if (err?.error !== 'UNAUTHORIZED') setError(err);
    }
  }, [call, status]);

  // Carga al entrar o cambiar de filtro; luego cada 30 s con la pestaña visible y al volver a ella
  useEffect(() => {
    if (!session) return;
    setOrders(null);
    load();
    const tick = () => document.visibilityState === 'visible' && load();
    const id = setInterval(tick, ORDER_REFRESH_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [session, load]);

  // "(3) JOLA Admin" en la pestaña mientras haya comprobantes por revisar
  const pending = stats?.pending_review ?? 0;
  useEffect(() => {
    document.title = pending ? `(${pending}) JOLA Admin` : 'JOLA Admin';
  }, [pending]);

  if (!ready || !session) {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        <Spinner className="text-accent-ink" />
      </div>
    );
  }

  const filter = FILTERS.find((f) => f.id === status);

  return (
    <>
      <Topbar subtitle="Panel de la directiva" />
      <AdminNav email={session.email} onLogout={logout} badge={pending} />

      <main className="grid animate-fade-in gap-5">
        <h1 className="text-[1.4rem] font-extrabold">Órdenes</h1>

        <dl className="grid grid-cols-3 gap-2.5 sm:gap-4">
          {[
            ['Vendidos', stats ? `${stats.sold}` : '–', `de ${TOTAL_SEATS}`],
            ['En revisión', stats ? `${stats.pending_review}` : '–', 'órdenes'],
            ['Recaudado', stats ? formatMoney(stats.revenue) : '–', 'aprobado'],
          ].map(([label, value, hint]) => (
            <div key={label} className="rounded-2xl border border-line bg-surface px-3 py-3 shadow-elev-sm transition-colors duration-300 sm:px-4">
              <dt className="text-[.7rem] font-bold tracking-[.06em] text-muted uppercase">{label}</dt>
              <dd className="mt-0.5 text-[1.2rem] leading-tight font-extrabold tabular-nums sm:text-[1.5rem]">{value}</dd>
              <dd className="text-[.72rem] font-semibold text-muted">{hint}</dd>
            </div>
          ))}
        </dl>

        <div role="group" aria-label="Filtrar órdenes" className="flex gap-2 overflow-x-auto pb-1">
          {FILTERS.map((f) => {
            const on = f.id === status;
            return (
              <button
                key={f.id}
                type="button"
                aria-pressed={on}
                onClick={() => setStatus(f.id)}
                className={
                  'inline-flex min-h-11 flex-none items-center gap-1.5 rounded-full border px-3.5 text-[.88rem] font-extrabold transition-colors duration-150 sm:gap-2 sm:px-4 sm:text-[.9rem] ' +
                  (on ? 'border-primary bg-primary text-on-primary' : 'border-line bg-surface text-ink pointer-fine:hover:border-cyan-strong')
                }
              >
                {f.label}
                {f.id === 'pending_review' && pending > 0 && (
                  <span
                    className={`grid min-w-6 place-items-center rounded-full px-1.5 text-[.75rem] ${on ? 'bg-on-primary text-primary' : 'bg-danger text-white'}`}
                  >
                    {pending}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {error && (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
            <p className="flex-1 text-[.9rem] font-bold text-danger-ink">{error.message}</p>
            <Button variant="ghost" className="h-11 px-4 text-[.9rem]" onClick={load}>
              Reintentar
            </Button>
          </div>
        )}

        <section aria-label={filter.label} aria-busy={!orders || undefined}>
          {!orders ? (
            <div className="grid place-items-center py-12">
              <Spinner className="text-accent-ink" />
            </div>
          ) : (
            <OrderList orders={orders} call={call} onChanged={load} empty={filter.empty} />
          )}
        </section>
      </main>
    </>
  );
}
