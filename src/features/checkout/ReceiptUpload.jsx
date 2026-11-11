'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Button from '@/components/ui/Button';
import { IconArrowRight } from '@/components/ui/icons';
import { useAnnounce, useToast } from '@/components/ui/ToastProvider';
import { useOrder, usePurchaseFlow } from '@/context/PurchaseContext';
import compressImage from '@/lib/compressImage';
import { validateReceipt } from '@/lib/validators';
import { submitReceipt } from '@/services/api';

/** "1,4 MB" o "820 KB" */
function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toLocaleString('es-BO', { maximumFractionDigits: 1 })} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

const isPdf = (file) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

/**
 * Subida del comprobante: elegir imagen o PDF (o arrastrarlo en PC), vista previa, validación
 * (JPG, PNG, WEBP o PDF de máximo 4 MB), compresión de imágenes a menos de 2 MB y envío
 * con barra de progreso (POST /orders/{order_id}/receipt).
 * @param {{
 *   onUploadStart: () => void,
 *   onUploadEnd: (ok: boolean, expired: boolean) => void,   // ok: aceptado; expired: HOLD_EXPIRED
 * }} props
 */
export default function ReceiptUpload({ onUploadStart, onUploadEnd }) {
  const { goTo } = usePurchaseFlow();
  const { order, receiptSubmitted } = useOrder();
  const toast = useToast();
  const announce = useAnnounce();
  const inputId = useId();
  const inputRef = useRef(null);
  const [file, setFile] = useState(null); // ya validado y comprimido
  const [preview, setPreview] = useState(null); // URL local de la imagen
  const [preparing, setPreparing] = useState(false);
  const [progress, setProgress] = useState(null); // 0–1 mientras sube
  const [error, setError] = useState('');
  const [networkError, setNetworkError] = useState(false);
  const [dragging, setDragging] = useState(false);
  const uploading = progress !== null;

  // La URL local de la vista previa se libera al cambiar de archivo o al salir
  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  async function pick(chosen) {
    if (!chosen || uploading) return;
    setNetworkError(false);
    const invalid = validateReceipt(chosen);
    if (invalid) {
      setError(invalid.message);
      announce(invalid.message);
      return;
    }
    setError('');
    setPreparing(true);
    try {
      const ready = await compressImage(chosen);
      setFile(ready);
      setPreview(isPdf(ready) ? null : URL.createObjectURL(ready));
      announce(`Comprobante listo: ${ready.name}`);
    } catch {
      setError('No pudimos leer esa imagen. Prueba con otra captura.');
    } finally {
      setPreparing(false);
    }
  }

  async function send() {
    if (!file || !order || uploading) return;
    setError('');
    setNetworkError(false);
    setProgress(0);
    onUploadStart();
    let ok = false;
    let expired = false;
    try {
      await submitReceipt(order.order_id, order.access_token, file, { onProgress: setProgress });
      ok = true;
      receiptSubmitted();
      goTo('revision');
    } catch (err) {
      const code = err?.error;
      if (code === 'HOLD_EXPIRED') {
        expired = true; // PaymentStep vuelve al mapa con el aviso
      } else if (code === 'FILE_TOO_LARGE' || code === 'FILE_TYPE' || code === 'INVALID_DATA') {
        setError(err.message);
      } else if (code === 'NETWORK_ERROR' || code === 'SERVER_ERROR') {
        setNetworkError(true);
        setError(err.message);
      } else {
        toast(err?.message || 'No pudimos enviar tu comprobante');
      }
    } finally {
      setProgress(null);
      onUploadEnd(ok, expired);
    }
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    pick(e.dataTransfer.files?.[0]);
  }

  const errorId = `${inputId}-err`;
  const percent = Math.round((progress ?? 0) * 100);

  return (
    <section
      aria-labelledby={`${inputId}-title`}
      className="rounded-card border border-line bg-surface p-5 shadow-elev transition-colors duration-300"
    >
      <h3 id={`${inputId}-title`} className="text-base font-extrabold">
        Sube tu comprobante
      </h3>
      <p className="mt-0.5 text-[.85rem] font-semibold text-muted">Una captura o PDF de la transferencia (máximo 4 MB).</p>

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="image/*,application/pdf"
        className="sr-only"
        aria-describedby={error ? errorId : undefined}
        aria-invalid={!!error || undefined}
        disabled={uploading}
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = ''; // permite volver a elegir el mismo archivo
        }}
      />

      {file ? (
        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-line bg-surface-2 p-3">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:)
            <img src={preview} alt="Vista previa del comprobante" className="size-20 flex-none rounded-xl bg-white object-contain" />
          ) : (
            <span
              aria-hidden="true"
              className="grid size-20 flex-none place-items-center rounded-xl bg-white text-[.85rem] font-extrabold text-danger"
            >
              PDF
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[.9rem] font-bold">{file.name}</p>
            <p className="text-[.8rem] font-semibold text-muted">{formatBytes(file.size)}</p>
            <label
              htmlFor={inputId}
              className={`mt-1 inline-block cursor-pointer text-[.85rem] font-extrabold text-accent-ink underline underline-offset-4 ${uploading ? 'pointer-events-none opacity-50' : ''}`}
            >
              Cambiar archivo
            </label>
          </div>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={
            'mt-4 flex cursor-pointer flex-col items-center gap-1 rounded-2xl border-2 border-dashed px-4 py-7 text-center transition-colors duration-200 ' +
            'focus-within:outline-2 focus-within:outline-cyan-strong ' +
            (dragging ? 'border-cyan-strong bg-band' : 'border-line bg-surface-2 pointer-fine:hover:border-cyan-strong')
          }
        >
          <span className="text-[.95rem] font-extrabold text-ink">{preparing ? 'Preparando la imagen…' : 'Elegir imagen o PDF'}</span>
          <span className="text-[.8rem] font-semibold text-muted">
            JPG, PNG, WEBP o PDF<span className="hidden pointer-fine:inline"> · o arrástralo aquí</span>
          </span>
        </label>
      )}

      {error && (
        <p id={errorId} role="alert" className="mt-2.5 text-[.85rem] font-bold text-danger-ink">
          {error}
        </p>
      )}

      {uploading && (
        <div className="mt-4">
          <div
            role="progressbar"
            aria-label="Subiendo comprobante"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="h-2 overflow-hidden rounded-full bg-surface-3"
          >
            <div
              className="h-full origin-left rounded-full bg-cyan-strong transition-transform duration-200"
              style={{ transform: `scaleX(${progress})` }}
            />
          </div>
          <p className="mt-1 text-right text-[.75rem] font-bold text-muted tabular-nums">{percent} %</p>
        </div>
      )}

      <Button
        className="mt-4 w-full"
        disabled={!file || preparing}
        loading={uploading}
        loadingText="Enviando comprobante"
        icon={<IconArrowRight />}
        onClick={send}
      >
        {networkError ? 'Reintentar' : 'Enviar comprobante'}
      </Button>
    </section>
  );
}
