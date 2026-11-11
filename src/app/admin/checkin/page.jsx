'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Topbar from '@/components/layout/Topbar';
import Button, { Spinner } from '@/components/ui/Button';
import { IconCheck } from '@/components/ui/icons';
import { useToast } from '@/components/ui/ToastProvider';
import AdminNav from '@/features/admin/AdminNav';
import QrScanner from '@/features/admin/QrScanner';
import useAdmin from '@/features/admin/hooks/useAdmin';
import { vibrate } from '@/lib/feedback';
import { admin } from '@/services/api';

/** Cuánto se muestra cada resultado (y se pausa la lectura). */
const RESULT_MS = 2000;
/** Un mismo boleto no se vuelve a consultar durante este tiempo (sigue frente a la cámara). */
const SAME_TOKEN_MS = 6000;

const VIBRATION = { ok: [70], used: [60, 60, 60, 60, 60], invalid: [250, 100, 250] };

const RESULT_STYLE = {
  ok: 'bg-ok text-white',
  used: 'bg-[#E8A23A] text-[#2A1A00]',
  invalid: 'bg-danger text-white',
};

/**
 * Token del boleto a partir del QR (la URL completa …/tickets/<token>) o de lo que se escriba
 * a mano (la URL o el token). null si no parece un boleto.
 */
function extractToken(text) {
  const value = String(text || '').trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    const match = url.pathname.match(/\/tickets\/([^/?#]+)\/?$/);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    /* no es una URL: puede ser el token solo */
  }
  const fromPath = value.match(/tickets\/([A-Za-z0-9_-]+)/);
  if (fromPath) return fromPath[1];
  return /^[A-Za-z0-9_-]{16,}$/.test(value) ? value : null;
}

const timeOf = (iso) => (iso ? new Date(iso).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' }) : '');

/**
 * Escáner de la puerta: lee el QR del boleto, llama a POST /admin/check-in y muestra el resultado
 * a pantalla completa durante 2 s (verde, ámbar o rojo, con vibración distinta). Alternativa sin
 * cámara: escribir el enlace o el código del boleto.
 */
export default function CheckinPage() {
  const { session, ready, logout, call } = useAdmin({ require: true });
  const toast = useToast();
  const [result, setResult] = useState(null); // { kind, title, detail }
  const [checking, setChecking] = useState(false);
  const [stats, setStats] = useState(null);
  const [manual, setManual] = useState('');
  const lastToken = useRef({ token: '', at: 0 });
  const busy = useRef(false);
  const hideTimer = useRef(null);

  const loadStats = useCallback(async () => {
    try {
      setStats(await call(admin.getStats));
    } catch {
      /* el contador no es imprescindible */
    }
  }, [call]);

  useEffect(() => {
    if (session) loadStats();
  }, [session, loadStats]);

  useEffect(() => () => clearTimeout(hideTimer.current), []);

  const show = useCallback((next) => {
    vibrate(VIBRATION[next.kind]);
    setResult(next);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setResult(null), RESULT_MS);
  }, []);

  const check = useCallback(
    async (text, { fromCamera = false } = {}) => {
      if (busy.current) return;
      const token = extractToken(text);
      if (!token) {
        show({ kind: 'invalid', title: 'Boleto no válido', detail: 'Este código no es una entrada del festival.' });
        return;
      }
      // La cámara sigue viendo el mismo QR después del resultado: no se consulta dos veces
      const now = Date.now();
      if (fromCamera && lastToken.current.token === token && now - lastToken.current.at < SAME_TOKEN_MS) return;
      lastToken.current = { token, at: now };

      busy.current = true;
      setChecking(true);
      try {
        const res = await call(admin.checkIn, token);
        const seat = `Fila ${res.row} · Asiento ${res.number}`;
        if (res.result === 'OK') {
          show({ kind: 'ok', title: 'Bienvenido/a', name: res.buyer_name, detail: seat });
        } else {
          show({ kind: 'used', title: `Este boleto ya ingresó a las ${timeOf(res.scanned_at)}`, name: res.buyer_name, detail: seat });
        }
        loadStats();
      } catch (err) {
        if (err?.error === 'TICKET_NOT_FOUND' || err?.status === 404) {
          show({ kind: 'invalid', title: 'Boleto no válido', detail: 'No encontramos esta entrada.' });
        } else if (err?.error !== 'UNAUTHORIZED') {
          lastToken.current = { token: '', at: 0 }; // sin conexión: se puede volver a intentar ya
          toast(err?.message || 'No pudimos verificar el boleto. Inténtalo de nuevo.');
        }
      } finally {
        busy.current = false;
        setChecking(false);
      }
    },
    [call, show, loadStats, toast],
  );

  function onManualSubmit(e) {
    e.preventDefault();
    if (!manual.trim()) return;
    check(manual);
    setManual('');
  }

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
      <AdminNav email={session.email} onLogout={logout} badge={stats?.pending_review ?? 0} />

      <main className="mx-auto grid w-full max-w-[480px] animate-fade-in gap-4">
        <div className="flex items-end justify-between gap-3">
          <h1 className="text-[1.4rem] font-extrabold">Puerta</h1>
          <p className="text-right text-[.9rem] font-bold text-muted" aria-live="polite">
            Ingresaron <b className="text-[1.2rem] text-ink tabular-nums">{stats?.checked_in ?? '–'}</b> de{' '}
            <b className="text-ink tabular-nums">{stats?.sold ?? '–'}</b> vendidos
          </p>
        </div>

        <QrScanner paused={!!result || checking} onResult={(text) => check(text, { fromCamera: true })} />

        <form onSubmit={onManualSubmit} className="grid gap-2 rounded-card border border-line bg-surface p-4 shadow-elev-sm">
          <label htmlFor="manual-code" className="text-[.88rem] font-extrabold">
            Sin cámara: pega el enlace o el código del boleto
          </label>
          <div className="flex gap-2">
            <input
              id="manual-code"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="https://…/tickets/… o el código"
              className="h-12 min-w-0 flex-1 rounded-[14px] border-[1.5px] border-line bg-surface-2 px-3.5 text-base font-semibold text-ink outline-none focus:border-cyan-strong"
            />
            <Button type="submit" className="h-12 px-5" loading={checking} loadingText="…" disabled={!manual.trim()}>
              Verificar
            </Button>
          </div>
        </form>
      </main>

      {result && (
        <button
          type="button"
          role="alert"
          onClick={() => setResult(null)}
          aria-label={`${result.title}. ${result.name ?? ''} ${result.detail ?? ''}. Toca para cerrar.`}
          className={`fixed inset-0 z-50 grid animate-fade-in place-items-center p-6 text-center ${RESULT_STYLE[result.kind]}`}
        >
          <span className="grid justify-items-center gap-4">
            <span aria-hidden="true" className="grid size-24 place-items-center rounded-full bg-white/20 text-[3rem] font-extrabold [&_svg]:size-12">
              {result.kind === 'ok' ? <IconCheck /> : result.kind === 'used' ? '!' : '✕'}
            </span>
            <span className="text-[2rem] leading-tight font-extrabold">{result.title}</span>
            {result.name && <span className="text-[1.5rem] font-extrabold">{result.name}</span>}
            {result.detail && <span className="text-[1.15rem] font-bold opacity-90">{result.detail}</span>}
          </span>
        </button>
      )}
    </>
  );
}
