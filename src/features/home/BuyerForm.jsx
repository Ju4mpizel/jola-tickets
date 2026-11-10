'use client';

import { useEffect, useRef, useState } from 'react';
import Button from '@/components/ui/Button';
import Field from '@/components/ui/Field';
import { IconArrowRight, IconLock, IconMail, IconPhone, IconUser } from '@/components/ui/icons';
import { useAnnounce } from '@/components/ui/ToastProvider';
import { usePurchase } from '@/context/PurchaseContext';
import { prefersReducedMotion, replayClass, vibrate } from '@/lib/feedback';
import { formatPhone, normalizeName, phoneDigits, validateEmail, validateName, validatePhone } from '@/lib/validators';

const STORAGE_KEY = 'jola-buyer';
const RULES = { name: validateName, phone: validatePhone, email: validateEmail };
const FIELD_ORDER = ['name', 'phone', 'email'];
const EMPTY = { name: '', phone: '', email: '' };

const asText = (v) => (typeof v === 'string' ? v : '');

/**
 * Convierte un comprador guardado en valores del formulario.
 * Solo toma name, phone y email: cualquier otro campo (como uno de una versión anterior) se ignora.
 */
function toValues(buyer) {
  if (!buyer || typeof buyer !== 'object') return EMPTY;
  return {
    name: asText(buyer.name),
    phone: formatPhone(asText(buyer.phone)),
    email: asText(buyer.email),
  };
}

/**
 * Formulario "Tus datos" del inicio. Valida con lib/validators.js, recuerda los datos
 * en este dispositivo (localStorage "jola-buyer") y al enviar pasa al mapa de asientos.
 */
export default function BuyerForm() {
  const { buyer, setBuyer, goTo } = usePurchase();
  const announce = useAnnounce();

  // Si se vuelve atrás desde el mapa, los datos salen del contexto
  const [values, setValues] = useState(() => toValues(buyer));
  const [errors, setErrors] = useState({}); // errores visibles
  const [loading, setLoading] = useState(false);
  const inputs = useRef({});
  const timer = useRef(null);

  // Primera visita: rellena con lo guardado en este dispositivo (después de montar, para no
  // desajustar la hidratación)
  useEffect(() => {
    if (buyer) return;
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (saved) setValues(toValues(saved));
    } catch {
      /* almacenamiento bloqueado o dañado: se ignora */
    }
    // Solo al montar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  function change(key, raw) {
    const value = key === 'phone' ? formatPhone(raw) : raw;
    setValues((v) => ({ ...v, [key]: value }));
    // Si el error ya se veía, se actualiza mientras escribe (y desaparece al corregirlo)
    if (errors[key]) setErrors((e) => ({ ...e, [key]: RULES[key](value) }));
  }

  function blur(key) {
    if (values[key].trim()) setErrors((e) => ({ ...e, [key]: RULES[key](values[key]) }));
  }

  function submit(e) {
    e.preventDefault();
    if (loading) return;

    const found = Object.fromEntries(FIELD_ORDER.map((k) => [k, RULES[k](values[k])]));
    setErrors(found);
    const bad = FIELD_ORDER.filter((k) => found[k]);
    if (bad.length) {
      const input = inputs.current[bad[0]];
      replayClass(input?.closest('[data-field]'), 'animate-shake');
      input?.focus();
      vibrate([15, 30, 15]);
      announce(bad.length === 1 ? 'Revisa el campo marcado' : `Revisa los ${bad.length} campos marcados`);
      return;
    }

    const next = {
      name: normalizeName(values.name),
      phone: phoneDigits(values.phone),
      email: values.email.trim(),
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* sin almacenamiento: solo no se recordará */
    }

    setLoading(true);
    timer.current = setTimeout(
      () => {
        setBuyer(next);
        goTo('asientos');
      },
      prefersReducedMotion() ? 0 : 650,
    );
  }

  const fieldProps = (key) => ({
    id: `buyer-${key}`,
    ref: (el) => {
      inputs.current[key] = el;
    },
    value: values[key],
    onChange: (e) => change(key, e.target.value),
    onBlur: () => blur(key),
    valid: !RULES[key](values[key]),
    error: errors[key] || '',
    required: true,
  });

  return (
    <form
      noValidate
      onSubmit={submit}
      aria-labelledby="buyer-form-title"
      className={
        'relative z-[2] flex min-w-0 animate-[form-in_.75s_.45s_cubic-bezier(.2,.8,.2,1)_both] flex-col gap-4 ' +
        'rounded-card border border-line bg-surface shadow-elev transition-colors duration-300 ' +
        '-mt-[50px] px-4 pt-[22px] pb-5 ' +
        'min-[560px]:mx-3.5 min-[560px]:-mt-14 min-[560px]:gap-[18px] min-[560px]:px-[26px] min-[560px]:pt-7 min-[560px]:pb-6 ' +
        // En PC la tarjeta toma la altura del hero: más aire entre campos para que no quede vacía
        'lg:m-0 lg:justify-center lg:gap-6 lg:px-[30px] lg:pt-8 lg:pb-7'
      }
    >
      <div className="mb-1 animate-rise [animation-delay:.6s] lg:mb-2">
        <h2 id="buyer-form-title" className="text-[1.3rem] font-extrabold tracking-[-.01em]">
          Tus datos
        </h2>
        <p className="mt-[3px] text-[.88rem] font-semibold text-muted">Solo los usamos para enviarte tu entrada.</p>
      </div>

      <Field
        {...fieldProps('name')}
        label="Nombre completo"
        icon={<IconUser />}
        type="text"
        autoComplete="name"
        placeholder="Ej. María Pérez"
        delay={1}
      />
      <Field
        {...fieldProps('phone')}
        label="Celular"
        icon={<IconPhone />}
        prefix="+591"
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        placeholder="7123 4567"
        maxLength={9}
        delay={2}
      />
      <Field
        {...fieldProps('email')}
        label="Correo electrónico"
        icon={<IconMail />}
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="nombre@correo.com"
        delay={3}
      />

      <Button
        type="submit"
        shine
        loading={loading}
        loadingText="Preparando el mapa"
        icon={<IconArrowRight />}
        className="mt-2 animate-[rise_.5s_1s_ease_both] lg:mt-3"
      >
        Elegir mis asientos
      </Button>

      <p className="flex animate-[rise_.5s_1.1s_ease_both] items-center justify-center gap-1.5 text-center text-[.78rem] font-semibold text-muted [&_svg]:size-3.5 [&_svg]:flex-none">
        <IconLock />
        Tus datos están protegidos y seguros
      </p>
    </form>
  );
}
