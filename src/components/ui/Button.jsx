const base =
  'relative inline-flex h-[54px] items-center justify-center gap-2.5 rounded-2xl px-5 text-base font-extrabold ' +
  'transition-[transform,opacity,background-color,box-shadow] duration-150 enabled:active:scale-[.97] ' +
  'disabled:cursor-not-allowed [&_svg]:flex-none';

const VARIANTS = {
  primary:
    'bg-primary text-on-primary shadow-[0_8px_20px_-8px_rgba(10,31,92,.5)] ' +
    'enabled:hover:shadow-[0_10px_24px_-8px_rgba(10,31,92,.6)] disabled:opacity-35 disabled:shadow-none ' +
    '[&_svg]:size-[18px] [&_svg]:transition-transform [&_svg]:duration-200 enabled:hover:[&_svg]:translate-x-[3px]',
  ghost: 'border border-line bg-surface-2 text-ink disabled:opacity-50',
};

// Botón principal grande del formulario, con el brillo que lo cruza cada 4 s
const SHINE =
  'h-[58px] w-full overflow-hidden text-[1.05rem] after:pointer-events-none after:absolute after:top-0 after:left-[-60%] ' +
  "after:h-full after:w-[38%] after:-skew-x-[20deg] after:content-[''] " +
  'after:bg-[linear-gradient(100deg,transparent,rgba(255,255,255,.35),transparent)] after:animate-shine';

/** Círculo que gira, para estados de carga. */
export function Spinner({ className = '' }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block size-[18px] flex-none animate-[spin_.7s_linear_infinite] rounded-full border-[2.5px] border-current border-r-transparent ${className}`}
    />
  );
}

/**
 * Botón con variantes, ícono al final y estado de carga.
 * @param {{
 *   variant?: 'primary' | 'ghost',
 *   shine?: boolean,              // botón grande con brillo (inicio)
 *   icon?: React.ReactNode,       // se muestra después del texto
 *   loading?: boolean,
 *   loadingText?: string,         // texto mientras carga (por defecto el mismo)
 *   className?: string,
 * } & React.ButtonHTMLAttributes<HTMLButtonElement>} props
 */
export default function Button({
  variant = 'primary',
  shine = false,
  icon = null,
  loading = false,
  loadingText,
  className = '',
  type = 'button',
  disabled,
  children,
  ...rest
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${base} ${VARIANTS[variant]} ${shine ? SHINE : ''} ${className}`}
      {...rest}
    >
      {loading ? (
        <>
          <Spinner />
          <span>{loadingText ?? children}</span>
        </>
      ) : (
        <>
          {children}
          {icon}
        </>
      )}
    </button>
  );
}
