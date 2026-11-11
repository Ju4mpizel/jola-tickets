'use client';

import Link from 'next/link';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useState } from 'react';
import Logo from '@/components/brand/Logo';
import Topbar from '@/components/layout/Topbar';
import Button, { Spinner } from '@/components/ui/Button';
import useCountdown from '@/hooks/useCountdown';
import { EVENT } from '@/lib/event';
import { getTicket } from '@/services/api';

const LABEL = 'block text-[.7rem] font-bold tracking-[.06em] text-muted uppercase';

/** "19:05" */
const timeOf = (iso) => (iso ? new Date(iso).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' }) : '');

/**
 * Boleto digital (GET /tickets/{token}), con el diseño del prototipo: cabecera azul con el logo,
 * datos del evento, fila y asiento en grande, corte perforado y el QR con la URL completa
 * del boleto. Se puede imprimir o guardar como PDF: solo sale el boleto, en fondo blanco.
 * @param {{ token: string }} props
 */
export default function TicketCard({ token }) {
  const [state, setState] = useState({ status: 'loading', ticket: null, error: null });
  const [url, setUrl] = useState('');

  useEffect(() => {
    const ctrl = new AbortController();
    setUrl(`${window.location.origin}/tickets/${encodeURIComponent(token)}`);
    getTicket(token, { signal: ctrl.signal })
      .then((ticket) => setState({ status: 'ready', ticket, error: null }))
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        const missing = err?.status === 404 || err?.error === 'TICKET_NOT_FOUND';
        setState({ status: missing ? 'not_found' : 'error', ticket: null, error: err });
      });
    return () => ctrl.abort();
  }, [token]);

  return (
    <div className="mx-auto max-w-[1180px] px-3.5 pt-3.5 pb-[calc(32px+env(safe-area-inset-bottom))] max-[380px]:px-2.5 lg:px-7 lg:pt-6 print:p-0">
      <Topbar className="mx-auto max-w-[440px] print:hidden" />
      <main className="mx-auto grid w-full max-w-[440px] gap-4">
        {state.status === 'loading' && (
          <div className="grid place-items-center py-16" aria-busy="true">
            <Spinner className="text-accent-ink" />
            <p role="status" className="mt-3 text-[.95rem] font-semibold text-muted">
              Cargando tu entrada…
            </p>
          </div>
        )}

        {(state.status === 'not_found' || state.status === 'error') && (
          <section className="rounded-card border border-line bg-surface px-5 py-8 text-center shadow-elev" role="alert">
            <h1 className="text-[1.3rem] font-extrabold">
              {state.status === 'not_found' ? 'Boleto no encontrado' : 'No pudimos cargar tu entrada'}
            </h1>
            <p className="mt-1.5 text-[.95rem] font-semibold text-muted">
              {state.status === 'not_found'
                ? 'Revisa que el enlace esté completo, tal como llegó en tu correo.'
                : state.error?.message}
            </p>
            <Link href="/" className="mt-5 inline-block font-extrabold text-accent-ink underline underline-offset-4">
              Ir al inicio
            </Link>
          </section>
        )}

        {state.status === 'ready' && <Ticket ticket={state.ticket} url={url} />}
      </main>
    </div>
  );
}

