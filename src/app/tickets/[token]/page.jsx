import Link from 'next/link';
import { EVENT } from '@/lib/event';

export const metadata = {
  title: 'Tu entrada · JOLA',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

/**
 * /tickets/{token}: boleto digital. Por ahora es un marcador; la entrada con su QR
 * (TicketCard) se construye en el paso 7.
 */
export default function TicketPage() {
  return (
    <main className="mx-auto grid min-h-[60vh] max-w-[560px] place-items-center px-4 py-10 text-center">
      <div className="rounded-card border border-line bg-surface px-6 py-8 shadow-elev">
        <h1 className="text-[1.3rem] font-extrabold">Tu entrada</h1>
        <p className="mt-2 text-[.95rem] font-semibold text-muted">
          Muy pronto verás aquí tu entrada para el {EVENT.name} con su código QR.
        </p>
        <Link href="/" className="mt-5 inline-block font-extrabold text-accent-ink underline underline-offset-4">
          Ir al inicio
        </Link>
      </div>
    </main>
  );
}
