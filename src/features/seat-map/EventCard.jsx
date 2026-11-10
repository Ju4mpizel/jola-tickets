import Reveal from '@/components/ui/Reveal';
import { IconStar } from '@/components/ui/icons';
import { EVENT } from '@/lib/event';

/**
 * Tarjeta del evento con forma de boleto (debajo del mapa). Aparece al hacer scroll:
 * la línea punteada se dibuja desde el centro y la estrella salta.
 */
export default function EventCard() {
  return (
    <Reveal
      as="section"
      aria-label="Datos del evento"
      className="relative overflow-hidden rounded-card border border-line bg-surface px-[18px] pt-[18px] pb-4 shadow-elev transition-colors duration-300"
    >
      <div className="mb-4 flex items-start justify-between gap-2.5">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-band-line bg-band px-2.5 py-1 text-[.72rem] font-extrabold tracking-[.06em] text-accent-ink uppercase">
            Evento escolar
          </span>
          <h2 className="mt-2 text-[1.3rem] leading-[1.2] font-extrabold tracking-[-.01em]">{EVENT.name}</h2>
        </div>
      </div>

      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
        <div>
          <div className="text-[1.45rem] leading-none font-extrabold tracking-[-.02em]">{EVENT.doorsOpen}</div>
          <small className="mt-1 block text-[.74rem] font-bold text-muted">Apertura de puertas</small>
        </div>

        <div className="text-center text-[.72rem] font-bold text-muted">
          {EVENT.dateShort}
          <div
            className={
              'relative my-1 grid h-[22px] place-items-center ' +
              "before:absolute before:inset-x-0 before:top-1/2 before:border-t-[1.5px] before:border-dashed before:border-line before:content-[''] " +
              'group-data-[revealed=true]/reveal:before:animate-[dash_1s_ease_both]'
            }
          >
            <span
              className={
                'relative grid size-[26px] place-items-center rounded-full border-[1.5px] border-cyan bg-surface transition-colors duration-300 ' +
                'group-data-[revealed=true]/reveal:animate-[pop_.5s_.4s_cubic-bezier(.3,1.6,.5,1)_both]'
              }
            >
              <IconStar className="size-3.5 text-accent-ink" />
            </span>
          </div>
          {EVENT.place}
        </div>

        <div className="text-right">
          <div className="text-[1.45rem] leading-none font-extrabold tracking-[-.02em]">{EVENT.time}</div>
          <small className="mt-1 block text-[.74rem] font-bold text-muted">Inicio de la función</small>
        </div>
      </div>
    </Reveal>
  );
}
