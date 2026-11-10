/**
 * Los "rayos" del logo de JOLA, que se dibujan uno tras otro y luego brillan.
 * - stage: sobre el escenario del mapa (usa el cian del tema)
 * - hero:  sobre el logo del inicio (más gruesos, siempre cian)
 */
const VARIANTS = {
  stage: {
    viewBox: '0 0 150 30',
    className: 'w-[150px] h-[30px] -mb-0.5 stroke-cyan [stroke-width:5]',
    lines: [
      [20, 20, 30, 26],
      [48, 8, 53, 20],
      [75, 4, 75, 17],
      [102, 8, 97, 20],
      [130, 20, 120, 26],
    ],
    dash: 14,
    duration: 0.5,
    delay: 0.75,
    step: 0.08,
  },
  hero: {
    viewBox: '0 0 150 34',
    className: 'absolute left-1/2 -top-[30px] w-[150px] h-[34px] -translate-x-1/2 overflow-visible stroke-cyan [stroke-width:6]',
    lines: [
      [14, 22, 26, 30],
      [44, 6, 51, 21],
      [75, 2, 75, 18],
      [106, 6, 99, 21],
      [136, 22, 124, 30],
    ],
    dash: 16,
    duration: 0.45,
    delay: 0.75,
    step: 0.07,
  },
};

/**
 * @param {{ variant?: 'stage' | 'hero', className?: string }} props
 */
export default function Rays({ variant = 'stage', className = '' }) {
  const v = VARIANTS[variant];
  return (
    <svg viewBox={v.viewBox} aria-hidden="true" focusable="false" className={`${v.className} ${className}`}>
      {v.lines.map(([x1, y1, x2, y2], i) => (
        <line
          key={i}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          strokeLinecap="round"
          style={{
            strokeDasharray: v.dash,
            strokeDashoffset: v.dash,
            animation: `ray ${v.duration}s ease forwards, glow 3s ease-in-out infinite`,
            animationDelay: `${(v.delay + v.step * i).toFixed(2)}s, ${(2 + 0.2 * i).toFixed(1)}s`,
          }}
        />
      ))}
    </svg>
  );
}
