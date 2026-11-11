'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import { useToast } from '@/components/ui/ToastProvider';
import { HOLD_MARGIN_MINUTES, MAX_SEATS, TOTAL_SEATS } from '@/lib/event';
import { validateBuyer } from '@/lib/validators';

/**
 * Estado central de la compra: paso, comprador, asientos elegidos y orden en curso.
 *
 * - El paso vive en la URL (?paso=asientos) para que el botón atrás del celular funcione.
 * - La selección y la orden se guardan en sessionStorage; el comprador, en localStorage
 *   ("jola-buyer", lo escribe BuyerForm). Una recarga no pierde la compra.
 * - Se publica en tres contextos (flujo, selección y orden) para que, por ejemplo, la grilla
 *   no se vuelva a pintar cuando cambia la orden ni el temporizador cuando cambia la selección.
 */

export const STEPS = [
  { id: 'datos', label: 'Datos' },
  { id: 'asientos', label: 'Asientos' },
  { id: 'pago', label: 'Pago' },
  { id: 'revision', label: 'Entrada' },
];
const STEP_IDS = STEPS.map((s) => s.id);
const FIRST_STEP = STEP_IDS[0];

const BUYER_KEY = 'jola-buyer';
const SELECTION_KEY = 'jola-selection';
const ORDER_KEY = 'jola-order';

/**
 * Momento en que el frontend da por vencida la retención: expires_at del servidor menos un margen
 * (1 minuto, o la cuarta parte de la retención si es más corta, como la de prueba de 1 minuto).
 * @param {{ expires_at: string, received_at?: number }} order
 */
export function holdDeadline(order) {
  const expires = new Date(order.expires_at).getTime();
  const length = order.received_at ? expires - order.received_at : Infinity;
  return expires - Math.min(HOLD_MARGIN_MINUTES * 60_000, Math.max(0, length / 4));
}

// hydrated: ya se leyó lo guardado (antes no se escribe nada, para no pisarlo)
const initialState = { step: FIRST_STEP, buyer: null, selected: [], order: null, hydrated: false };

function reducer(state, action) {
  switch (action.type) {
    case 'SET_STEP':
      return { ...state, step: action.step };
    case 'SET_BUYER':
      return { ...state, buyer: action.buyer };
    case 'TOGGLE_SEAT': {
      const { id } = action;
      if (state.selected.includes(id)) return { ...state, selected: state.selected.filter((s) => s !== id) };
      if (state.selected.length >= MAX_SEATS) return state;
      return { ...state, selected: [...state.selected, id] };
    }
    case 'CLEAR_SELECTION':
      return state.selected.length ? { ...state, selected: [] } : state;
    case 'RESTORE':
      return { ...state, ...action.patch, hydrated: true };
    case 'HOLD_CREATED':
      return { ...state, order: action.order };
    case 'HOLD_RELEASED':
      // La selección se conserva: al volver al mapa el comprador puede intentar de nuevo
      return state.order ? { ...state, order: null } : state;
    case 'HOLD_EXPIRED':
      // Queda marcada hasta que PurchaseFlow la libere en el servidor (luego HOLD_RELEASED)
      // Con el comprobante ya enviado la retención no vence
      return state.order && !state.order.expired && state.order.status !== 'pending_review'
        ? { ...state, order: { ...state.order, expired: true } }
        : state;
    case 'RECEIPT_SUBMITTED':
      return state.order ? { ...state, order: { ...state.order, status: 'pending_review' } } : state;
    case 'RESET':
      return { ...initialState, buyer: state.buyer, hydrated: true };
    default:
      return state;
  }
}

/* ---------- Lectura segura de lo guardado (ignora datos con otra forma) ---------- */

function readJson(storage, key) {
  try {
    return JSON.parse(window[storage].getItem(key) ?? 'null');
  } catch {
    return null;
  }
}

function writeJson(storage, key, value) {
  try {
    if (value == null) window[storage].removeItem(key);
    else window[storage].setItem(key, JSON.stringify(value));
  } catch {
    /* almacenamiento bloqueado: el dato solo vive en memoria */
  }
}

function readBuyer() {
  const raw = readJson('localStorage', BUYER_KEY);
  if (!raw || typeof raw !== 'object') return null;
  const buyer = { name: String(raw.name ?? ''), phone: String(raw.phone ?? ''), email: String(raw.email ?? '') };
  return Object.keys(validateBuyer(buyer)).length ? null : buyer;
}

function readSelection() {
  const raw = readJson('sessionStorage', SELECTION_KEY);
  if (!Array.isArray(raw)) return [];
  const ids = raw.filter((id) => Number.isInteger(id) && id >= 1 && id <= TOTAL_SEATS);
  return [...new Set(ids)].slice(0, MAX_SEATS);
}

function readOrder() {
  const o = readJson('sessionStorage', ORDER_KEY);
  const valid =
    o &&
    typeof o.order_id === 'string' &&
    typeof o.order_code === 'string' &&
    typeof o.access_token === 'string' &&
    typeof o.total === 'number' &&
    !Number.isNaN(new Date(o.expires_at).getTime());
  return valid ? o : null;
}

