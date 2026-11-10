/**
 * Íconos SVG del prototipo. Son decorativos (aria-hidden): el texto accesible
 * va siempre en el botón o elemento que los contiene.
 * Todos aceptan las props de <svg> (className, style…).
 */

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round',
  'aria-hidden': true,
  focusable: 'false',
};

export function IconBack(props) {
  return (
    <svg {...base} strokeWidth="2.2" strokeLinejoin="round" {...props}>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

export function IconArrowRight(props) {
  return (
    <svg {...base} strokeWidth="2.4" strokeLinejoin="round" {...props}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function IconMoon(props) {
  return (
    <svg {...base} strokeWidth="2" strokeLinejoin="round" {...props}>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}

export function IconSun(props) {
  return (
    <svg {...base} strokeWidth="2" {...props}>
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

export function IconCalendar(props) {
  return (
    <svg {...base} strokeWidth="2.2" {...props}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  );
}

export function IconClock(props) {
  return (
    <svg {...base} strokeWidth="2.2" {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export function IconPin(props) {
  return (
    <svg {...base} strokeWidth="2.2" strokeLinejoin="round" {...props}>
      <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </svg>
  );
}

export function IconTicket(props) {
  return (
    <svg {...base} strokeWidth="2.2" strokeLinejoin="round" {...props}>
      <path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z" />
      <path d="M14 6v12" strokeDasharray="2 2.5" />
    </svg>
  );
}

export function IconStar(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false" {...props}>
      <path d="M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.3l-5.8 3.1 1.1-6.5L2.6 9.3l6.5-.9z" />
    </svg>
  );
}

export function IconTimer(props) {
  return (
    <svg {...base} strokeWidth="2.2" {...props}>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 2M9 2h6" />
    </svg>
  );
}

export function IconUser(props) {
  return (
    <svg {...base} strokeWidth="2" {...props}>
      <circle cx="12" cy="8.5" r="4" />
      <path d="M4.5 20c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5" />
    </svg>
  );
}

export function IconPhone(props) {
  return (
    <svg {...base} strokeWidth="2" {...props}>
      <rect x="6.5" y="2.5" width="11" height="19" rx="3" />
      <path d="M10.5 18.5h3" />
    </svg>
  );
}

export function IconMail(props) {
  return (
    <svg {...base} strokeWidth="2" strokeLinejoin="round" {...props}>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="M4 7l8 6 8-6" />
    </svg>
  );
}

export function IconLock(props) {
  return (
    <svg {...base} strokeWidth="2.2" {...props}>
      <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </svg>
  );
}

export function IconCheck(props) {
  return (
    <svg {...base} strokeWidth="3.5" strokeLinejoin="round" {...props}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}
