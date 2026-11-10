'use client';

import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '@/lib/feedback';

/**
 * Envuelve un bloque que aparece (sube y se desvanece) al entrar en pantalla.
 * Marca data-revealed="true" para que los hijos animen con
 * group-data-[revealed=true]/reveal:… cuando aparece.
 * @param {{
 *   as?: React.ElementType,   // 'div' por defecto; 'section', 'article'…
 *   className?: string,
 *   children: React.ReactNode,
 * } & React.HTMLAttributes<HTMLElement>} props
 */
export default function Reveal({ as: Tag = 'div', className = '', children, ...rest }) {
  const ref = useRef(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion() || !('IntersectionObserver' in window)) {
      setRevealed(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setRevealed(true);
          io.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      data-revealed={revealed}
      className={
        'group/reveal transition-[opacity,translate] duration-[600ms] ease-[cubic-bezier(.2,.8,.2,1)] ' +
        (revealed ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0') +
        ` ${className}`
      }
      {...rest}
    >
      {children}
    </Tag>
  );
}
