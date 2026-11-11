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

/**
 * Copia texto al portapapeles. Usa la API moderna y, si no está (HTTP o navegador viejo),
 * un textarea temporal.
 * @returns {Promise<boolean>} true si se copió
 */
export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* sigue con el método antiguo */
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}
