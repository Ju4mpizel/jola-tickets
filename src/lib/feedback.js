/**
 * Vibración y animaciones puntuales que respetan prefers-reduced-motion.
 * Solo se llaman desde el navegador (eventos o efectos).
 */

const media = (query) => typeof window !== 'undefined' && window.matchMedia?.(query).matches;

export const prefersReducedMotion = () => !!media('(prefers-reduced-motion: reduce)');

/** PC con mouse: muestra tooltips y textos de "haz clic". */
export const hasFinePointer = () => !!media('(hover: hover) and (pointer: fine)');

/** Web Animations API, solo si no hay movimiento reducido. */
export function anim(el, frames, options) {
  if (!el || prefersReducedMotion() || !el.animate) return;
  el.animate(frames, options);
}

export function shake(el) {
  anim(
    el,
    [{ transform: 'translateX(0)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(0)' }],
    { duration: 280 },
  );
}

/** Vuelve a disparar una animación de clase (ej. "animate-shake") aunque ya la tenga. */
export function replayClass(el, className) {
  if (!el || prefersReducedMotion()) return;
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
}

export function vibrate(pattern) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* algunos navegadores lo bloquean */
  }
}