function Ticket({ ticket, url }) {
  const used = ticket.is_used;
  const place = ticket.event?.place || EVENT.place;

  return (
    <>
      <article
        aria-labelledby="ticket-title"
        className={
          'animate-[rise_.5s_.1s_ease_both] overflow-hidden rounded-card border border-line bg-surface shadow-elev transition-colors duration-300 ' +
          'print:break-inside-avoid print:border-[#CCD5E3]'
        }
      >
        <header className="flex items-center gap-3 bg-navy px-[18px] py-4 text-white [print-color-adjust:exact]">
          <Logo variant="ticket" />
          <div className="min-w-0 flex-1">
            <small className="text-[.75rem] font-bold tracking-[.06em] text-cyan uppercase">JOLA presenta</small>
            <h1 id="ticket-title" className="text-[1.05rem] leading-tight font-extrabold">
              {ticket.event?.name || EVENT.name}
            </h1>
          </div>
          <span
            className={
              'flex-none rounded-full px-2.5 py-1 text-[.75rem] font-extrabold [print-color-adjust:exact] ' +
              (used ? 'bg-white/15 text-white' : 'bg-ok text-white')
            }
          >
            {used ? `Ya ingresó${ticket.scanned_at ? ` · ${timeOf(ticket.scanned_at)}` : ''}` : 'Válido'}
          </span>
        </header>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-[18px] py-4">
          <div className="col-span-2">
            <dt className={LABEL}>A nombre de</dt>
            <dd className="text-[1.05rem] font-extrabold">{ticket.buyer_name}</dd>
          </div>
          <div>
            <dt className={LABEL}>Fecha</dt>
            <dd className="font-extrabold">{EVENT.dateTicket}</dd>
          </div>
          <div>
            <dt className={LABEL}>Hora</dt>
            <dd className="font-extrabold">
              {EVENT.time} <span className="text-[.8rem] font-bold text-muted">(puertas {EVENT.doorsOpen})</span>
            </dd>
          </div>
          <div className="col-span-2">
            <dt className={LABEL}>Lugar</dt>
            <dd className="font-extrabold">{place}</dd>
          </div>
          <div className="col-span-2 mt-1 flex items-end gap-6 rounded-2xl border border-line bg-surface-2 px-4 py-3">
            <div>
              <dt className={LABEL}>Fila</dt>
              <dd className="font-brand text-[2.6rem] leading-none font-bold">{ticket.row}</dd>
            </div>
            <div>
              <dt className={LABEL}>Asiento</dt>
              <dd className="font-brand text-[2.6rem] leading-none font-bold">{ticket.number}</dd>
            </div>
          </div>
        </dl>

        {/* Corte perforado: línea punteada con dos semicírculos del color del fondo */}
        <div
          aria-hidden="true"
          className={
            'relative mx-[18px] h-0 border-t-2 border-dashed border-line ' +
            "before:absolute before:-top-3 before:-left-[30px] before:size-[22px] before:rounded-full before:bg-bg before:content-[''] " +
            "after:absolute after:-top-3 after:-right-[30px] after:size-[22px] after:rounded-full after:bg-bg after:content-['']"
          }
        />

        <div className="flex flex-col items-center gap-3 px-[18px] pt-5 pb-5 text-center">
          <div className="rounded-2xl bg-white p-3 [print-color-adjust:exact]">
            {url ? (
              <QRCodeSVG
                value={url}
                size={208}
                level="M"
                fgColor="#0A1F5C"
                bgColor="#FFFFFF"
                title={`Código QR de la entrada fila ${ticket.row}, asiento ${ticket.number}`}
                className={used ? 'opacity-40' : ''}
              />
            ) : (
              <div className="size-[208px]" />
            )}
          </div>
          <p className="text-[.85rem] font-semibold text-muted">
            <b className="block text-[.95rem] text-ink">Muestra este código en la puerta</b>
            Entrada personal: cada código entra una sola vez.
          </p>
        </div>
      </article>

      <EventCountdown />

      <p className="flex items-center gap-2.5 rounded-2xl border border-band-line bg-band px-4 py-3 text-[.9rem] font-bold print:hidden">
        <span aria-hidden="true" className="text-[1.2rem]">☀</span>
        Sube el brillo de tu pantalla en la puerta.
      </p>

      <Button className="w-full print:hidden" onClick={() => window.print()}>
        Guardar o imprimir
      </Button>
    </>
  );
}

/** "Faltan 11 días, 3 h y 20 min" hasta el evento. */
function EventCountdown() {
  const parts = useCountdown(EVENT.startsAt);
  if (!parts) return <p className="h-6 print:hidden" />;
  return (
    <p role="timer" className="text-center text-[.9rem] font-bold text-muted print:hidden">
      {parts.done ? (
        '¡La función ya comenzó!'
      ) : (
        <>
          Faltan <b className="text-ink tabular-nums">{parts.days}</b> {parts.days === 1 ? 'día' : 'días'},{' '}
          <b className="text-ink tabular-nums">{parts.hours}</b> h y <b className="text-ink tabular-nums">{parts.minutes}</b> min para la
          función
        </>
      )}
    </p>
  );
}
