'use client';

import { memo, useEffect, useRef } from 'react';
import Stepper from '@/components/layout/Stepper';
import Topbar from '@/components/layout/Topbar';
import { useAnnounce } from '@/components/ui/ToastProvider';
import { PurchaseProvider, useOrder, usePurchaseFlow } from '@/context/PurchaseContext';
import PaymentStep from '@/features/checkout/PaymentStep';
import ReviewStep from '@/features/checkout/ReviewStep';
import useHold from '@/features/checkout/hooks/useHold';
import BuyerForm from '@/features/home/BuyerForm';
import Hero from '@/features/home/Hero';
import BookingSummary from '@/features/seat-map/BookingSummary';
import EventCard from '@/features/seat-map/EventCard';
import SeatMap from '@/features/seat-map/SeatMap';

// De 560 a 1023 px el inicio es una columna centrada de 560 px, como una app
const TABLET_COLUMN = 'min-[560px]:max-lg:mx-auto min-[560px]:max-lg:w-full min-[560px]:max-lg:max-w-[560px]';

const BACK_LABELS = { asientos: 'Volver a tus datos', pago: 'Volver a elegir asientos' };

export default function Page() {
  return (
    <PurchaseProvider>
      <PurchaseFlow />
    </PurchaseProvider>
  );
}

/**
 * Muestra el paso actual (?paso=) con la barra superior y los pasos.
 * No lee la selección: elegir asientos no lo vuelve a pintar.
 */
function PurchaseFlow() {
  const { step, stepIndex, steps, goBack } = usePurchaseFlow();
  const { order } = useOrder();
  const { releaseHold } = useHold();
  const announce = useAnnounce();
  const isHome = step === 'datos';
  const firstRender = useRef(true);
  const prevStep = useRef(step);

  // Al cambiar de paso: arriba de todo, anuncio y foco en el lugar de trabajo del paso
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    window.scrollTo(0, 0);
    announce(`Paso ${stepIndex + 1} de ${steps.length}: ${steps[stepIndex].label}`);
    const target = document.getElementById(isHome ? 'buyer-name' : `${step}-title`);
    target?.focus({ preventScroll: true });
  }, [step, stepIndex, steps, isHome, announce]);

  // Volver del pago al mapa (botón de la barra o atrás del navegador): se libera la retención
  useEffect(() => {
    const from = prevStep.current;
    prevStep.current = step;
    if (from === 'pago' && step === 'asientos' && order?.status === 'awaiting_payment' && !order.expired) releaseHold();
  }, [step, order, releaseHold]);

  // Orden vencida (temporizador en 0 o al recargar): se libera en el servidor antes de actualizar el mapa
  useEffect(() => {
    if (order?.expired) releaseHold();
  }, [order, releaseHold]);

  const onSeats = step === 'asientos';
  return (
    <div
      className={
        'mx-auto max-w-[1180px] px-3.5 pt-3.5 pb-[calc(32px+env(safe-area-inset-bottom))] max-[380px]:px-2.5 lg:px-7 lg:pt-6 ' +
        // En celular, espacio para la barra de reserva fija
        (onSeats ? 'max-lg:pb-[calc(var(--sum-h,170px)+20px)]' : '')
      }
    >
      <Topbar
        // En la revisión ya no se vuelve atrás: el comprobante está enviado
        showBack={!isHome && step !== 'revision'}
        onBack={goBack}
        backLabel={BACK_LABELS[step]}
        className={isHome ? TABLET_COLUMN : ''}
      />
      <Stepper steps={steps} current={step} className={isHome ? TABLET_COLUMN : ''} />

      {isHome ? (
        <section
          aria-labelledby="home-title"
          className={`grid animate-fade-in grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1.25fr)_minmax(380px,430px)] lg:items-stretch lg:gap-6 ${TABLET_COLUMN}`}
        >
          <Hero titleId="home-title" />
          <BuyerForm />
        </section>
      ) : (
        <>
          {/* El mapa sigue montado (escondido) durante el pago: al volver no repite la entrada
              ni el zoom. Mientras hay una orden, no se actualiza (sus sillas figuran ocupadas). */}
          <SeatsStep visible={onSeats} active={onSeats && !order} />
          {step === 'pago' && <PaymentStep titleId="pago-title" />}
          {step === 'revision' && <ReviewStep titleId="revision-title" />}
        </>
      )}
    </div>
  );
}

/**
 * Paso "asientos": mapa, tarjeta del evento y, en la columna lateral de 360 px (PC) o en la
 * barra fija (celular), el resumen de la reserva.
 * Con memo: solo cambia al mostrarse, esconderse o activarse.
 *
 * Se esconde con visibility y alto 0 (no con display: none, que reinicia todas las animaciones
 * CSS al volver a mostrarse) y conserva su ancho, así el zoom no cambia; inert evita el foco.
 * @param {{ visible: boolean, active: boolean }} props
 */
const SeatsStep = memo(function SeatsStep({ visible, active }) {
  return (
    <div
      inert={!visible}
      aria-hidden={!visible || undefined}
      className={
        'grid animate-fade-in gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-6 ' +
        (visible ? '' : 'invisible h-0 overflow-hidden')
      }
    >
      <main className="grid min-w-0 gap-4">
        <SeatMap titleId="asientos-title" active={active} />
        <EventCard />
      </main>
      <div className="lg:sticky lg:top-6 lg:grid lg:gap-4">
        <BookingSummary />
      </div>
    </div>
  );
});
