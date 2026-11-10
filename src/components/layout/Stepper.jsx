/**
 * Pasos de la compra. Marca los completos con ✓ y el actual con aria-current.
 * En pantallas de 420 px o menos solo se ve el texto del paso actual
 * (los demás quedan para lectores de pantalla).
 * @param {{
 *   steps: { id: string, label: string }[],
 *   current: string,          // id del paso actual
 *   className?: string,
 * }} props
 */
export default function Stepper({ steps, current, className = '' }) {
  const currentIndex = Math.max(0, steps.findIndex((s) => s.id === current));

  return (
    <ol aria-label="Pasos de la compra" className={`mx-0.5 mb-4 flex list-none gap-1.5 ${className}`}>
      {steps.map((step, i) => {
        const isCurrent = i === currentIndex;
        const isDone = i < currentIndex;
        const isOn = i <= currentIndex;
        const isLast = i === steps.length - 1;

        return (
          <li
            key={step.id}
            aria-current={isCurrent ? 'step' : undefined}
            style={{ animationDelay: `${i * 0.08}s` }}
            className={`flex flex-1 animate-[rise_.45s_ease_both] items-center gap-1.5 text-[.78rem] font-bold ${isOn ? 'text-ink' : 'text-muted'}`}
          >
            <span
              aria-hidden="true"
              className={
                'grid size-[22px] flex-none place-items-center rounded-full border-[1.5px] text-[.7rem] transition-colors duration-300 ' +
                (isDone
                  ? 'border-sel bg-sel text-on-sel'
                  : isOn
                    ? 'border-primary bg-primary text-on-primary'
                    : 'border-line bg-surface')
              }
            >
              {isDone ? '✓' : i + 1}
            </span>
            <span className={isCurrent ? '' : 'max-[420px]:sr-only'}>
              {step.label}
              {isDone && <span className="sr-only"> (completado)</span>}
            </span>
            {!isLast && (
              <span
                aria-hidden="true"
                className="h-0.5 flex-1 origin-left animate-fill rounded-xs bg-line"
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
