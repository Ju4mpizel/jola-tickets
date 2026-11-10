'use client';

import { useEffect, useState } from 'react';
import Logo from '@/components/brand/Logo';
import Rays from '@/components/brand/Rays';
import { IconCalendar, IconClock, IconPin, IconTicket } from '@/components/ui/icons';
import { EVENT, MIN_PRICE, formatMoney } from '@/lib/event';
import { prefersReducedMotion } from '@/lib/feedback';
import Countdown from './Countdown';

const PARTICLES = 26;

/* ---------- Fondo (decorativo) ---------- */

const BEAMS = [
  { pos: { left: '-14%' }, angle: '-24deg', delays: '.25s, -2s' },
  { pos: { left: '24%' }, angle: '3deg', delays: '.45s, -5s' },
  { pos: { right: '-14%' }, angle: '24deg', delays: '.65s, -7s' },
];

/** Partículas que suben; se crean en el cliente para no usar Math.random en el render. */
function Particles() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    setItems(
      Array.from({ length: PARTICLES }, (_, i) => {
        const star = i % 5 === 0;
        const size = 2 + Math.random() * 3;
        return {
          id: i,
          star,
          style: {
            left: `${Math.random() * 100}%`,
            '--o': (0.35 + Math.random() * 0.5).toFixed(2),
            '--h': `${260 + Math.random() * 420}px`,
            animationDuration: `${7 + Math.random() * 9}s`,
            animationDelay: `${-Math.random() * 14}s`,
            ...(star ? { fontSize: `${8 + Math.random() * 8}px` } : { width: `${size}px`, height: `${size}px` }),
          },
        };
      }),
    );
  }, []);

  return (
    <div>
      {items.map((p) => (
        <i
          key={p.id}
          style={p.style}
          className={
            'absolute -bottom-2.5 animate-[float_linear_infinite] rounded-full not-italic opacity-0 ' +
            (p.star ? 'leading-none text-cyan' : 'bg-[#BFEFF7]')
          }
        >
          {p.star ? '✦' : null}
        </i>
      ))}
    </div>
  );
}

function HeroBackground() {
  return (
    <div
      aria-hidden="true"
      className={
        'absolute inset-0 -z-10 overflow-hidden ' +
        "before:absolute before:inset-0 before:bg-[radial-gradient(90%_55%_at_50%_0%,rgba(30,64,160,.55),transparent_70%)] before:content-[''] " +
        "after:absolute after:inset-x-0 after:bottom-0 after:h-[55%] after:bg-[linear-gradient(to_top,#071640_15%,transparent)] after:content-['']"
      }
    >
      {/* Patrón de puntos que se desvanece hacia abajo */}
      <div className="absolute inset-0 bg-[radial-gradient(rgba(127,214,230,.22)_1px,transparent_1.3px)] bg-size-[20px_20px] [mask-image:linear-gradient(to_bottom,#000,transparent_70%)] [-webkit-mask-image:linear-gradient(to_bottom,#000,transparent_70%)]" />
      {/* Focos que se balancean */}
      {BEAMS.map((b, i) => (
        <span
          key={i}
          style={{
            ...b.pos,
            '--a': b.angle,
            transform: 'rotate(var(--a))',
            animation: 'beam-on 1s ease forwards, sway 9s ease-in-out infinite',
            animationDelay: b.delays,
          }}
          className={
            'absolute -top-[6%] h-[115%] w-[52%] origin-[50%_0] opacity-0 blur-[9px] ' +
            '[clip-path:polygon(47%_0,53%_0,100%_100%,0_100%)] ' +
            'bg-[linear-gradient(to_bottom,rgba(214,244,250,.26),rgba(127,214,230,.06)_55%,transparent_85%)]'
          }
        />
      ))}
      <Particles />
      {/* Brillo del piso */}
      <div className="absolute -inset-x-[15%] -bottom-[90px] h-[180px] animate-[floor_5s_ease-in-out_infinite] rounded-[50%] bg-[radial-gradient(closest-side,rgba(127,214,230,.30),transparent)]" />
    </div>
  );
}

/* ---------- Hero ---------- */

const INFO = [
  { icon: IconCalendar, text: EVENT.dateShort },
  { icon: IconClock, text: EVENT.time },
  { icon: IconPin, text: EVENT.place },
  { icon: IconTicket, text: `Desde ${formatMoney(MIN_PRICE)}` },
];

/**
 * Portada del inicio: fondo de escenario, logo, título, datos del evento y cuenta regresiva.
 * @param {{ titleId: string }} props   id del h1 (lo usa la sección como aria-labelledby)
 */
export default function Hero({ titleId }) {
  return (
    <div
      className={
        'relative isolate flex min-w-0 animate-[hero-in_.8s_cubic-bezier(.2,.8,.2,1)_both] flex-col justify-end overflow-hidden rounded-[28px] ' +
        'border border-[rgba(127,214,230,.12)] bg-hero text-white shadow-elev ' +
        'px-[18px] pt-[58px] pb-[74px] min-[560px]:px-8 min-[560px]:pt-16 min-[560px]:pb-[84px] lg:min-h-[640px] lg:px-11 lg:pt-16 lg:pb-11'
      }
    >
      <HeroBackground />

      <div className="relative">
        <div className="relative mb-5 w-max">
          <Rays variant="hero" />
          <Logo variant="hero" priority />
        </div>

        <span className="mb-2.5 inline-block animate-[rise_.5s_.5s_ease_both] text-[.74rem] font-extrabold tracking-[.16em] text-cyan uppercase">
          Compra de entradas
        </span>

        <h1 id={titleId} className="text-[clamp(1.95rem,8.6vw,3.6rem)] leading-none font-extrabold tracking-[-.03em]">
          <span className="block overflow-hidden pb-[.06em]">
            <span className="inline-block animate-[line-up_.85s_.55s_cubic-bezier(.2,.8,.2,1)_both]">{EVENT.titleLines[0]}</span>
          </span>
          <span className="block overflow-hidden pb-[.06em]">
            <span className="inline-block animate-[line-up_.85s_.68s_cubic-bezier(.2,.8,.2,1)_both]">
              {EVENT.titleLines[1]} <em className="text-cyan not-italic">{EVENT.year}</em>
            </span>
          </span>
        </h1>

        <p className="mt-3.5 mb-5 max-w-[38ch] animate-[rise_.6s_.85s_ease_both] text-[clamp(.9rem,3.6vw,1rem)] leading-[1.45] font-semibold text-white/78">
          {EVENT.tagline}
        </p>

        <ul aria-label="Datos del evento" className="grid list-none grid-cols-2 gap-1.5 min-[560px]:flex min-[560px]:flex-wrap min-[560px]:gap-2">
          {INFO.map(({ icon: Icon, text }, i) => (
            <li
              key={text}
              style={{ animationDelay: `${0.95 + i * 0.08}s` }}
              className={
                'inline-flex min-w-0 animate-rise items-center gap-1.5 rounded-full border border-white/14 bg-white/8 px-2.5 py-[7px] text-[.78rem] font-bold backdrop-blur-[6px] ' +
                'max-[359px]:px-[9px] min-[560px]:gap-[7px] min-[560px]:px-3 min-[560px]:py-2 min-[560px]:text-[.84rem]'
              }
            >
              <Icon className="size-[15px] flex-none text-cyan max-[359px]:hidden" />
              <span className="truncate">{text}</span>
            </li>
          ))}
        </ul>

        <Countdown target={EVENT.startsAt} />
      </div>
    </div>
  );
}
