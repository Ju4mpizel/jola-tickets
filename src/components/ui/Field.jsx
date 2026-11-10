import { IconCheck } from './icons';

/**
 * Campo de texto del formulario: etiqueta, ícono, prefijo opcional (+591),
 * marca ✓ cuando es válido y mensaje de error con aria-live.
 * El componente padre decide cuándo mostrar el error (al salir del campo o al enviar).
 * @param {{
 *   id: string,
 *   label: string,
 *   icon?: React.ReactNode,
 *   prefix?: string,
 *   error?: string,               // mensaje visible; '' o undefined = sin error
 *   valid?: boolean,              // muestra la marca ✓
 *   delay?: number,               // orden en la animación de entrada (--d)
 *   ref?: React.Ref<HTMLInputElement>,
 *   className?: string,
 * } & React.InputHTMLAttributes<HTMLInputElement>} props
 */
export default function Field({ id, label, icon, prefix, error, valid = false, delay = 0, ref, className = '', ...inputProps }) {
  const errId = `${id}-err`;
  const invalid = !!error;

  return (
    <div
      data-field
      style={{ '--d': delay }}
      className={`grid min-w-0 animate-rise grid-cols-[minmax(0,1fr)] gap-[7px] [animation-delay:calc(.6s+var(--d)*80ms)] ${className}`}
    >
      <label htmlFor={id} className="text-[.86rem] font-extrabold text-ink">
        {label}
      </label>

      <div
        className={
          'group relative flex h-[54px] items-center rounded-[14px] border-[1.5px] bg-surface-2 ' +
          'transition-[border-color,box-shadow,background-color] duration-200 ' +
          'focus-within:border-cyan-strong focus-within:bg-surface focus-within:shadow-[0_0_0_4px_rgba(127,214,230,.25)] ' +
          (invalid ? 'border-danger shadow-[0_0_0_4px_rgba(224,68,95,.12)]' : 'border-line')
        }
      >
        {icon && (
          <span className="ml-3.5 flex-none text-muted transition-colors duration-200 group-focus-within:text-cyan-strong [&_svg]:size-[19px]">
            {icon}
          </span>
        )}
        {prefix && (
          <span aria-hidden="true" className="ml-2.5 flex-none rounded-[9px] bg-surface-3 px-[9px] py-[5px] text-[.88rem] font-extrabold text-ink">
            {prefix}
          </span>
        )}
        <input
          ref={ref}
          id={id}
          aria-invalid={invalid}
          aria-describedby={errId}
          className="h-full w-full min-w-0 flex-1 border-0 bg-transparent pr-11 pl-2.5 text-base font-semibold text-ink outline-none placeholder:text-muted placeholder:opacity-55"
          {...inputProps}
        />
        <span
          aria-hidden="true"
          className={
            'pointer-events-none absolute right-3.5 grid size-[22px] place-items-center rounded-full bg-ok text-white ' +
            'transition-[opacity,scale] duration-300 ease-[cubic-bezier(.3,1.6,.5,1)] [&_svg]:size-[13px] ' +
            (valid ? 'scale-100 opacity-100' : 'scale-40 opacity-0')
          }
        >
          <IconCheck />
        </span>
      </div>

      <p id={errId} aria-live="polite" className="flex animate-[rise_.25s_ease] items-center gap-1.5 text-[.8rem] font-bold text-danger-ink empty:hidden">
        {error}
      </p>
    </div>
  );
}
