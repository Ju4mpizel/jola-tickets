# JOLA Tickets · Frontend

Venta de las 180 entradas del Festival de Talentos 2026 (JOLA · Joy of Learning Academy), viernes 21 de noviembre de 2026, 19:00.
Pago con QR estático del banco, comprobante subido por el comprador y aprobación manual de la directiva.

## Fuentes de verdad (leer antes de trabajar)

- `docs/PLAN.md` — plan técnico completo. Secciones clave para el frontend:
  "Flujo y reglas comunes", "Contrato de la API", "Frontend compartido (Next.js)" y "Del prototipo HTML a componentes".
- `docs/prototype/jola-asientos.html` — prototipo funcional. Es la referencia visual y de comportamiento:
  colores, tipografías, animaciones, modo claro/oscuro, responsive y accesibilidad deben verse y comportarse igual.
- `docs/database/schema.sql` — esquema de Supabase (ya probado). No modificarlo desde el frontend.

## Stack

- Next.js 15 (App Router) en **JavaScript** (no TypeScript), pnpm.
- Tailwind CSS v4 configurado en `src/app/globals.css` con `@theme` (sin `tailwind.config.js`).
- `next-themes` (attribute="class"), `next/font/google` (Fredoka + Urbanist), `qrcode.react`, `qr-scanner`, `@supabase/supabase-js` (solo login de la directiva).

## Reglas

1. Seguir exactamente la estructura de carpetas y componentes del plan (unos 30 componentes y 8 hooks). No crear archivos extra:
   un componente va en su propio archivo solo si se reutiliza, tiene estado propio, pasa de ~150-200 líneas o hay una razón técnica.
2. Toda llamada al servidor pasa por `src/services/api.js`, con la base en `NEXT_PUBLIC_API_URL` y las rutas del contrato `/api/v1`.
3. **Modo simulado:** mientras no exista el backend, `NEXT_PUBLIC_USE_MOCKS=true` hace que `api.js` responda con datos de
   `src/services/mocks.js`, con la misma forma JSON que el contrato (incluidos los errores `{ error, message }` como `SEAT_TAKEN`).
4. El estado de la compra vive en `src/context/PurchaseContext.jsx` (`useReducer` + `usePurchase()`); el paso va en la URL (`?paso=`).
5. Eliminar los datos falsos del prototipo (sillas ocupadas al azar, QR inventado, pago simulado) fuera de `mocks.js`.
6. El total que se cobra lo calcula el servidor; el del frontend es solo informativo.
7. Nunca usar `SUPABASE_SERVICE_ROLE_KEY` ni llaves privadas de EmailJS en el frontend.
8. Mantener la accesibilidad del prototipo: `aria-pressed` y `aria-label` en cada silla, flechas en la grilla,
   anuncios `aria-live`, rayado en ocupadas, `prefers-reduced-motion`, `<dialog>` nativo.
9. Textos de la interfaz en español (Bolivia). Celular con prefijo +591, 8 dígitos, empieza con 6 o 7. Moneda "Bs".
10. El comprador solo da nombre, celular y correo. El campo "Vengo como" del prototipo **se eliminó**: no debe existir
    en el formulario, en el estado (`buyer = { name, phone, email }`), en `mocks.js` ni en las peticiones a la API.

## Forma de trabajo

- Avanzar por el "Orden de migración" del plan, **un paso a la vez**. Al terminar cada paso: `pnpm lint`, `pnpm build`,
  resumen de lo hecho y esperar confirmación antes del siguiente.
- Criterio de terminado de cada pieza: se ve y se comporta igual que el prototipo en modo claro y oscuro,
  a 360 px y a 1366 px de ancho, y funciona con teclado.
- Si algo del plan es ambiguo o choca con el prototipo, preguntar antes de inventar.

## Pendiente de recibir

- `public/images/qr-pago.png` — QR real de la cuenta del colegio (mientras tanto, usar un placeholder marcado como "QR de ejemplo").
