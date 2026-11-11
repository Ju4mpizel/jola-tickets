'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import { useToast } from '@/components/ui/ToastProvider';
import { formatMoney, seatCode } from '@/lib/event';
import { copyText } from '@/lib/feedback';
import { admin } from '@/services/api';
import RejectDialog from './RejectDialog';

const GHOST =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-[14px] border border-line bg-surface-2 px-3.5 text-[.9rem] font-extrabold text-ink ' +
  'transition-[transform,border-color] duration-150 active:scale-[.97] pointer-fine:hover:border-cyan-strong disabled:opacity-50';

const STATUS_BADGE = {
  pending_review: ['En revisión', 'border-band-line bg-band text-accent-ink'],
  approved: ['Aprobada', 'border-[rgba(34,176,125,.4)] bg-[rgba(34,176,125,.12)] text-ok'],
  rejected: ['Rechazada', 'border-[rgba(224,68,95,.35)] bg-[rgba(224,68,95,.1)] text-danger-ink'],
};

const isPdf = (o) => /\.pdf($|\?)/i.test(o.receipt_name || o.receipt_url || '');

/** "hoy 14:32 · hace 12 min" */
function sentAt(isoDate) {
  if (!isoDate) return '';
  const d = new Date(isoDate);
  const mins = Math.max(0, Math.round((Date.now() - d.getTime()) / 60_000));
  const time = d.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
  const day = new Date().toDateString() === d.toDateString() ? 'hoy' : d.toLocaleDateString('es-BO', { day: 'numeric', month: 'short' });
  const ago = mins < 1 ? 'recién' : mins < 60 ? `hace ${mins} min` : mins < 1440 ? `hace ${Math.floor(mins / 60)} h` : '';
  return [`${day} ${time}`, ago].filter(Boolean).join(' · ');
}

/**
 * Bandeja de órdenes de la directiva: tarjetas con los datos para comparar con la app del banco,
 * visor del comprobante, aprobar (con confirmación), rechazar (RejectDialog) y reenviar el correo.
 * Los datos los carga la página (/admin); aquí solo se actúa y se avisa con onChanged().
 * @param {{
 *   orders: object[],                       // GET /admin/orders?status=
 *   call: Function,                         // useAdmin().call: agrega el token
 *   onChanged: () => void,                  // recargar lista y números
 *   empty?: string,                         // texto si no hay órdenes en este filtro
 * }} props
 */
