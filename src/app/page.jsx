'use client';

import { useEffect, useRef } from 'react';
import Stepper from '@/components/layout/Stepper';
import Topbar from '@/components/layout/Topbar';
import { useAnnounce } from '@/components/ui/ToastProvider';
import { PurchaseProvider, usePurchase } from '@/context/PurchaseContext';
import BuyerForm from '@/features/home/BuyerForm';
import Hero from '@/features/home/Hero';
import EventCard from '@/features/seat-map/EventCard';
import SeatMap from '@/features/seat-map/SeatMap';

// De 560 a 1023 px el inicio es una columna centrada de 560 px, como una app
const TABLET_COLUMN = 'min-[560px]:max-lg:mx-auto min-[560px]:max-lg:w-full min-[560px]:max-lg:max-w-[560px]';

export default function Page() {
  return (
    <PurchaseProvider>
      <PurchaseFlow />
    </PurchaseProvider>
  );
}

/** Muestra el paso actual (?paso=) con la barra superior y los pasos. */
function PurchaseFlow() {
  const { step, stepIndex, steps, goBack } = usePurchase();
  const announce = useAnnounce();
  const isHome = step === 'datos';
  const firstRender = useRef(true);

  // Al cambiar de paso: arriba de todo, anuncio y foco en el lugar de trabajo del paso
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    window.scrollTo(0, 0);
    announce(`Paso ${stepIndex + 1} de ${steps.length}: ${steps[stepIndex].label}`);
    const target = document.getElementById(isHome ? 'buyer-name' : 'step-title');
    target?.focus({ preventScroll: true });
  }, [step, stepIndex, steps, isHome, announce]);

  return (
    <div className="mx-auto max-w-[1180px] px-3.5 pt-3.5 pb-[calc(32px+env(safe-area-inset-bottom))] max-[380px]:px-2.5 lg:px-7 lg:pt-6">
      <Topbar showBack={!isHome} onBack={goBack} className={isHome ? TABLET_COLUMN : ''} />
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
        <SeatsStep />
      )}
    </div>
  );
}

/**
 * Paso "asientos": mapa y tarjeta del evento. En PC deja la columna lateral de 360 px
 * para el resumen de la reserva (paso 5 del orden de migración).
 */
function SeatsStep() {
  return (
    <div className="grid animate-fade-in gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-6">
      <main className="grid min-w-0 gap-4">
        <SeatMap titleId="step-title" />
        <EventCard />
      </main>
      <div className="max-lg:hidden lg:sticky lg:top-6 lg:grid lg:gap-4" />
    </div>
  );
}
