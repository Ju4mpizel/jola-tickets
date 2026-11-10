'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';

/**
 * Estado central de la compra (versión inicial del paso 2: paso y comprador).
 * El paso vive en la URL (?paso=asientos) para que el botón atrás del celular funcione.
 * En pasos siguientes se agregan selección, orden y persistencia.
 */

export const STEPS = [
  { id: 'datos', label: 'Datos' },
  { id: 'asientos', label: 'Asientos' },
  { id: 'pago', label: 'Pago' },
  { id: 'revision', label: 'Revisión' },
];
const STEP_IDS = STEPS.map((s) => s.id);
const FIRST_STEP = STEP_IDS[0];

const initialState = { step: FIRST_STEP, buyer: null };

function reducer(state, action) {
  switch (action.type) {
    case 'SET_STEP':
      return { ...state, step: action.step };
    case 'SET_BUYER':
      return { ...state, buyer: action.buyer };
    default:
      return state;
  }
}

/** Paso indicado en la URL actual, o el primero si no hay o no es válido. */
function stepFromUrl() {
  const paso = new URLSearchParams(window.location.search).get('paso');
  return STEP_IDS.includes(paso) ? paso : FIRST_STEP;
}

/** URL actual con ?paso= cambiado (el primer paso no lleva parámetro). */
function urlForStep(step) {
  const url = new URL(window.location.href);
  if (step === FIRST_STEP) url.searchParams.delete('paso');
  else url.searchParams.set('paso', step);
  return `${url.pathname}${url.search}${url.hash}`;
}

const PurchaseContext = createContext(null);

/**
 * Se usa la API de historial nativa (Next.js la sincroniza con su router) en lugar de
 * useSearchParams: así la página se pre-renderiza estática sin un <Suspense> vacío,
 * y el servidor y el cliente siempre empiezan en el paso "datos".
 * @param {{ children: React.ReactNode }} props
 */
export function PurchaseProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const buyerRef = useRef(state.buyer);
  buyerRef.current = state.buyer;

  // Sin comprador, cualquier paso vuelve a "datos" (y la URL también)
  const step = state.buyer ? state.step : FIRST_STEP;

  useEffect(() => {
    function syncFromUrl() {
      const urlStep = stepFromUrl();
      if (urlStep !== FIRST_STEP && !buyerRef.current) {
        window.history.replaceState(window.history.state, '', urlForStep(FIRST_STEP));
        dispatch({ type: 'SET_STEP', step: FIRST_STEP });
        return;
      }
      dispatch({ type: 'SET_STEP', step: urlStep });
    }
    syncFromUrl();
    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
  }, []);

  /** Guarda los datos del comprador (ya validados). */
  const setBuyer = useCallback((buyer) => {
    buyerRef.current = buyer;
    dispatch({ type: 'SET_BUYER', buyer });
  }, []);

  /**
   * Cambia de paso y actualiza ?paso= en la URL.
   * @param {string} next
   * @param {{ replace?: boolean }} [options]  replace: no agrega una entrada al historial
   */
  const goTo = useCallback((next, { replace = false } = {}) => {
    if (!STEP_IDS.includes(next)) return;
    const url = urlForStep(next);
    if (replace) window.history.replaceState({ ...window.history.state, jolaStep: next }, '', url);
    else window.history.pushState({ jolaStep: next }, '', url);
    dispatch({ type: 'SET_STEP', step: next });
  }, []);

  /** Volver un paso: usa el historial si este paso se abrió desde la app (igual que el prototipo). */
  const goBack = useCallback(() => {
    const index = STEP_IDS.indexOf(step);
    if (index <= 0) return;
    if (window.history.state?.jolaStep === step) window.history.back();
    else goTo(STEP_IDS[index - 1], { replace: true });
  }, [step, goTo]);

  const value = useMemo(
    () => ({ step, stepIndex: STEP_IDS.indexOf(step), steps: STEPS, buyer: state.buyer, setBuyer, goTo, goBack }),
    [step, state.buyer, setBuyer, goTo, goBack],
  );

  return <PurchaseContext.Provider value={value}>{children}</PurchaseContext.Provider>;
}

/**
 * @returns {{
 *   step: string, stepIndex: number, steps: typeof STEPS,
 *   buyer: { name: string, phone: string, email: string } | null,
 *   setBuyer: (buyer: object) => void,
 *   goTo: (step: string, options?: { replace?: boolean }) => void,
 *   goBack: () => void,
 * }}
 */
export function usePurchase() {
  const ctx = useContext(PurchaseContext);
  if (!ctx) throw new Error('usePurchase necesita <PurchaseProvider>');
  return ctx;
}
