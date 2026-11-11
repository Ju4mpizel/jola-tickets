'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/admin', label: 'Órdenes' },
  { href: '/admin/asientos', label: 'Asientos' },
  { href: '/admin/checkin', label: 'Puerta' },
];

/**
 * Navegación del panel (órdenes, asientos y escáner de la puerta) con el correo de la sesión
 * y "Cerrar sesión". Va en su propio archivo porque la usan las tres páginas de /admin.
 * @param {{ email?: string, onLogout: () => void, badge?: number }} props
 *   badge: comprobantes por revisar (se muestra junto a "Órdenes")
 */
export default function AdminNav({ email, onLogout, badge = 0 }) {
  const pathname = usePathname();

  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <nav aria-label="Panel de la directiva" className="flex gap-1.5 overflow-x-auto rounded-full border border-line bg-surface p-1 shadow-elev-sm">
        {LINKS.map((l) => {
          const on = pathname === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={on ? 'page' : undefined}
              className={
                'inline-flex min-h-10 flex-none items-center gap-1.5 rounded-full px-3.5 text-[.88rem] font-extrabold transition-colors duration-150 ' +
                (on ? 'bg-primary text-on-primary' : 'text-ink pointer-fine:hover:bg-surface-2')
              }
            >
              {l.label}
              {l.href === '/admin' && badge > 0 && (
                <span className={`grid min-w-5 place-items-center rounded-full px-1 text-[.7rem] ${on ? 'bg-on-primary text-primary' : 'bg-danger text-white'}`}>
                  {badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="flex items-center gap-2.5">
        {email && <span className="hidden text-[.82rem] font-semibold text-muted sm:inline">{email}</span>}
        <button
          type="button"
          onClick={onLogout}
          className="inline-flex min-h-10 items-center rounded-full border border-line bg-surface px-3.5 text-[.85rem] font-extrabold text-ink transition-colors duration-150 pointer-fine:hover:border-cyan-strong"
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