/* ---------- URL ---------- */

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

/**
 * Paso que se puede mostrar con lo que hay: sin comprador → datos; pago sin orden vigente → asientos;
 * revisión solo con el comprobante enviado (y con el comprobante enviado ya no se vuelve al pago).
 */
function allowedStep(step, buyer, order) {
  if (!buyer) return FIRST_STEP;
  const sent = order?.status === 'pending_review';
  if (sent && (step === 'pago' || step === 'asientos')) return 'revision';
  if (step === 'revision' && !sent) return order && !order.expired ? 'pago' : 'asientos';
  if (step === 'pago' && (!order || order.expired)) return 'asientos';
  return step;
}

const FlowContext = createContext(null);
const SelectionContext = createContext(null);
const SelectionActionsContext = createContext(null);
const OrderContext = createContext(null);

/**
 * Se usa la API de historial nativa (Next.js la sincroniza con su router) en lugar de
 * useSearchParams: así la página se pre-renderiza estática sin un <Suspense> vacío,
 * y el servidor y el cliente siempre empiezan en el paso "datos".
 * @param {{ children: React.ReactNode }} props
 */
export function PurchaseProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const toast = useToast();
  const live = useRef(state);
  live.current = state;

  const step = allowedStep(state.step, state.buyer, state.order);

  // Al montar: recupera comprador, selección y orden; luego sigue la URL (y el botón atrás)
  useEffect(() => {
    const buyer = readBuyer();
    const selected = readSelection();
    let order = readOrder();
    let urlStep = stepFromUrl();

    if (order && order.status !== 'pending_review' && holdDeadline(order) <= Date.now()) {
      // Retención vencida: se vuelve al mapa. La orden queda marcada como vencida hasta que
      // PurchaseFlow la libere en el servidor (así sus sillas no figuran ocupadas al refrescar)
      order = { ...order, expired: true };
      if (buyer) {
        urlStep = 'asientos';
        toast('Se acabó el tiempo de reserva');
      }
    } else if (order && buyer) {
      // Retención vigente: se retoma el pago; comprobante ya enviado: la pantalla de revisión
      urlStep = order.status === 'pending_review' ? 'revision' : 'pago';
    }

    const patch = { buyer, selected, order };
    live.current = { ...live.current, ...patch };
    dispatch({ type: 'RESTORE', patch });

    const first = allowedStep(urlStep, buyer, order);
    window.history.replaceState({ ...window.history.state, jolaStep: first }, '', urlForStep(first));
    dispatch({ type: 'SET_STEP', step: first });

    function onPopState() {
      const { buyer: b, order: o } = live.current;
      const next = stepFromUrl();
      const allowed = allowedStep(next, b, o);
      if (allowed !== next) window.history.replaceState(window.history.state, '', urlForStep(allowed));
      dispatch({ type: 'SET_STEP', step: allowed });
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [toast]);

  // Guarda selección y orden en cada cambio (después de recuperarlas)
  useEffect(() => {
    if (state.hydrated) writeJson('sessionStorage', SELECTION_KEY, state.selected);
  }, [state.hydrated, state.selected]);
  useEffect(() => {
    if (state.hydrated) writeJson('sessionStorage', ORDER_KEY, state.order);
  }, [state.hydrated, state.order]);

  /* ---------- Flujo ---------- */

  const setBuyer = useCallback((buyer) => {
    live.current = { ...live.current, buyer };
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
    else window.history.pushState({ jolaStep: next, jolaPushed: true }, '', url);
    dispatch({ type: 'SET_STEP', step: next });
  }, []);

  /**
   * Volver un paso: usa el historial si esta entrada la agregó la app (igual que el prototipo);
   * si no (ej. se abrió el enlace directo), reemplaza la URL para no salir del sitio.
   */
  const goBack = useCallback(() => {
    const index = STEP_IDS.indexOf(step);
    if (index <= 0) return;
    if (window.history.state?.jolaPushed) window.history.back();
    else goTo(STEP_IDS[index - 1], { replace: true });
  }, [step, goTo]);

  /* ---------- Selección ---------- */

  /**
   * Elige o quita un asiento.
   * @returns {'added' | 'removed' | 'limit'}  'limit': ya hay MAX_SEATS y no se agregó
   */
  const toggleSeat = useCallback((id) => {
    const current = live.current.selected;
    const result = current.includes(id) ? 'removed' : current.length >= MAX_SEATS ? 'limit' : 'added';
    if (result !== 'limit') {
      live.current = { ...live.current, selected: result === 'added' ? [...current, id] : current.filter((s) => s !== id) };
      dispatch({ type: 'TOGGLE_SEAT', id });
    }
    return result;
  }, []);

  /** Quita de la selección los asientos indicados (ej. los que otra persona ocupó). */
  const removeSeats = useCallback((ids) => {
    ids.forEach((id) => {
      if (!live.current.selected.includes(id)) return;
      live.current = { ...live.current, selected: live.current.selected.filter((s) => s !== id) };
      dispatch({ type: 'TOGGLE_SEAT', id });
    });
  }, []);

  const clearSelection = useCallback(() => {
    live.current = { ...live.current, selected: [] };
    dispatch({ type: 'CLEAR_SELECTION' });
  }, []);

  /* ---------- Orden ---------- */

  /**
   * @param {{ order_id, order_code, access_token, total, expires_at }} data  respuesta de POST /holds
   * @param {string[]} [seats]  códigos de los asientos retenidos ("A1"), para mostrarlos en el pago
   */
  const holdCreated = useCallback((data, seats = []) => {
    const order = {
      order_id: data.order_id,
      order_code: data.order_code,
      access_token: data.access_token,
      total: data.total,
      expires_at: data.expires_at,
      received_at: Date.now(),
      status: 'awaiting_payment',
      seats,
    };
    live.current = { ...live.current, order };
    dispatch({ type: 'HOLD_CREATED', order });
  }, []);
  const holdReleased = useCallback(() => {
    live.current = { ...live.current, order: null };
    dispatch({ type: 'HOLD_RELEASED' });
  }, []);
  const holdExpired = useCallback(() => {
    const { order } = live.current;
    if (order) live.current = { ...live.current, order: { ...order, expired: true } };
    dispatch({ type: 'HOLD_EXPIRED' });
  }, []);
  const receiptSubmitted = useCallback(() => dispatch({ type: 'RECEIPT_SUBMITTED' }), []);
  const reset = useCallback(() => {
    live.current = { ...live.current, selected: [], order: null };
    dispatch({ type: 'RESET' });
  }, []);

  const flow = useMemo(
    () => ({ step, stepIndex: STEP_IDS.indexOf(step), steps: STEPS, buyer: state.buyer, setBuyer, goTo, goBack }),
    [step, state.buyer, setBuyer, goTo, goBack],
  );
  const selectionActions = useMemo(
    () => ({ toggleSeat, removeSeats, clearSelection }),
    [toggleSeat, removeSeats, clearSelection],
  );
  const selection = useMemo(() => ({ selected: state.selected, ...selectionActions }), [state.selected, selectionActions]);
  const orderValue = useMemo(
    () => ({ order: state.order, holdCreated, holdReleased, holdExpired, receiptSubmitted, reset }),
    [state.order, holdCreated, holdReleased, holdExpired, receiptSubmitted, reset],
  );

  return (
    <FlowContext.Provider value={flow}>
      <SelectionActionsContext.Provider value={selectionActions}>
        <SelectionContext.Provider value={selection}>
          <OrderContext.Provider value={orderValue}>{children}</OrderContext.Provider>
        </SelectionContext.Provider>
      </SelectionActionsContext.Provider>
    </FlowContext.Provider>
  );
}

function useRequired(context, name) {
  const ctx = useContext(context);
  if (!ctx) throw new Error(`${name} necesita <PurchaseProvider>`);
  return ctx;
}

/**
 * Paso y comprador. No cambia al elegir asientos ni al crear la orden.
 * @returns {{
 *   step: string, stepIndex: number, steps: typeof STEPS,
 *   buyer: { name: string, phone: string, email: string } | null,
 *   setBuyer: (buyer: object) => void,
 *   goTo: (step: string, options?: { replace?: boolean }) => void,
 *   goBack: () => void,
 * }}
 */
export const usePurchaseFlow = () => useRequired(FlowContext, 'usePurchaseFlow');

/**
 * Asientos elegidos. Solo cambia al elegir o quitar asientos.
 * @returns {{
 *   selected: number[],                              // ids, en el orden en que se eligieron
 *   toggleSeat: (id: number) => 'added' | 'removed' | 'limit',
 *   removeSeats: (ids: number[]) => void,
 *   clearSelection: () => void,
 * }}
 */
export const useSelection = () => useRequired(SelectionContext, 'useSelection');

/**
 * Solo las acciones de la selección (nunca cambian): para quien modifica la selección
 * sin necesitar leerla, así no se vuelve a pintar al elegir asientos.
 * @returns {{ toggleSeat: Function, removeSeats: (ids: number[]) => void, clearSelection: () => void }}
 */
export const useSelectionActions = () => useRequired(SelectionActionsContext, 'useSelectionActions');

/**
 * Orden en curso (la crea POST /holds). Solo cambia con las acciones de la orden.
 * @returns {{
 *   order: { order_id: string, order_code: string, access_token: string, total: number,
 *            expires_at: string, received_at: number, status: string, seats: string[], expired?: boolean } | null,
 *   holdCreated: (data: object) => void,
 *   holdReleased: () => void,
 *   holdExpired: () => void,
 *   receiptSubmitted: () => void,
 *   reset: () => void,
 * }}
 */
export const useOrder = () => useRequired(OrderContext, 'useOrder');

/** Todo junto (se vuelve a pintar con cualquier cambio): para pantallas chicas como el formulario. */
export function usePurchase() {
  return { ...usePurchaseFlow(), ...useSelection(), ...useOrder() };
}
