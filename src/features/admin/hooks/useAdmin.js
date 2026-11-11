'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, adminAuth } from '@/services/api';

const LOGIN_PATH = '/admin/login';

/**
 * Sesión de la directiva y llamadas autenticadas a /admin/*.
 * - require: true (páginas del panel) → sin sesión redirige al login con ?next= para volver.
 * - call(fn, ...args) llama a una función de `admin` (api.js) con el token vigente como
 *   primer argumento; si el servidor responde UNAUTHORIZED, cierra la sesión y vuelve al login.
 * @param {{ require?: boolean }} [options]
 * @returns {{
 *   session: { email: string, token: string, expiresAt: number } | null,
 *   ready: boolean,                                   // ya se leyó la sesión guardada
 *   login: (email: string, password: string) => Promise<void>,
 *   logout: () => Promise<void>,
 *   call: <T>(fn: (token: string, ...args: any[]) => Promise<T>, ...args: any[]) => Promise<T>,
 * }}
 */
export default function useAdmin({ require = false } = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);

  const toLogin = useCallback(
    (reason) => {
      const params = new URLSearchParams({ next: pathname || '/admin' });
      if (reason) params.set('motivo', reason);
      router.replace(`${LOGIN_PATH}?${params}`);
    },
    [pathname, router],
  );

  useEffect(() => {
    let alive = true;
    adminAuth.getSession().then((s) => {
      if (!alive) return;
      setSession(s);
      setReady(true);
      if (require && !s) toLogin();
    });
    return () => {
      alive = false;
    };
  }, [require, toLogin]);

  const login = useCallback(async (email, password) => {
    const s = await adminAuth.signIn(email.trim(), password);
    setSession(s);
  }, []);

  const logout = useCallback(async () => {
    const s = await adminAuth.getSession();
    await adminAuth.signOut(s?.token).catch(() => {});
    setSession(null);
    router.replace(LOGIN_PATH);
  }, [router]);

  const call = useCallback(
    async (fn, ...args) => {
      const s = await adminAuth.getSession();
      if (!s) {
        setSession(null);
        toLogin('sesion');
        throw new ApiError(401, 'UNAUTHORIZED');
      }
      try {
        return await fn(s.token, ...args);
      } catch (err) {
        if (err?.error === 'UNAUTHORIZED') {
          await adminAuth.signOut(s.token).catch(() => {});
          setSession(null);
          toLogin('sesion');
        }
        throw err;
      }
    },
    [toLogin],
  );

  return { session, ready, login, logout, call };
}
