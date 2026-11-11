'use client';

import { useEffect, useRef, useState } from 'react';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';

const QUICK_REASONS = [
  'Monto incorrecto',
  'No encontramos la transferencia',
  'Comprobante ilegible',
  'Falta el código en la glosa',
];
const MAX_REASON = 300;

/**
 * Rechazar una orden: motivos rápidos más texto libre. El motivo le llega al comprador
 * por correo y en la página de su orden.
 * @param {{
 *   order: { order_code: string, buyer_email: string } | null,   // null = cerrado
 *   onClose: () => void,
 *   onConfirm: (reason: string) => Promise<void>,
 * }} props
 */
export default function RejectDialog({ order, onClose, onConfirm }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const textRef = useRef(null);

  // Cada vez que se abre, empieza vacío
  useEffect(() => {
    if (!order) return;
    setReason('');
    setError('');
    setSending(false);
  }, [order]);

  function pickQuick(text) {
    setReason(text);
    setError('');
    textRef.current?.focus();
  }

  async function submit(e) {
    e.preventDefault();
    const clean = reason.trim();
    if (!clean) {
      setError('Escribe o elige el motivo del rechazo');
      textRef.current?.focus();
      return;
    }
    setSending(true);
    try {
      await onConfirm(clean);
    } catch (err) {
      setError(err?.message || 'No pudimos rechazar la orden');
      setSending(false);
    }
  }

  return (
    <Modal open={!!order} onClose={sending ? () => {} : onClose} labelledBy="reject-title">
      {order && (
        <form onSubmit={submit} noValidate>
          <h2 id="reject-title" className="text-[1.2rem] font-extrabold">
            Rechazar {order.order_code}
          </h2>
          <p className="mt-1 text-[.88rem] font-semibold text-muted">
            Le avisaremos a <b className="break-all text-ink">{order.buyer_email}</b> con este motivo y los asientos se liberarán.
          </p>

          <fieldset className="mt-4">
            <legend className="text-[.85rem] font-extrabold">Motivos rápidos</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {QUICK_REASONS.map((text) => (
                <button
                  key={text}
                  type="button"
                  aria-pressed={reason === text}
                  onClick={() => pickQuick(text)}
                  className={
                    'min-h-10 rounded-full border px-3.5 text-[.85rem] font-bold transition-colors duration-150 ' +
                    (reason === text ? 'border-sel bg-sel text-on-sel' : 'border-line bg-surface text-ink pointer-fine:hover:border-cyan-strong')
                  }
                >
                  {text}
                </button>
              ))}
            </div>
          </fieldset>

          <label htmlFor="reject-reason" className="mt-4 block text-[.85rem] font-extrabold">
            Motivo
          </label>
          <textarea
            ref={textRef}
            id="reject-reason"
            rows={3}
            maxLength={MAX_REASON}
            value={reason}
            aria-invalid={!!error || undefined}
            aria-describedby="reject-err"
            onChange={(e) => {
              setReason(e.target.value);
              if (error) setError('');
            }}
            placeholder="Ej.: El monto transferido fue Bs 100 y el total era Bs 130."
            className={
              'mt-1.5 w-full resize-y rounded-[14px] border-[1.5px] bg-surface-2 px-3.5 py-3 text-base font-semibold text-ink outline-none ' +
              'focus:border-cyan-strong focus:bg-surface ' +
              (error ? 'border-danger' : 'border-line')
            }
          />
          <p id="reject-err" aria-live="polite" className="mt-1 text-[.82rem] font-bold text-danger-ink empty:hidden">
            {error}
          </p>

          <div className="mt-4 flex gap-2.5">
            <Button variant="ghost" className="flex-1" onClick={onClose} disabled={sending}>
              Cancelar
            </Button>
            <Button
              type="submit"
              loading={sending}
              loadingText="Rechazando"
              className="flex-1 bg-danger! text-white!"
            >
              Rechazar
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
