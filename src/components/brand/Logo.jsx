import Image from 'next/image';

const VARIANTS = {
  // Barra superior: azulejo con el logo que se mueve de vez en cuando
  topbar: {
    tile: 'size-[46px] rounded-[14px] bg-logo-tile border border-line',
    img: 'w-[38px] origin-[50%_70%] animate-wiggle',
    size: 38,
  },
  // Cabecera del boleto: siempre sobre azul marino
  ticket: {
    tile: 'size-[42px] rounded-[14px] bg-white',
    img: 'w-[34px]',
    size: 34,
  },
  // Hero de inicio: grande, entra girando y flota
  hero: {
    tile:
      'size-[76px] rounded-[22px] min-[560px]:size-[88px] min-[560px]:rounded-[26px] bg-white ' +
      'shadow-[0_14px_34px_-10px_rgba(0,0,0,.6),0_0_0_7px_rgba(127,214,230,.14)] ' +
      'animate-[logo-in_.7s_.2s_cubic-bezier(.3,1.5,.5,1)_both]',
    img: 'w-[62px] min-[560px]:w-[72px] animate-[bob_4.5s_1.4s_ease-in-out_infinite]',
    size: 72,
  },
};

/**
 * Logo de JOLA dentro de su azulejo.
 * @param {{ variant?: 'topbar' | 'ticket' | 'hero', className?: string, priority?: boolean }} props
 */
export default function Logo({ variant = 'topbar', className = '', priority = false }) {
  const v = VARIANTS[variant];
  return (
    <div className={`grid flex-none place-items-center overflow-hidden ${v.tile} ${className}`}>
      <Image
        src="/images/logo-jola.png"
        alt="JOLA"
        width={512}
        height={452}
        sizes={`${v.size * 2}px`}
        priority={priority}
        className={`block h-auto ${v.img}`}
      />
    </div>
  );
}
