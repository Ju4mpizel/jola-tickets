'use client';

import { useTheme } from 'next-themes';
import Logo from '@/components/brand/Logo';
import { IconBack, IconMoon, IconSun } from '@/components/ui/icons';
import { useToast } from '@/components/ui/ToastProvider';
import { EVENT } from '@/lib/event';

const iconBtn =
  'grid size-11 flex-none place-items-center rounded-[14px] border border-line bg-surface shadow-elev-sm ' +
  'transition-[transform,border-color,background-color] duration-200 hover:border-cyan active:scale-[.94] [&_svg]:size-5';

/**
 * Barra superior: volver, marca JOLA y botón de tema.
 * @param {{
 *   showBack?: boolean,      // en el inicio no se muestra
 *   onBack?: () => void,
 *   backLabel?: string,
 *   subtitle?: string,
 *   className?: string,
 * }} props
 */
export default function Topbar({
  showBack = false,
  onBack,
  backLabel = 'Volver a tus datos',
  subtitle = EVENT.school,
  className = '',
}) {
  const { resolvedTheme, setTheme } = useTheme();
  const toast = useToast();

  function toggleTheme() {
    const next = resolvedTheme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    toast(next === 'dark' ? 'Modo oscuro activado' : 'Modo claro activado');
  }

  return (
    <header className={`mb-[18px] flex animate-rise items-center gap-3 ${className}`}>
      {showBack && (
        <button type="button" className={iconBtn} onClick={onBack} aria-label={backLabel}>
          <IconBack />
        </button>
      )}

      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <Logo variant="topbar" />
        <div className="min-w-0">
          <b className="block font-brand text-[1.35rem] leading-none font-bold tracking-[.02em] text-ink">
            JO<span className="text-cyan-strong">LA</span>
          </b>
          <small className="mt-[3px] block truncate text-[.7rem] font-bold tracking-[.08em] text-muted uppercase max-[380px]:text-[.6rem] max-[380px]:tracking-[.04em]">
            {subtitle}
          </small>
        </div>
      </div>

      {/* Los dos íconos se pintan siempre y el CSS muestra uno: así no hay parpadeo al hidratar */}
      <button type="button" className={iconBtn} onClick={toggleTheme} aria-label="Cambiar entre modo claro y oscuro">
        <IconMoon className="dark:hidden" />
        <IconSun className="hidden dark:block" />
      </button>
    </header>
  );
}
