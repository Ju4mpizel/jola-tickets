'use client';

import { useEffect, useRef, useState } from 'react';
import { Spinner } from '@/components/ui/Button';

/**
 * Lector de QR con la cámara trasera (librería qr-scanner, cargada solo en el navegador).
 * La cámara solo funciona en HTTPS (Vercel) o en localhost. Si no hay permiso, no hay cámara
 * o la página no es segura, muestra cómo resolverlo; la página ofrece escribir el código a mano.
 * @param {{
 *   paused: boolean,                  // true mientras se muestra un resultado: no lee otro QR
 *   onResult: (text: string) => void, // contenido del QR leído
 * }} props
 */
export default function QrScanner({ paused, onResult }) {
  const videoRef = useRef(null);
  const scannerRef = useRef(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  const [state, setState] = useState('starting'); // starting | running | denied | no-camera | insecure | error
  const [hasFlash, setHasFlash] = useState(false);
  const [flashOn, setFlashOn] = useState(false);

  useEffect(() => {
    if (!window.isSecureContext) {
      setState('insecure');
      return;
    }
    let scanner = null;
    let cancelled = false;
    (async () => {
      const { default: Scanner } = await import('qr-scanner');
      if (cancelled || !videoRef.current) return;
      if (!(await Scanner.hasCamera())) {
        setState('no-camera');
        return;
      }
      scanner = new Scanner(videoRef.current, (result) => onResultRef.current(result.data), {
        returnDetailedScanResult: true,
        preferredCamera: 'environment',
        highlightScanRegion: true,
        highlightCodeOutline: true,
        maxScansPerSecond: 8,
      });
      scannerRef.current = scanner;
      try {
        await scanner.start();
        if (cancelled) return;
        setState('running');
        setHasFlash(await scanner.hasFlash());
      } catch (err) {
        if (cancelled) return;
        const text = String(err?.name || err?.message || err);
        setState(/NotAllowed|Permission|denied/i.test(text) ? 'denied' : /not found|NotFound/i.test(text) ? 'no-camera' : 'error');
      }
    })();
    return () => {
      cancelled = true;
      scanner?.destroy();
      scannerRef.current = null;
    };
  }, []);

  // Pausa mientras se muestra el resultado (sin apagar la cámara, para retomar al instante)
  useEffect(() => {
    const scanner = scannerRef.current;
    if (!scanner || state !== 'running') return;
    if (paused) scanner.pause();
    else scanner.start().catch(() => {});
  }, [paused, state]);

  async function toggleFlash() {
    const scanner = scannerRef.current;
    if (!scanner) return;
    try {
      await scanner.toggleFlash();
      setFlashOn(scanner.isFlashOn());
    } catch {
      setHasFlash(false);
    }
  }

  const problem = {
    denied: {
      title: 'Sin permiso para usar la cámara',
      body: (
        <>
          <b>Android (Chrome):</b> toca el candado junto a la dirección → Permisos → Cámara → Permitir, y recarga la página.
          <br />
          <b>iPhone (Safari):</b> toca «aA» en la barra de dirección → Configuración del sitio web → Cámara → Permitir, y recarga.
        </>
      ),
    },
    'no-camera': { title: 'No encontramos una cámara', body: 'Usa un celular con cámara o escribe el código del boleto abajo.' },
    insecure: {
      title: 'La cámara necesita una conexión segura',
      body: 'Abre esta página con https:// (por ejemplo, desde la dirección de Vercel). Mientras tanto, escribe el código abajo.',
    },
    error: { title: 'No pudimos encender la cámara', body: 'Cierra otras apps que la estén usando y recarga la página.' },
  }[state];

  return (
    <div className="grid gap-3">
      <div className="relative aspect-square w-full overflow-hidden rounded-card border border-line bg-[#060D22]">
        <video ref={videoRef} muted playsInline aria-label="Vista de la cámara" className="size-full object-cover" />
        {state === 'starting' && (
          <div className="absolute inset-0 grid place-items-center text-white">
            <span className="grid justify-items-center gap-2 text-[.9rem] font-bold">
              <Spinner />
              Encendiendo la cámara…
            </span>
          </div>
        )}
        {problem && (
          <div role="alert" className="absolute inset-0 grid place-items-center overflow-auto bg-surface p-5 text-center">
            <div>
              <p className="text-[1.05rem] font-extrabold">{problem.title}</p>
              <p className="mt-2 text-[.88rem] leading-relaxed font-semibold text-muted">{problem.body}</p>
            </div>
          </div>
        )}
      </div>

      {state === 'running' && hasFlash && (
        <button
          type="button"
          aria-pressed={flashOn}
          onClick={toggleFlash}
          className={
            'inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border px-4 text-[.95rem] font-extrabold transition-colors duration-150 ' +
            (flashOn ? 'border-sel bg-sel text-on-sel' : 'border-line bg-surface text-ink')
          }
        >
          {flashOn ? 'Apagar linterna' : 'Encender linterna'}
        </button>
      )}
    </div>
  );
}
