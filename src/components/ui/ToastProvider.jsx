'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

const ToastContext = createContext(null);

const TOAST_MS = 2300;

/**
 * Avisos visibles (toast) y anuncios solo para lectores de pantalla (aria-live).
 * Envuelve la app en layout.jsx; se usa con useToast() y useAnnounce().
 * @param {{ children: React.ReactNode }} props
 */
export default function ToastProvider({ children }) {
  const [toastMsg, setToastMsg] = useState('');
  const [visible, setVisible] = useState(false);
  const [liveMsg, setLiveMsg] = useState('');
  const toastTimer = useRef(null);
  const liveTimer = useRef(null);

  const toast = useCallback((message) => {
    setToastMsg(message);
    setVisible(true);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setVisible(false), TOAST_MS);
  }, []);

  // Se vacía y se vuelve a escribir para que el lector repita mensajes iguales
  const announce = useCallback((message) => {
    setLiveMsg('');
    clearTimeout(liveTimer.current);
    liveTimer.current = setTimeout(() => setLiveMsg(message), 30);
  }, []);

  useEffect(
    () => () => {
      clearTimeout(toastTimer.current);
      clearTimeout(liveTimer.current);
    },
    [],
  );

  const value = useMemo(() => ({ toast, announce }), [toast, announce]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className={
          'fixed left-1/2 top-[calc(14px+env(safe-area-inset-top))] z-60 max-w-[calc(100%-32px)] -translate-x-1/2 ' +
          'rounded-[14px] bg-ink px-4 py-[11px] text-center text-[.9rem] font-bold text-bg shadow-elev ' +
          'transition-[translate,visibility] duration-[350ms] ease-[cubic-bezier(.2,.9,.3,1.2)] ' +
          (visible ? 'visible translate-y-0' : 'invisible -translate-y-[220%]')
        }
      >
        {toastMsg}
      </div>
      <div className="sr-only" aria-live="polite">
        {liveMsg}
      </div>
    </ToastContext.Provider>
  );
}

function useToastContext() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast y useAnnounce necesitan <ToastProvider>');
  return ctx;
}

/** Muestra un aviso breve arriba de la pantalla: toast('Modo oscuro activado'). */
export const useToast = () => useToastContext().toast;

/** Anuncia un mensaje a lectores de pantalla sin mostrarlo: announce('Asiento C7 seleccionado'). */
export const useAnnounce = () => useToastContext().announce;