export default function OrderList({ orders, call, onChanged, empty = 'No hay órdenes.' }) {
  const toast = useToast();
  const [viewing, setViewing] = useState(null);
  const [approving, setApproving] = useState(null);
  const [approveBusy, setApproveBusy] = useState(false);
  const [rejecting, setRejecting] = useState(null);
  const [resending, setResending] = useState(null);
  // Aprobadas en esta sesión cuyo correo falló: quedan a la vista con "Reenviar correo"
  const [failedEmails, setFailedEmails] = useState([]);

  async function approve() {
    const order = approving;
    setApproveBusy(true);
    try {
      const res = await call(admin.approveOrder, order.id);
      if (res?.email_sent === false) {
        setFailedEmails((list) => [...list.filter((o) => o.id !== order.id), { ...order, status: 'approved', email_sent: false }]);
        toast(`${order.order_code} aprobada, pero no pudimos enviar el correo`);
      } else {
        toast(`${order.order_code} aprobada. Enviamos las entradas a ${order.buyer_email}`);
      }
      setApproving(null);
      onChanged();
    } catch (err) {
      if (err?.error !== 'UNAUTHORIZED') toast(err?.message || 'No pudimos aprobar la orden');
      if (err?.error === 'ORDER_NOT_PENDING') {
        setApproving(null);
        onChanged();
      }
    } finally {
      setApproveBusy(false);
    }
  }

  async function reject(reason) {
    const order = rejecting;
    try {
      await call(admin.rejectOrder, order.id, reason);
    } catch (err) {
      if (err?.error === 'ORDER_NOT_PENDING') {
        setRejecting(null);
        onChanged();
      }
      throw err;
    }
    toast(`${order.order_code} rechazada. Le avisamos a ${order.buyer_email}`);
    setRejecting(null);
    onChanged();
  }

  async function resend(order) {
    setResending(order.id);
    try {
      const res = await call(admin.resendEmail, order.id);
      if (res?.email_sent === false) {
        toast('No pudimos enviar el correo. Inténtalo de nuevo en un momento.');
      } else {
        setFailedEmails((list) => list.filter((o) => o.id !== order.id));
        toast(`Correo reenviado a ${order.buyer_email}`);
        onChanged();
      }
    } catch (err) {
      if (err?.error !== 'UNAUTHORIZED') toast(err?.message || 'No pudimos reenviar el correo');
    } finally {
      setResending(null);
    }
  }

  const shownIds = new Set(orders.map((o) => o.id));
  const extraFailed = failedEmails.filter((o) => !shownIds.has(o.id));

  return (
    <>
      {extraFailed.length > 0 && (
        <ul aria-label="Correos sin enviar" className="mb-4 grid list-none gap-2.5">
          {extraFailed.map((o) => (
            <li
              key={o.id}
              role="alert"
              className="flex flex-wrap items-center gap-3 rounded-2xl border border-[rgba(224,68,95,.35)] bg-[rgba(224,68,95,.08)] px-4 py-3"
            >
              <p className="min-w-0 flex-1 text-[.9rem] font-bold">
                {o.order_code} quedó aprobada, pero el correo a <span className="break-all">{o.buyer_email}</span> no se envió.
              </p>
              <Button className="h-11 px-4 text-[.9rem]" loading={resending === o.id} loadingText="Enviando" onClick={() => resend(o)}>
                Reenviar correo
              </Button>
            </li>
          ))}
        </ul>
      )}

      {orders.length === 0 && (
        <p className="rounded-card border border-dashed border-line px-4 py-10 text-center text-[.95rem] font-semibold text-muted">{empty}</p>
      )}

      <ul className="grid list-none gap-4 lg:grid-cols-2">
        {orders.map((o) => (
          <OrderCard
            key={o.id}
            order={o}
            resending={resending === o.id}
            onView={() => setViewing(o)}
            onApprove={() => setApproving(o)}
            onReject={() => setRejecting(o)}
            onResend={() => resend(o)}
            onCopy={async () => toast((await copyText(o.order_code)) ? 'Código copiado' : 'No pudimos copiar')}
          />
        ))}
      </ul>

      <ReceiptViewer order={viewing} onClose={() => setViewing(null)} />

      <Modal open={!!approving} onClose={approveBusy ? () => {} : () => setApproving(null)} labelledBy="approve-title">
        {approving && (
          <div>
            <h2 id="approve-title" className="text-[1.2rem] font-extrabold">
              ¿Aprobar {approving.order_code} por {formatMoney(approving.total)}?
            </h2>
            <p className="mt-1.5 text-[.92rem] font-semibold text-muted">
              Se enviarán las entradas a <b className="break-all text-ink">{approving.buyer_email}</b>.
            </p>
            <p className="mt-3 rounded-[14px] border border-band-line bg-band px-3.5 py-2.5 text-[.85rem] font-semibold">
              Antes de aprobar, confirma en la app del banco un ingreso de {formatMoney(approving.total)} con la glosa{' '}
              <b>{approving.order_code}</b>.
            </p>
            <div className="mt-4 flex gap-2.5">
              <Button variant="ghost" className="flex-1" disabled={approveBusy} onClick={() => setApproving(null)}>
                Cancelar
              </Button>
              <Button className="flex-1" loading={approveBusy} loadingText="Aprobando" onClick={approve}>
                Aprobar
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <RejectDialog order={rejecting} onClose={() => setRejecting(null)} onConfirm={reject} />
    </>
  );
}

/** Una orden: código grande, comprador, asientos, total, hora y miniatura del comprobante. */
function OrderCard({ order: o, resending, onView, onApprove, onReject, onResend, onCopy }) {
  const [label, badge] = STATUS_BADGE[o.status] ?? [o.status, 'border-line bg-surface-2 text-muted'];
  const titleId = `order-${o.id}`;

  return (
    <li>
      <article
        aria-labelledby={titleId}
        className="flex h-full flex-col gap-4 rounded-card border border-line bg-surface p-4 shadow-elev transition-colors duration-300 sm:p-5"
      >
        <header className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <button
              type="button"
              onClick={onCopy}
              aria-label={`Copiar código ${o.order_code}`}
              className="rounded-lg text-left"
            >
              <h3 id={titleId} className="font-brand text-[1.6rem] leading-none font-bold tracking-[.05em]">
                {o.order_code}
              </h3>
            </button>
            <p className="mt-1.5 text-[.8rem] font-semibold text-muted">Enviado {sentAt(o.submitted_at)}</p>
          </div>
          <span className={`rounded-full border px-2.5 py-1 text-[.75rem] font-extrabold ${badge}`}>{label}</span>
        </header>

        <div className="flex gap-4">
          <dl className="grid min-w-0 flex-1 content-start gap-1.5 text-[.9rem]">
            <dt className="sr-only">Nombre</dt>
            <dd className="text-base font-extrabold">{o.buyer_name}</dd>
            <dt className="sr-only">Celular</dt>
            <dd>
              <a
                href={`https://wa.me/591${o.buyer_phone}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-accent-ink underline underline-offset-4"
              >
                +591 {o.buyer_phone.replace(/(\d{4})(\d{4})/, '$1 $2')}
                <span className="sr-only"> (abre WhatsApp)</span>
              </a>
            </dd>
            <dt className="sr-only">Correo</dt>
            <dd className="truncate">
              <a href={`mailto:${o.buyer_email}`} className="font-semibold text-muted underline underline-offset-4">
                {o.buyer_email}
              </a>
            </dd>
            <dt className="sr-only">Asientos</dt>
            <dd className="mt-1 flex flex-wrap gap-1.5">
              {o.seats.map((s) => (
                <span key={`${s.row}${s.number}`} className="rounded-[9px] border border-line bg-surface-2 px-2 py-0.5 text-[.8rem] font-extrabold">
                  {seatCode(s.row, s.number)}
                </span>
              ))}
            </dd>
            <dt className="sr-only">Total</dt>
            <dd className="mt-1 text-[1.35rem] font-extrabold tracking-[-.02em] tabular-nums">{formatMoney(o.total)}</dd>
          </dl>

          <button
            type="button"
            onClick={onView}
            disabled={!o.receipt_url}
            aria-label={o.receipt_url ? `Ver comprobante de ${o.order_code}` : 'Comprobante sin vista previa'}
            className="grid h-32 w-24 flex-none place-items-center overflow-hidden rounded-xl border border-line bg-white transition-[transform,border-color] duration-150 enabled:active:scale-[.97] pointer-fine:enabled:hover:border-cyan-strong"
          >
            {!o.receipt_url ? (
              <span className="px-2 text-center text-[.72rem] font-bold text-[#56638A]">Sin vista previa</span>
            ) : isPdf(o) ? (
              <span className="text-center text-[.8rem] font-extrabold text-[#E0445F]">
                PDF
                <span className="block text-[.68rem] font-bold text-[#56638A]">Ver</span>
              </span>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- URL firmada (o local) del comprobante
              <img src={o.receipt_url} alt="" className="size-full object-cover object-top" />
            )}
          </button>
        </div>

        {o.status === 'pending_review' && (
          <div className="mt-auto grid grid-cols-2 gap-2.5">
            <button type="button" onClick={onReject} className={`${GHOST} h-12 text-danger-ink`}>
              Rechazar
            </button>
            <Button className="h-12" onClick={onApprove}>
              Aprobar
            </Button>
          </div>
        )}

        {o.status === 'approved' && (
          <div className="mt-auto flex flex-wrap items-center gap-2.5">
            {o.email_sent === false && (
              <span className="flex-1 text-[.85rem] font-bold text-danger-ink">El correo con las entradas no se envió.</span>
            )}
            <Button
              variant={o.email_sent === false ? 'primary' : 'ghost'}
              className="h-12 flex-1"
              loading={resending}
              loadingText="Enviando"
              onClick={onResend}
            >
              Reenviar correo
            </Button>
          </div>
        )}

        {o.status === 'rejected' && o.reject_reason && (
          <p className="mt-auto rounded-[14px] border border-[rgba(224,68,95,.3)] bg-[rgba(224,68,95,.06)] px-3.5 py-2.5 text-[.88rem] font-semibold">
            <span className="block text-[.7rem] font-bold tracking-[.06em] text-danger-ink uppercase">Motivo</span>
            {o.reject_reason}
          </p>
        )}
      </article>
    </li>
  );
}

/** Visor del comprobante: imagen con zoom, o PDF para abrir en otra pestaña. */
function ReceiptViewer({ order, onClose }) {
  const [zoom, setZoom] = useState(1);
  const pdf = order && isPdf(order);

  function close() {
    setZoom(1);
    onClose();
  }

  return (
    <Modal open={!!order} onClose={close} labelledBy="receipt-title" size="lg">
      {order && (
        <div>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 id="receipt-title" className="text-[1.15rem] font-extrabold">
                Comprobante de {order.order_code}
              </h2>
              <p className="text-[.85rem] font-semibold text-muted">
                Debe decir {formatMoney(order.total)} y la glosa <b className="text-ink">{order.order_code}</b>
              </p>
            </div>
            <button type="button" onClick={close} className={GHOST}>
              Cerrar
            </button>
          </div>

          {pdf ? (
            <div className="mt-4 grid place-items-center gap-3 rounded-2xl border border-line bg-surface-2 px-4 py-10 text-center">
              <span className="text-[1.4rem] font-extrabold text-danger-ink">PDF</span>
              <p className="text-[.9rem] font-semibold text-muted">{order.receipt_name}</p>
              <a href={order.receipt_url} target="_blank" rel="noopener noreferrer" className={GHOST}>
                Abrir el PDF
              </a>
            </div>
          ) : (
            <>
              <div className="mt-3 flex items-center justify-end gap-2" role="group" aria-label="Zoom del comprobante">
                <button type="button" className={`${GHOST} w-11 px-0`} aria-label="Alejar" disabled={zoom <= 1} onClick={() => setZoom((z) => Math.max(1, z - 0.5))}>
                  −
                </button>
                <span className="w-12 text-center text-[.85rem] font-bold tabular-nums">{Math.round(zoom * 100)} %</span>
                <button type="button" className={`${GHOST} w-11 px-0`} aria-label="Acercar" disabled={zoom >= 3} onClick={() => setZoom((z) => Math.min(3, z + 0.5))}>
                  +
                </button>
                <a href={order.receipt_url} target="_blank" rel="noopener noreferrer" className={GHOST}>
                  Abrir aparte
                </a>
              </div>
              <div className="mt-2 max-h-[65vh] overflow-auto rounded-2xl border border-line bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada (o local) del comprobante */}
                <img
                  src={order.receipt_url}
                  alt={`Comprobante de ${order.order_code}`}
                  onClick={() => setZoom((z) => (z === 1 ? 2 : 1))}
                  style={{ width: `${zoom * 100}%` }}
                  className={`mx-auto block max-w-none ${zoom === 1 ? 'cursor-zoom-in' : 'cursor-zoom-out'}`}
                />
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
