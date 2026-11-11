'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import Topbar from '@/components/layout/Topbar';
import Button from '@/components/ui/Button';
import Field from '@/components/ui/Field';
import { IconLock, IconMail } from '@/components/ui/icons';
import useAdmin from '@/features/admin/hooks/useAdmin';
import { validateEmail } from '@/lib/validators';

/** Solo rutas internas del panel (evita redirigir a otro sitio con ?next=). */
function safeNext(value) {
  return value && value.startsWith('/admin') && !value.startsWith('/admin/login') ? value : '/admin';
}

/** Ingreso de la directiva: correo y contraseña. */
export default function AdminLoginPage() {
  const router = useRouter();
  const { session, ready, login } = useAdmin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const emailRef = useRef(null);
  const passwordRef = useRef(null);

  // ¿Llegó por una sesión vencida? (se lee en el cliente: la página es estática)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('motivo') === 'sesion') setNotice('Tu sesión venció. Vuelve a entrar.');
  }, []);

  // Con sesión, directo al panel
  useEffect(() => {
    if (ready && session) router.replace(safeNext(new URLSearchParams(window.location.search).get('next')));
  }, [ready, session, router]);

  async function onSubmit(e) {
    e.preventDefault();
    const next = {
      email: email.trim() ? validateEmail(email) : 'Escribe tu correo',
      password: password ? '' : 'Escribe tu contraseña',
    };
    setErrors(next);
    setFormError('');
    if (next.email || next.password) {
      (next.email ? emailRef : passwordRef).current?.focus();
      return;
    }
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setFormError(err?.message || 'No pudimos iniciar sesión');
      passwordRef.current?.select();
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Topbar subtitle="Panel de la directiva" className="mx-auto max-w-[440px]" />
      <main className="mx-auto mt-4 w-full max-w-[440px] animate-card-in">
        <form
          noValidate
          onSubmit={onSubmit}
          aria-labelledby="login-title"
          className="grid gap-4 rounded-card border border-line bg-surface px-5 pt-6 pb-5 shadow-elev transition-colors duration-300"
        >
          <div>
            <h1 id="login-title" className="text-[1.3rem] font-extrabold">
              Ingresa al panel
            </h1>
            <p className="mt-0.5 text-[.9rem] font-semibold text-muted">Solo para la directiva del colegio.</p>
          </div>

          {notice && (
            <p role="status" className="rounded-[14px] border border-band-line bg-band px-3.5 py-2.5 text-[.88rem] font-bold">
              {notice}
            </p>
          )}

          <Field
            ref={emailRef}
            id="admin-email"
            label="Correo"
            type="email"
            autoComplete="username"
            inputMode="email"
            icon={<IconMail />}
            value={email}
            error={errors.email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Field
            ref={passwordRef}
            id="admin-password"
            label="Contraseña"
            type="password"
            autoComplete="current-password"
            icon={<IconLock />}
            value={password}
            error={errors.password}
            delay={1}
            onChange={(e) => setPassword(e.target.value)}
          />

          {formError && (
            <p role="alert" className="text-[.88rem] font-bold text-danger-ink">
              {formError}
            </p>
          )}

          <Button type="submit" loading={loading} loadingText="Entrando" className="w-full">
            Entrar
          </Button>
        </form>
      </main>
    </>
  );
}
