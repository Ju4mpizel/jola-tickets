# JOLA Tickets — Plan técnico en dos versiones

Nov 9, 2026 · @Zel

## Resumen

La app vende las 180 entradas del Festival de Talentos 2026 (viernes 21 de noviembre, 19:00) con pago por QR estático del banco, comprobante subido por el comprador y aprobación manual de la directiva. Se plantea en dos versiones que comparten el **mismo frontend**, la **misma base de datos** y el **mismo contrato de API**; solo cambia dónde corre la API.

- **Versión A — Next.js + FastAPI + Supabase.** Frontend y backend separados. Recomendada si el compañero programador se encarga del backend en Python.
- **Versión B — Next.js + Supabase.** La API vive dentro del mismo proyecto de Next.js (Route Handlers). Recomendada si una sola persona desarrolla todo.

La lógica crítica (retener asientos, enviar comprobante, aprobar, rechazar, check-in) va en **funciones SQL dentro de Supabase**. Así ambas versiones son una capa delgada encima de la base de datos, y se puede pasar de B a A, o al revés, sin reescribir el frontend ni la lógica.

**Plazo:** el evento es el 21 de noviembre. Las ventas deberían abrir alrededor del 15 o 16 de noviembre, lo que deja unos 6 días de desarrollo desde hoy.

**Fuera de alcance:** integración con API bancaria, pagos con tarjeta y facturación con NIT.

Arquitectura: el **frontend Next.js** (mismo código en ambas versiones, en Vercel) llama al mismo contrato REST `/api/v1`. Esa API la sirve **o** FastAPI (Versión A, servidor aparte en Railway o Fly, conectado por SQLAlchemy al pooler) **o** Route Handlers de Next.js (Versión B, en el mismo proyecto de Vercel, con supabase-js y service_role). Debajo, **Supabase es común**: PostgreSQL (tablas y funciones SQL atómicas), Storage (bucket privado `receipts`) y Auth (cuentas de la directiva).

La lógica crítica vive en las funciones SQL de PostgreSQL; por eso se puede cambiar la capa de API sin reescribir el frontend ni la base de datos.

## Flujo y reglas comunes

El flujo es el mismo en las dos versiones; la orden se crea en el momento de retener los asientos, para que el código de orden exista antes de transferir.

1. **Datos.** El comprador llena nombre, celular (+591) y correo. Se valida en el navegador y otra vez en el servidor.
2. **Asientos.** Elige hasta 8 asientos en el mapa. El mapa se actualiza cada 15 segundos.
3. **Retener.** Al tocar "Continuar al pago", el servidor crea la orden en estado `awaiting_payment` y retiene los asientos 15 minutos. Devuelve `order_id`, `order_code` (ej. JOLA-4F2A9C), `access_token` y el total calculado por el servidor.
4. **Pagar.** La pantalla muestra el QR estático del colegio, el total y el código de orden, con la instrucción de escribir ese código en la glosa de la transferencia.
5. **Comprobante.** El comprador sube la captura. La orden pasa a `pending_review` y los asientos dejan de vencer.
6. **Revisión.** La directiva compara el comprobante con el movimiento real en la app del banco (monto + código en la glosa) y aprueba o rechaza con un clic.
7. **Boletos.** Al aprobar se crea un boleto por asiento con un token único y se envía un correo con EmailJS con el enlace `/tickets/{token}` y el QR. Al rechazar se envía el motivo y los asientos se liberan.
8. **Puerta.** El personal escanea el QR desde `/admin/checkin`. Cada boleto entra una sola vez.

### Reglas de negocio

| Regla | Valor |
| --- | --- |
| Asientos | 180: filas A–I × 20, pasillo entre el 10 y el 11 |
| Precio | Filas A–B preferencial Bs 50 · filas C–I general Bs 30 |
| Máximo por compra | 8 asientos |
| Retención | 15 minutos (el temporizador del frontend muestra 1 minuto menos como margen) |
| Celular | 8 dígitos, empieza con 6 o 7 |
| Total | Siempre calculado en la base de datos, nunca se confía en el precio enviado por el navegador |
| Prueba de pago | El movimiento en la cuenta del colegio con el código de orden en la glosa; la captura sola no basta |
| Comprobante | Imagen JPG, PNG o WEBP, o PDF, máximo 4 MB (se comprime en el navegador antes de subir) |
| Asientos bloqueados | La directiva puede bloquear sillas para profesores o invitados (estado `blocked`) |

### Estados

- **Asiento:** `available` → `held` (15 min) → `pending_review` → `sold`. También `blocked`. Un asiento `held` vencido cuenta como libre sin necesidad de limpiarlo.
- **Orden:** `awaiting_payment` → `pending_review` → `approved` o `rejected`. También `cancelled` si el comprador vuelve atrás. Una orden `awaiting_payment` vencida simplemente se ignora.

## Base de datos (Supabase)

Este script es la base de ambas versiones: se ejecuta completo, una sola vez, en el SQL Editor de Supabase. Se probó en PostgreSQL 16 con el flujo completo, vencimientos, rechazo, check-in doble y 20 compradores simultáneos por la misma silla: solo uno la obtiene.

Cambios respecto al plan original:

- `seats.order_id` y `orders.seat_ids` vinculan cada asiento con su orden; sin eso no se podía rechazar ni emitir boletos.
- La orden se crea al retener (estado `awaiting_payment`), con un `access_token` secreto que reemplaza a `hold_session_id`.
- `receipt_path` guarda la ruta en un bucket **privado**, no una URL pública.
- Restricciones `CHECK` en estados, celular y correo, y `UNIQUE` en `tickets.seat_id` para que nunca existan dos boletos de la misma silla.
- Toda la lógica crítica vive en funciones SQL atómicas: retener sin un `SELECT FOR UPDATE` aparte, y un check-in que no deja pasar dos veces el mismo boleto.
- No usa la extensión pgcrypto (en Supabase vive en otro esquema); los tokens salen de `gen_random_uuid()`.

```sql
-- =====================================================================
-- JOLA Tickets · Esquema Supabase (PostgreSQL 15+)
-- Ejecutar completo en el SQL Editor de Supabase, una sola vez.
-- Sirve igual para la Versión A (FastAPI) y la Versión B (solo Next.js).
-- =====================================================================

-- ---------- 1. Tablas ----------
create table seats (
  id              serial primary key,
  row_label       char(1) not null check (row_label between 'A' and 'I'),
  seat_number     int     not null check (seat_number between 1 and 20),
  is_vip          boolean not null default false,
  price           numeric(10,2) not null,
  status          text    not null default 'available'
                  check (status in ('available','held','pending_review','sold','blocked')),
  held_until      timestamptz,
  order_id        uuid,
  unique (row_label, seat_number)
);

create table orders (
  id              uuid primary key default gen_random_uuid(),
  order_code      text unique not null,               -- JOLA-4F2A9C, va en la glosa
  access_token    text not null,                      -- secreto del comprador para esta orden
  buyer_name      text not null check (char_length(buyer_name) between 3 and 120),
  buyer_phone     text not null check (buyer_phone ~ '^[67][0-9]{7}$'),
  buyer_email     text not null check (buyer_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$'),
  seat_ids        int[] not null,
  total_amount    numeric(10,2) not null default 0,
  payment_method  text not null default 'qr' check (payment_method in ('qr','cash')),
  receipt_path    text,                               -- ruta en el bucket privado 'receipts'
  status          text not null default 'awaiting_payment'
                  check (status in ('awaiting_payment','pending_review','approved','rejected','cancelled')),
  expires_at      timestamptz not null,
  reject_reason   text,
  reviewed_by     text,
  reviewed_at     timestamptz,
  submitted_at    timestamptz,
  created_at      timestamptz not null default now()
);

alter table seats
  add constraint seats_order_fk foreign key (order_id) references orders(id) on delete set null;

create table tickets (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references orders(id) on delete cascade,
  seat_id         int  not null unique references seats(id) on delete restrict,  -- 1 boleto por asiento
  ticket_token    text not null unique,
  is_used         boolean not null default false,
  scanned_at      timestamptz,
  scanned_by      text,
  created_at      timestamptz not null default now()
);

create table admins (
  email           text primary key                    -- correos de la directiva con acceso al panel
);

create index orders_status_idx on orders (status, created_at desc);
create index seats_order_idx   on seats  (order_id);

-- ---------- 2. Las 180 butacas ----------
insert into seats (row_label, seat_number, is_vip, price)
select r, n, r in ('A','B'), case when r in ('A','B') then 50 else 30 end
from unnest(array['A','B','C','D','E','F','G','H','I']) as r,
     generate_series(1, 20) as n;

-- ---------- 3. Vista pública del mapa ----------
create view public_seat_map as
select id, row_label, seat_number, is_vip, price,
       case when status = 'available' or (status = 'held' and held_until < now())
            then 'available' else 'taken' end as status
from seats;

-- ---------- 4. Funciones (toda la lógica crítica, atómica) ----------
-- Errores que lanzan (el backend los traduce a HTTP):
--   INVALID_SEAT_COUNT 400 · SEAT_TAKEN 409 · ORDER_NOT_FOUND 404
--   ORDER_NOT_AWAITING_PAYMENT 409 · HOLD_EXPIRED 410 · ORDER_NOT_PENDING 409

-- 4.1 Retener asientos y crear la orden
create or replace function hold_seats(
  p_seat_ids int[], p_name text, p_phone text, p_email text)
returns table (order_id uuid, order_code text, access_token text, total_amount numeric, expires_at timestamptz)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_id    uuid;
  v_code  text;
  v_token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_until timestamptz := now() + interval '15 minutes';
  v_count int;
  v_total numeric;
begin
  if p_seat_ids is null or cardinality(p_seat_ids) not between 1 and 8
     or cardinality(p_seat_ids) <> (select count(distinct x) from unnest(p_seat_ids) x) then
    raise exception 'INVALID_SEAT_COUNT';
  end if;

  loop  -- código corto único; reintenta si choca (muy raro)
    v_code := 'JOLA-' || upper(substr(md5(gen_random_uuid()::text), 1, 6));
    exit when not exists (select 1 from orders o where o.order_code = v_code);
  end loop;

  insert into orders (order_code, access_token, buyer_name, buyer_phone, buyer_email,
                      seat_ids, expires_at)
  values (v_code, v_token, trim(p_name), p_phone, lower(trim(p_email)),
          p_seat_ids, v_until)
  returning id into v_id;

  -- Atómico: si otro comprador retiene la misma silla a la vez, Postgres
  -- espera su bloqueo, re-evalúa el WHERE y esta fila ya no coincide.
  update seats s
     set status = 'held', held_until = v_until, order_id = v_id
   where s.id = any(p_seat_ids)
     and (s.status = 'available' or (s.status = 'held' and s.held_until < now()));
  get diagnostics v_count = row_count;

  if v_count <> cardinality(p_seat_ids) then
    raise exception 'SEAT_TAKEN';           -- revierte también la orden creada arriba
  end if;

  select sum(s.price) into v_total from seats s where s.order_id = v_id;
  update orders o set total_amount = v_total where o.id = v_id;

  return query select v_id, v_code, v_token, v_total, v_until;
end $$;

-- 4.2 Liberar una retención (el comprador vuelve atrás)
create or replace function release_hold(p_order_id uuid, p_access_token text)
returns void language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
begin
  update orders set status = 'cancelled'
   where id = p_order_id and access_token = p_access_token and status = 'awaiting_payment';
  if not found then return; end if;
  update seats set status = 'available', held_until = null, order_id = null
   where order_id = p_order_id and status = 'held';
end $$;

-- 4.3 Registrar el comprobante subido
create or replace function submit_receipt(p_order_id uuid, p_access_token text, p_receipt_path text)
returns text language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_order orders%rowtype;
  v_count int;
begin
  select * into v_order from orders
   where id = p_order_id and access_token = p_access_token
   for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.status <> 'awaiting_payment' then raise exception 'ORDER_NOT_AWAITING_PAYMENT'; end if;
  if v_order.expires_at < now() then raise exception 'HOLD_EXPIRED'; end if;

  update seats set status = 'pending_review', held_until = null
   where order_id = p_order_id and status = 'held';
  get diagnostics v_count = row_count;
  if v_count <> cardinality(v_order.seat_ids) then
    raise exception 'HOLD_EXPIRED';
  end if;

  update orders
     set status = 'pending_review', receipt_path = p_receipt_path, submitted_at = now()
   where id = p_order_id;
  return v_order.order_code;
end $$;

-- 4.4 Aprobar: vende los asientos y emite un boleto por asiento
create or replace function approve_order(p_order_id uuid, p_admin text)
returns table (ticket_token text, row_label text, seat_number int)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
begin
  update orders set status = 'approved', reviewed_by = p_admin, reviewed_at = now()
   where id = p_order_id and status = 'pending_review';
  if not found then raise exception 'ORDER_NOT_PENDING'; end if;

  update seats set status = 'sold'
   where order_id = p_order_id and status = 'pending_review';

  insert into tickets (order_id, seat_id, ticket_token)
  select p_order_id, s.id,
         replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
    from seats s
   where s.order_id = p_order_id and s.status = 'sold';

  return query
  select t.ticket_token, s.row_label::text, s.seat_number
    from tickets t join seats s on s.id = t.seat_id
   where t.order_id = p_order_id
   order by s.row_label, s.seat_number;
end $$;

-- 4.5 Rechazar: libera los asientos y guarda el motivo
create or replace function reject_order(p_order_id uuid, p_admin text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
begin
  update orders
     set status = 'rejected', reject_reason = p_reason, reviewed_by = p_admin, reviewed_at = now()
   where id = p_order_id and status = 'pending_review';
  if not found then raise exception 'ORDER_NOT_PENDING'; end if;

  update seats set status = 'available', held_until = null, order_id = null
   where order_id = p_order_id;
end $$;

-- 4.6 Check-in en la puerta: cada boleto entra una sola vez
--   result = 'OK' | 'ALREADY_USED' · sin filas = boleto inexistente
create or replace function check_in(p_token text, p_admin text)
returns table (result text, buyer_name text, row_label text, seat_number int, scanned_at timestamptz)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare v_id uuid;
begin
  update tickets set is_used = true, scanned_at = now(), scanned_by = p_admin
   where ticket_token = p_token and is_used = false
  returning id into v_id;

  return query
  select case when v_id is not null then 'OK' else 'ALREADY_USED' end,
         o.buyer_name, s.row_label::text, s.seat_number, t.scanned_at
    from tickets t
    join orders o on o.id = t.order_id
    join seats  s on s.id = t.seat_id
   where t.ticket_token = p_token;
end $$;

-- 4.7 Bloquear o desbloquear asientos (profesores, invitados)
create or replace function set_seats_blocked(p_seat_ids int[], p_blocked boolean)
returns int language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  if p_blocked then
    update seats set status = 'blocked', held_until = null, order_id = null
     where id = any(p_seat_ids)
       and (status = 'available' or (status = 'held' and held_until < now()));
  else
    update seats set status = 'available'
     where id = any(p_seat_ids) and status = 'blocked';
  end if;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- ---------- 5. Seguridad ----------
-- Nadie accede desde el navegador: solo el servidor con la llave service_role
-- (Versión B) o la conexión de base de datos (Versión A).
alter table seats   enable row level security;
alter table orders  enable row level security;
alter table tickets enable row level security;
alter table admins  enable row level security;

revoke all on seats, orders, tickets, admins, public_seat_map from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
grant  execute on all functions in schema public to service_role;
grant  select  on public_seat_map to service_role;

-- ---------- 6. Datos iniciales ----------
-- insert into admins (email) values ('directora@jola.edu.bo'), ('tesoreria@jola.edu.bo');
-- Storage: crear el bucket 'receipts' como PRIVADO desde el panel (Storage > New bucket).
-- Auth: desactivar "Allow new users to sign up" y crear a mano las cuentas de la directiva.
```

Un celular o correo inválido que llegue a la base viola un `CHECK` (código Postgres `23514`): el backend lo traduce a 400 `INVALID_DATA`, aunque lo normal es validarlo antes.

## Contrato de la API (igual en ambas versiones)

El frontend solo conoce estas rutas, con el prefijo `/api/v1`. En la Versión A las sirve FastAPI; en la Versión B, los Route Handlers de Next.js. Las respuestas JSON son idénticas, así que cambiar de versión es cambiar una variable de entorno.

### Comprador (público)

| Método | Ruta | Envía | Responde | Función SQL |
| --- | --- | --- | --- | --- |
| GET | `/seats` | — | `[{id, row, number, price, vip, status}]`, `status` = `available` o `taken` | vista `public_seat_map` |
| POST | `/holds` | `{seat_ids, buyer: {name, phone, email}}` | `{order_id, order_code, access_token, total, expires_at}` | `hold_seats` |
| DELETE | `/holds/{order_id}` | cabecera `X-Order-Token` | `204` | `release_hold` |
| POST | `/orders/{order_id}/receipt` | `multipart/form-data` con `file` + `X-Order-Token` | `{order_code, status: "pending_review"}` | sube a Storage y llama `submit_receipt` |
| GET | `/orders/{order_id}` | `X-Order-Token` | `{order_code, status, total, seats, reject_reason, tickets?}` | lectura directa |
| GET | `/tickets/{token}` | — | `{buyer_name, row, number, is_used, event}` | lectura directa |
| GET | `/tickets/{token}/qr.png` | — | imagen PNG del QR (para el correo) | lectura directa |

### Directiva (requiere `Authorization: Bearer <JWT de Supabase Auth>` y correo en la tabla `admins`)

| Método | Ruta | Envía | Responde | Función SQL |
| --- | --- | --- | --- | --- |
| GET | `/admin/orders?status=pending_review` | — | lista con `receipt_url` firmada por 10 min | lectura directa |
| POST | `/admin/orders/{id}/approve` | — | `{tickets: [...], email_sent}` y envía el correo con EmailJS | `approve_order` |
| POST | `/admin/orders/{id}/reject` | `{reason}` | `{email_sent}` y envía el correo de rechazo | `reject_order` |
| POST | `/admin/orders/{id}/resend` | — | `{email_sent}`; reenvía el correo de una orden aprobada | lectura directa |
| POST | `/admin/check-in` | `{token}` | `{result, buyer_name, row, number, scanned_at}` | `check_in` |
| POST | `/admin/seats/block` | `{seat_ids, blocked}` | `{changed}` | `set_seats_blocked` |
| GET | `/admin/seats` | — | `[{id, row, number, vip, status, order_code?}]`, `status` = `available`, `held`, `pending_review`, `sold` o `blocked` (vista detallada solo para la directiva) | lectura directa |
| GET | `/admin/stats` | — | vendidos, en revisión, recaudado | lectura directa |

### Errores

Todas las respuestas de error tienen la forma `{"error": "<CÓDIGO>", "message": "<texto para el usuario>"}`.

| Código | HTTP | Qué muestra el frontend |
| --- | --- | --- |
| `INVALID_DATA` / `INVALID_SEAT_COUNT` | 400 | El campo marcado o "Elige entre 1 y 8 asientos" |
| `UNAUTHORIZED` | 401 / 403 | Vuelve al login de la directiva |
| `ORDER_NOT_FOUND` | 404 | "No encontramos tu orden" |
| `SEAT_TAKEN` | 409 | "Alguien acaba de tomar uno de tus asientos", recarga el mapa |
| `ORDER_NOT_AWAITING_PAYMENT` / `ORDER_NOT_PENDING` | 409 | "Esta orden ya fue procesada" |
| `HOLD_EXPIRED` | 410 | "Se acabó el tiempo de reserva", vuelve al mapa |
| `FILE_TOO_LARGE` / `FILE_TYPE` | 413 / 415 | "Sube una imagen o PDF de máximo 4 MB" |

### Contenido del QR del boleto

El QR contiene la URL completa `https://<dominio>/tickets/<token>`. Escaneado con la cámara normal abre el boleto; escaneado desde `/admin/checkin`, la app extrae el token y llama a `/admin/check-in`.

## Correos con EmailJS

Los correos se envían con EmailJS, **siempre desde el servidor** (FastAPI o la ruta de Next.js), al aprobar y al rechazar una orden. Las plantillas se diseñan en el editor visual de EmailJS con el logo y los colores de JOLA, sin escribir HTML de correo en el código. Si el volumen crece, el colegio puede pasar a un plan pago.

### Límites del plan gratuito

| Límite | Valor | Para JOLA |
| --- | --- | --- |
| Envíos por mes | 200 | Un correo por orden: unas 70 u 80 órdenes más rechazos alcanzan |
| Plantillas | 2 | Justo las necesarias: aprobado y rechazado |
| Tamaño por envío | 50 KB | Sobra: el correo lleva enlaces, no archivos |
| Adjuntos | No incluidos | El QR va como imagen desde una URL propia |
| Velocidad | 1 envío por segundo | Suficiente: se aprueba de a una orden |
| Historial | 7 días | Revisar envíos fallidos dentro de la semana |
| Plan pago | Personal US$9/mes | Solo si se necesitan más envíos o plantillas |

Fuentes: [precios de EmailJS](https://www.emailjs.com/pricing/), [API REST de envío](https://emailjs.com/docs/rest-api/send), [SDK para Node.js](https://npmjs.com/package/@emailjs/nodejs).

### Configuración (una sola vez)

1. Crear la cuenta de EmailJS con el correo del colegio.
2. En **Email Services**, agregar Gmail y conectar la cuenta del colegio. Se autoriza con el inicio de sesión de Google; no hace falta contraseña de aplicación. Copiar el **Service ID**.
3. En **Email Templates**, crear `boleto_aprobado` y `orden_rechazada`. En el campo *To Email* poner `{{to_email}}`, como remitente "JOLA · Festival de Talentos" y como *Reply To* el correo de la directiva.
4. En **Account → Security**, activar las peticiones de API para aplicaciones fuera del navegador. Sin eso, EmailJS rechaza los envíos desde el servidor.
5. Copiar la **Public Key** y la **Private Key** a las variables de entorno del servidor. La privada nunca va al frontend.

### Variables de las plantillas

- **boleto\_aprobado:** `to_email`, `to_name`, `order_code`, `seats` ("A1, A2, C5"), `total` ("Bs 130"), `event_date` ("Viernes 21 de noviembre, 19:00"), `event_place`, `order_url` y `tickets_html`.
- **orden\_rechazada:** `to_email`, `to_name`, `order_code`, `reason` y `retry_url` (vuelve al inicio para comprar de nuevo).

`tickets_html` es un bloque con un QR y un enlace por boleto, y se inserta en la plantilla con llaves triples, `{{{tickets_html}}}`, para que EmailJS lo muestre como HTML. Con 8 boletos pesa unos 2 KB:

```html
<div style="margin:16px 0;text-align:center">
  <img src="https://<dominio>/api/v1/tickets/<token>/qr.png" width="180" height="180" alt="QR del asiento A1">
  <p>Asiento A1 · <a href="https://<dominio>/tickets/<token>">Ver mi boleto</a></p>
</div>
```

El enlace "Ver mi boleto" va siempre junto al QR, porque algunos programas de correo bloquean las imágenes hasta que el usuario las permite.

### Envío desde el servidor

Versión A (`services/email_service.py`, con `httpx`):

```python
import httpx
from app.core.config import settings

EMAILJS_URL = "https://api.emailjs.com/api/v1.0/email/send"

def send_template(template_id: str, params: dict) -> None:
    r = httpx.post(EMAILJS_URL, timeout=15, json={
        "service_id": settings.EMAILJS_SERVICE_ID,
        "template_id": template_id,
        "user_id": settings.EMAILJS_PUBLIC_KEY,
        "accessToken": settings.EMAILJS_PRIVATE_KEY,
        "template_params": params,
    })
    r.raise_for_status()   # 200 = "OK"; un error trae el motivo en el texto
```

Versión B (`server/email.js`, con `@emailjs/nodejs`):

```js
import 'server-only';
import emailjs from '@emailjs/nodejs';

export function sendTemplate(templateId, params) {
  return emailjs.send(process.env.EMAILJS_SERVICE_ID, templateId, params, {
    publicKey: process.env.EMAILJS_PUBLIC_KEY,
    privateKey: process.env.EMAILJS_PRIVATE_KEY,
  });
}
```

### Reglas del envío

- **Un correo fallido no deshace la aprobación.** La orden queda aprobada y el panel muestra el error con un botón *Reenviar correo* (`POST /admin/orders/{id}/resend`).
- **Imagen del QR:** la genera el propio servidor en `GET /tickets/{token}/qr.png`, nunca un servicio externo, para no entregar el token a terceros.
- **Respaldo sin EmailJS:** si algún día se cambia a Gmail por SMTP, la cuenta necesita la verificación en 2 pasos activada para generar una contraseña de aplicación de 16 caracteres; Gmail ya no acepta la contraseña normal.

## Frontend compartido (Next.js)

El frontend es el mismo código en las dos versiones: Next.js 15 con App Router, JavaScript, pnpm y Tailwind CSS v4, partiendo del prototipo `jola-asientos.html`. Toda llamada al servidor pasa por `services/api.js`; ningún componente usa `fetch` directo.

```
frontend/
├── public/images/
│   ├── logo-jola.png
│   └── qr-pago.png                     # QR estático de la cuenta del colegio
├── src/
│   ├── app/
│   │   ├── layout.jsx                  # fuentes, ThemeProvider, ToastProvider
│   │   ├── globals.css                 # tokens claro/oscuro + @theme + keyframes
│   │   ├── page.jsx                    # PurchaseProvider + paso actual (?paso=datos|asientos|pago|revision)
│   │   ├── orden/[orderId]/page.jsx    # estado de la orden (lee ?k=access_token)
│   │   ├── tickets/[token]/page.jsx    # boleto digital permanente
│   │   └── admin/
│   │       ├── login/page.jsx
│   │       ├── page.jsx                # órdenes en revisión: ver comprobante, aprobar, rechazar
│   │       ├── asientos/page.jsx       # bloquear sillas, ver ocupación (reusa SeatGrid)
│   │       └── checkin/page.jsx        # escáner de cámara para la puerta
│   ├── components/
│   │   ├── brand/   Logo.jsx, Rays.jsx
│   │   ├── layout/  Topbar.jsx (incluye el botón de tema), Stepper.jsx
│   │   └── ui/      Button.jsx (variantes, ícono y estado de carga), Field.jsx,
│   │            Modal.jsx, ToastProvider.jsx (incluye aria-live),
│   │            AnimatedNumber.jsx, Reveal.jsx, Confetti.jsx, icons.jsx
│   ├── context/
│   │   └── PurchaseContext.jsx         # useReducer + usePurchase(): paso, comprador, selección, orden
│   ├── features/
│   │   ├── home/       Hero.jsx, Countdown.jsx, BuyerForm.jsx
│   │   ├── seat-map/   SeatMap.jsx, SeatGrid.jsx, Seat.jsx, MapDock.jsx,
│   │   │               BookingSummary.jsx, EventCard.jsx
│   │   │   └── hooks/  useSeats.js, useMapZoom.js, useRovingGrid.js
│   │   ├── checkout/   PaymentStep.jsx, ReceiptUpload.jsx, HoldTimer.jsx
│   │   │   └── hooks/  useHold.js, useHoldTimer.js
│   │   ├── order/      OrderStatus.jsx
│   │   ├── ticket/     TicketCard.jsx
│   │   └── admin/      OrderList.jsx, RejectDialog.jsx, QrScanner.jsx
│   │       └── hooks/  useAdmin.js         # sesión de la directiva + órdenes
│   ├── hooks/
│   │   └── useCountdown.js            # lo usan el inicio y el boleto
│   ├── services/
│   │   ├── api.js                     # único punto de contacto con /api/v1
│   │   └── supabaseBrowser.js         # SOLO para el login de la directiva (llave anon)
│   └── lib/
│       ├── validators.js              # mismas reglas que el SQL
│       ├── compressImage.js           # reduce la captura a menos de 2 MB
│       ├── feedback.js                # vibración y animaciones que respetan movimiento reducido
│       └── event.js                   # nombre, fecha, lugar, precios, filas y máximo por compra
├── package.json
└── jsconfig.json                      # alias @/ → src/
```

Son unos 30 componentes y 8 hooks; cada archivo tiene un motivo concreto para existir (ver la regla en "Del prototipo HTML a componentes").

### Decisiones del frontend

- **Estado del comprador:** los datos del formulario y la orden en curso (`order_id`, `access_token`, `expires_at`) se guardan en `sessionStorage`, para que un refresco no pierda la compra.
- **Temporizador:** se calcula desde el `expires_at` que devuelve el servidor, no desde el reloj del navegador al hacer clic.
- **Error 409 al retener:** muestra un aviso, recarga el mapa y deja seleccionados solo los asientos que siguen libres.
- **Estilos:** Tailwind v4 se configura en `globals.css` con `@theme`; no hace falta `tailwind.config.js`. El modo oscuro usa la variante `dark:` con la clase en `<html>`.
- **Dependencias:** `qrcode.react` para mostrar el QR del boleto, `qr-scanner` para el escáner de la puerta (necesita HTTPS) y `@supabase/supabase-js` solo para el login de la directiva.
- **Componentes de cliente:** el mapa, el formulario y el escáner llevan `"use client"`; la página del boleto puede renderizarse en el servidor.

## Del prototipo HTML a componentes

El archivo `jola-asientos.html` es la referencia visual y de comportamiento: cada parte se convierte en un componente con una sola responsabilidad, y todo el JavaScript suelto pasa a hooks y a un estado central. Las animaciones, el modo oscuro y la accesibilidad se conservan tal cual.

### Principios de separación

1. **Tres capas de componentes.** `components/ui` son piezas genéricas sin lógica de negocio (Button, Field, Modal). `components/layout` es el marco de la app (Topbar, Stepper). `features/*` son las piezas del negocio (mapa, pago, boleto), que usan las otras dos capas.
2. **Cada feature se organiza en su propia carpeta.** Sus hooks propios viven en `features/<feature>/hooks/`; solo los hooks reutilizables van en `src/hooks/`.
3. **Los componentes visuales no llaman a la API.** Reciben datos por props; las llamadas viven en hooks (`useSeats`, `useHold`) que usan `services/api.js`.
4. **Un archivo propio solo si hay motivo.** Un componente se separa si se reutiliza en más de un lugar, si tiene estado o lógica propia, si pasa de unas 150 a 200 líneas, o si hay una razón técnica (como `Seat`, que va aparte para usar `React.memo` en 180 botones). Si no, es una función interna del componente padre, en el mismo archivo. Nombres en PascalCase, exportación por defecto y props documentadas con JSDoc.
5. **`"use client"` solo donde hace falta:** formulario, mapa, temporizadores, escáner y tema. Las páginas y las piezas estáticas quedan como componentes de servidor.
6. **Los datos falsos del prototipo se eliminan:** las sillas ocupadas al azar (23 %), el QR generado al azar y el pago simulado. Todo eso viene de la API.

### Qué parte del HTML va a qué archivo

| Parte del prototipo | Archivo de destino | Qué incluye adentro |
| --- | --- | --- |
| `header.topbar`, `#backBtn`, `#themeBtn` | `components/layout/Topbar.jsx` | Logo, volver y botón de tema |
| Logo y rayos SVG | `components/brand/Logo.jsx`, `Rays.jsx` | Se reutilizan en topbar, hero, escenario y boleto |
| `#steps` | `components/layout/Stepper.jsx` | Props: `steps`, `current`; marca los completos con ✓ |
| `.hero` completo (fondo, focos, partículas, logo, título, `.hero-info`) | `features/home/Hero.jsx` | El fondo y las partículas son funciones internas, con `aria-hidden` y sin partículas si hay movimiento reducido; textos desde `lib/event.js` |
| `#countdown` | `features/home/Countdown.jsx` | Usa `useCountdown(target)` |
| `#buyerForm` | `features/home/BuyerForm.jsx` | Solo nombre, celular y correo con `ui/Field`; reglas en `lib/validators.js`. El "Vengo como" del prototipo se eliminó |
| `.map-head`, `.legend`, `.stage-wrap` | `features/seat-map/SeatMap.jsx` | Encabezado con saludo y conteo, leyenda, escenario y el contenedor del mapa |
| `#grid` (letras de fila, franja preferencial, `#tip`) | `features/seat-map/SeatGrid.jsx` | Teclado con `useRovingGrid`, un solo `onClick` por delegación, tooltip solo en PC |
| Cada silla | `features/seat-map/Seat.jsx` | Separado para usar `React.memo` |
| `.dock` (`#minimap`, `#zoomIn`, `#zoomOut`) | `features/seat-map/MapDock.jsx` | Minimapa y zoom; lógica en `useMapZoom` |
| `.summary` y `.help` | `features/seat-map/BookingSummary.jsx` | Chips de asientos, desglose, total animado, botón de pago y la ayuda en PC; barra fija en celular, panel lateral en PC |
| `#timer` | `features/checkout/HoldTimer.jsx` | Se usa en el resumen y en el pago |
| `.event.reveal` | `features/seat-map/EventCard.jsx` + `ui/Reveal.jsx` | `Reveal` envuelve cualquier bloque que aparece al hacer scroll |
| `#dlg` → `#review` | `features/checkout/PaymentStep.jsx`, `ReceiptUpload.jsx` | Deja de ser una simulación: QR del banco, total, código para la glosa y subida del comprobante |
| `#dlg` → `#done` (boleto) | `features/ticket/TicketCard.jsx` | Incluye el QR con `qrcode.react` y la URL real del boleto |
| `#toast`, `#live` | `components/ui/ToastProvider.jsx` | Expone `useToast()` y `useAnnounce()` |
| `#confetti` | `components/ui/Confetti.jsx` | Se dispara cuando la orden queda aprobada |

### Estado central del flujo de compra

Las variables sueltas del prototipo (`selected`, `buyer`, `deadline`, la pantalla visible) pasan a un solo `PurchaseProvider` en `src/context/PurchaseContext.jsx`, con `useReducer`. Ningún componente guarda por su cuenta datos de la compra.

```js
// estado
{ step: 'datos' | 'asientos' | 'pago' | 'revision',
  buyer: { name, phone, email } | null,
  selected: [seatId, ...],                       // máximo 8
  order: { order_id, order_code, access_token, total, expires_at } | null }

// acciones
SET_BUYER · TOGGLE_SEAT · CLEAR_SELECTION · HOLD_CREATED · HOLD_RELEASED
HOLD_EXPIRED · RECEIPT_SUBMITTED · RESET
```

- **Persistencia ante una recarga:** la orden en curso (`order_id`, `access_token`, `expires_at`) y la selección se guardan en `sessionStorage`; los datos del comprador, en `localStorage` con la clave `jola-buyer`. Si un padre recarga la pestaña por error en el celular durante los 15 minutos, no pierde los asientos ni vuelve a llenar sus datos.
- **Al recuperar una orden guardada:** si `expires_at` ya pasó, se borra y se vuelve al mapa con el aviso "Se acabó el tiempo de reserva"; si sigue vigente, se retoma en el paso de pago.
- **Otra pestaña u otro dispositivo:** `sessionStorage` no se comparte entre pestañas. Por eso, después de subir el comprobante, la app muestra y guarda el enlace `/orden/{order_id}?k={access_token}` para consultar el estado desde donde sea.
- **Paso en la URL:** `/?paso=asientos` con `useRouter` y `useSearchParams`, para que el botón atrás del celular funcione igual que en el prototipo. Si no hay comprador, cualquier paso vuelve a `datos`.

### Tokens y animaciones en Tailwind v4

Los colores del prototipo pasan a variables CSS con modo claro y oscuro, y se exponen como clases de Tailwind (`bg-surface`, `text-ink`, `border-line`, `animate-rise`…). El tema se maneja con `next-themes` (`attribute="class"`), que también evita el parpadeo al cargar.

```css
@import "tailwindcss";
@custom-variant dark (&:where(.dark, .dark *));

:root {
  --bg: #F4F7FB; --surface: #FFFFFF; --surface-2: #F1F5FA; --surface-3: #E6EDF6;
  --ink: #0B1B48; --muted: #56638A; --line: #E0E7F1;
  --primary: #0A1F5C; --on-primary: #FFFFFF; --sel: #7FD6E6; --on-sel: #0A1F5C;
}
.dark {
  --bg: #060D22; --surface: #0C1631; --surface-2: #111D3C; --surface-3: #18264A;
  --ink: #EAF0FF; --muted: #9AA8CB; --line: #1D2B50;
  --primary: #7FD6E6; --on-primary: #061233; --sel: #7FD6E6; --on-sel: #061233;
}

@theme inline {
  --color-bg: var(--bg);  --color-surface: var(--surface);
  --color-surface-2: var(--surface-2);  --color-surface-3: var(--surface-3);
  --color-ink: var(--ink);  --color-muted: var(--muted);  --color-line: var(--line);
  --color-primary: var(--primary);  --color-on-primary: var(--on-primary);
  --color-sel: var(--sel);  --color-on-sel: var(--on-sel);
  --font-sans: var(--font-urbanist);  --font-brand: var(--font-fredoka);
}

@theme {
  --color-navy: #0A1F5C;  --color-cyan: #7FD6E6;  --color-cyan-strong: #2BB3CC;
  --radius-card: 22px;
  --animate-rise: rise .5s ease both;
  --animate-seat-in: seat-in .55s cubic-bezier(.3,1.45,.5,1) backwards;
  @keyframes rise { from { opacity: 0; transform: translateY(10px); } }
  @keyframes seat-in { from { opacity: 0; transform: translateY(-14px) scale(.4); } }
}
```

Las fuentes se cargan con `next/font/google` (Fredoka y Urbanist) en `layout.jsx`, con las variables `--font-fredoka` y `--font-urbanist`. Los retrasos escalonados del prototipo (la ola de sillas, las etiquetas del hero) se pasan como variables por `style` (`--r`, `--i`, `--d`) y se usan con `[animation-delay:calc(var(--d)*80ms)]`.

### Del JavaScript del prototipo a hooks

| Función del prototipo | Destino | Qué expone |
| --- | --- | --- |
| `renderCountdown` | `hooks/useCountdown.js` | `{ days, hours, minutes, seconds, done }` |
| `toggle`, `total`, `update`, `clearSelection` | `PurchaseContext` → `usePurchase()` | `selected`, `toggleSeat(id)`, `clearSelection()`, `subtotal` (solo informativo) |
| `showSeats`, `showHome`, `popstate` | `PurchaseContext` → `usePurchase()` | `step`, `goTo(step)` sincronizado con `?paso=` |
| `computeZooms`, `applyZoom`, `syncWindow`, `jumpTo`, `paintMinimap` | `features/seat-map/hooks/useMapZoom.js` | `zoom`, `zoomIn`, `zoomOut`, `canZoomIn`, `canZoomOut`, `overflows`, posición del visor y `jumpTo(x)` |
| `setFocus` + teclado de la grilla | `features/seat-map/hooks/useRovingGrid.js` | fila y columna con foco, `onKeyDown` |
| `fetch` simulado del mapa | `features/seat-map/hooks/useSeats.js` | `seats`, `loading`, `refresh()`; se actualiza cada 15 s |
| `toggle` → "Continuar al pago" | `features/checkout/hooks/useHold.js` | `createHold()`, `releaseHold()`, `submitReceipt(file)` |
| `handleTimer`, `renderTimer` | `features/checkout/hooks/useHoldTimer.js` | `remaining`, `isWarning`, llama a `onExpire` |
| sesión y lista del panel | `features/admin/hooks/useAdmin.js` | `session`, `orders`, `approve(id)`, `reject(id, reason)`, `resend(id)` |
| `countTo`, `countFree` | `components/ui/AnimatedNumber.jsx` | número que cuenta hasta su valor |
| `check`, `rules` | `lib/validators.js` | `validateName`, `validatePhone`, `validateEmail`, `formatPhone` |
| `toast`, `announce` | `components/ui/ToastProvider.jsx` | `useToast()`, `useAnnounce()` |
| `isDark`, `themeBtn` | `next-themes` + `Topbar.jsx` | `theme`, `setTheme` |
| `IntersectionObserver` de `.reveal` | `components/ui/Reveal.jsx` | envuelve bloques que aparecen al hacer scroll |
| `setSumH` (`ResizeObserver`) | dentro de `BookingSummary.jsx` | publica la altura de la barra en `--sum-h` para ubicar el widget del mapa |
| `anim`, `shake`, `vibrate` | `lib/feedback.js` | respetan `prefers-reduced-motion` |
| `buildQR` (falso) | se elimina | `qrcode.react` dentro de `TicketCard` |

### Accesibilidad que no se puede perder

- Cada silla es un `<button>` con `aria-pressed` y un `aria-label` completo ("Fila C, asiento 7, general, Bs 30").
- Navegación con flechas dentro de la grilla y un solo elemento enfocable a la vez (`tabIndex` móvil).
- Anuncios por `aria-live` al elegir o liberar una silla y al cambiar de paso; el foco pasa al título de cada paso.
- Las ocupadas se distinguen por el rayado, no solo por el color.
- Todas las animaciones se apagan con `prefers-reduced-motion`.
- El pago usa `<dialog>` nativo, que encierra el foco y se cierra con Escape.

### Orden de migración

1. Tokens, fuentes, `layout.jsx`, tema y componentes `ui/` básicos.
2. Pantalla de inicio: `Hero`, `Countdown`, `BuyerForm`.
3. Mapa estático con datos simulados: `SeatMap`, `SeatGrid`, `Seat`.
4. Interacción del mapa: selección, teclado y tooltip en `SeatGrid`; zoom y minimapa en `MapDock` con `useMapZoom`.
5. `PurchaseContext`, `BookingSummary` y paso en la URL.
6. Conexión a la API real (`useSeats`, `useHold`) en lugar de los datos simulados.
7. Pago, comprobante, estado de la orden, boleto y panel `/admin`.

**Criterio de terminado de cada pieza:** se ve y se comporta igual que en el prototipo en modo claro y oscuro, a 360 px y a 1366 px de ancho, y funciona con teclado.

## Versión A: Next.js + FastAPI + Supabase

FastAPI expone el contrato `/api/v1` y se conecta a Supabase con SQLAlchemy 2. Como la lógica está en las funciones SQL, cada endpoint valida, llama a una función y traduce el resultado: los routers quedan cortos y fáciles de revisar.

```
backend/
├── app/
│   ├── main.py                  # FastAPI(), CORS solo para FRONTEND_URL, registra routers
│   ├── core/
│   │   ├── config.py            # pydantic-settings lee el .env
│   │   ├── database.py          # engine + get_db() con el pooler de Supabase
│   │   ├── security.py          # require_admin(): valida el JWT y revisa la tabla admins
│   │   ├── storage.py           # subir comprobante y firmar URLs (bucket privado)
│   │   └── errors.py            # códigos SQL (SEAT_TAKEN…) → HTTP + {error, message}
│   ├── models.py                # SQLAlchemy: Seat, Order, Ticket, Admin (solo lecturas)
│   ├── modules/
│   │   ├── seats/    router.py, schemas.py      # GET /seats
│   │   ├── orders/   router.py, schemas.py      # /holds, /orders/{id}, /orders/{id}/receipt
│   │   ├── tickets/  router.py, schemas.py      # GET /tickets/{token}
│   │   └── admin/    router.py, schemas.py      # órdenes, aprobar, rechazar, check-in, bloquear, stats
│   └── services/
│       ├── email_service.py     # EmailJS por API REST con llave privada: aprobado y rechazo
│       └── qr_service.py        # PNG del QR que sirve GET /tickets/{token}/qr.png
├── requirements.txt
├── .env.example
└── Procfile                     # web: uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

**requirements.txt:** `fastapi`, `uvicorn[standard]`, `sqlalchemy>=2`, `psycopg[binary]`, `pydantic-settings`, `email-validator`, `python-multipart`, `supabase`, `qrcode[pil]`, `httpx` (para llamar a EmailJS).

### Piezas clave

Conexión a Supabase (`core/database.py`). **Importante para quien arme el backend:** usar la cadena del *Connection Pooler* en modo sesión, la que incluye `pooler.supabase.com:5432` (en el panel: *Connect → Session pooler*). La conexión directa (`db.<ref>.supabase.co`) funciona solo por IPv6 y falla en muchas redes y servicios de hosting que solo tienen IPv4, con errores como "Network is unreachable" o "could not translate host name".

```python
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

# postgresql+psycopg://postgres.<ref>:<clave>@aws-0-<region>.pooler.supabase.com:5432/postgres
engine = create_engine(settings.DATABASE_URL, pool_size=5, max_overflow=5, pool_pre_ping=True)
# Si usas el pooler en modo transacción (puerto 6543): poolclass=NullPool,
# connect_args={"prepare_threshold": None}
SessionLocal = sessionmaker(bind=engine, autoflush=False)

def get_db():
    with SessionLocal() as db:
        yield db
```

Retener asientos (`modules/orders/router.py`): llama a la función SQL y traduce el error.

```python
@router.post("/holds", response_model=HoldOut)
def create_hold(body: HoldIn, db: Session = Depends(get_db)):
    try:
        row = db.execute(
            text("select * from hold_seats(:ids, :name, :phone, :email)"),
            {"ids": body.seat_ids, "name": body.buyer.name, "phone": body.buyer.phone,
             "email": body.buyer.email},
        ).mappings().one()
        db.commit()
        return row
    except DBAPIError as e:
        db.rollback()
        raise http_error_from_db(e)   # SEAT_TAKEN → 409, INVALID_SEAT_COUNT → 400…
```

Administradores (`core/security.py`): la forma más simple y compatible con cualquier tipo de llave de Supabase es pedirle a Supabase Auth que valide el token, y luego revisar la tabla `admins`.

```python
def require_admin(authorization: str = Header(...), db: Session = Depends(get_db)) -> str:
    token = authorization.removeprefix("Bearer ").strip()
    try:
        user = supabase_admin.auth.get_user(token).user
    except Exception:
        raise HTTPException(401, {"error": "UNAUTHORIZED", "message": "Inicia sesión"})
    if not db.execute(text("select 1 from admins where email = :e"), {"e": user.email}).first():
        raise HTTPException(403, {"error": "UNAUTHORIZED", "message": "Sin acceso"})
    return user.email
```

Comprobante: FastAPI recibe el archivo (`UploadFile`), valida tipo y tamaño, lo sube a `receipts/{order_id}/{uuid}.{ext}` con la llave service\_role y llama a `submit_receipt`. Si la función falla, borra el archivo subido.

Correo al aprobar: `approve_order` devuelve los tokens y el endpoint arma `tickets_html` con las URLs del QR y del boleto. Después llama a `send_template("boleto_aprobado", ...)` con `BackgroundTasks`, para responder enseguida. Si EmailJS falla, la orden sigue aprobada y el panel ofrece *Reenviar correo* (ver la sección de correos con EmailJS).

### Variables de entorno

| Variable | Dónde | Ejemplo |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | frontend | `https://jola-api.up.railway.app/api/v1` |
| `NEXT_PUBLIC_SUPABASE_URL` | frontend | `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | frontend | llave anon (solo para el login) |
| `DATABASE_URL` | backend | `postgresql+psycopg://postgres.<ref>:<clave>@aws-0-<región>.pooler.supabase.com:5432/postgres` |
| `SUPABASE_URL` | backend | `https://<ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | backend | nunca en el frontend |
| `FRONTEND_URL` | backend | `https://entradas.jola.edu.bo` (CORS y enlaces del correo) |
| `EMAILJS_SERVICE_ID` | backend | ID del servicio Gmail conectado |
| `EMAILJS_TEMPLATE_APPROVED` / `EMAILJS_TEMPLATE_REJECTED` | backend | `boleto_aprobado` / `orden_rechazada` |
| `EMAILJS_PUBLIC_KEY` / `EMAILJS_PRIVATE_KEY` | backend | la privada nunca en el frontend |

### Despliegue

- **Frontend:** Vercel, plan gratuito.
- **Backend:** Railway o Fly.io. Evitar el plan gratuito de Render: se duerme y la primera petición tarda 30 a 50 segundos.
- **Base de datos:** Supabase, plan gratuito. Se pausa tras 7 días sin uso, algo que no ocurre durante las ventas.
- **Reparto de trabajo:** el compañero arma el backend contra el contrato y tú el frontend en paralelo; mientras el backend no esté, el frontend puede usar respuestas simuladas con la misma forma.

## Versión B: Next.js + Supabase

La misma API vive en `src/app/api/v1/` como Route Handlers, que corren en el servidor de Vercel. Hablan con Supabase usando `@supabase/supabase-js` y la llave service\_role, que nunca llega al navegador. Al frontend de la sección anterior solo se le agregan estas carpetas:

```
frontend/src/
├── app/api/v1/
│   ├── seats/route.js                      # GET
│   ├── holds/route.js                      # POST
│   ├── holds/[orderId]/route.js            # DELETE
│   ├── orders/[orderId]/route.js           # GET
│   ├── orders/[orderId]/receipt/route.js   # POST (multipart)
│   ├── tickets/[token]/route.js            # GET
│   ├── tickets/[token]/qr.png/route.js     # GET imagen PNG del QR
│   └── admin/
│       ├── orders/route.js                 # GET
│       ├── orders/[id]/approve/route.js    # POST
│       ├── orders/[id]/reject/route.js     # POST
│       ├── orders/[id]/resend/route.js     # POST reenviar correo
│       ├── check-in/route.js               # POST
│       ├── seats/block/route.js            # POST
│       └── stats/route.js                  # GET
└── server/                                 # cada archivo empieza con import 'server-only'
    ├── supabaseAdmin.js                    # cliente con SUPABASE_SERVICE_ROLE_KEY
    ├── auth.js                             # requireAdmin(request)
    ├── errors.js                           # códigos SQL → Response con {error, message}
    ├── validate.js                         # reusa lib/validators.js
    ├── email.js                            # EmailJS (@emailjs/nodejs) con llave privada
    └── qr.js                               # PNG del QR para /tickets/{token}/qr.png (paquete qrcode)
```

**Dependencias extra:** `@supabase/supabase-js`, `server-only`, `@emailjs/nodejs`, `qrcode`.

### Piezas clave

Cliente de servidor (`server/supabaseAdmin.js`):

```js
import 'server-only';
import { createClient } from '@supabase/supabase-js';

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);
```

Retener asientos (`app/api/v1/holds/route.js`):

```js
import { supabaseAdmin } from '@/server/supabaseAdmin';
import { errorResponse } from '@/server/errors';
import { parseHold } from '@/server/validate';

export const runtime = 'nodejs';

export async function POST(request) {
  const body = parseHold(await request.json());       // lanza INVALID_DATA si algo falla
  const { data, error } = await supabaseAdmin.rpc('hold_seats', {
    p_seat_ids: body.seat_ids, p_name: body.buyer.name, p_phone: body.buyer.phone,
    p_email: body.buyer.email,
  });
  if (error) return errorResponse(error);             // error.message = 'SEAT_TAKEN' → 409
  return Response.json(data[0]);
}
```

Administradores (`server/auth.js`):

```js
export async function requireAdmin(request) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  const { data } = await supabaseAdmin.auth.getUser(token);
  const email = data?.user?.email;
  if (!email) throw apiError('UNAUTHORIZED', 401);
  const { data: admin } = await supabaseAdmin.from('admins').select('email').eq('email', email).maybeSingle();
  if (!admin) throw apiError('UNAUTHORIZED', 403);
  return email;
}
```

### Particularidades de Vercel

- **Tamaño del comprobante:** Vercel acepta como máximo 4,5 MB por petición; por eso el frontend comprime la captura a menos de 2 MB antes de enviarla.
- **Correo al aprobar:** en funciones serverless, el trabajo que sigue después de responder puede cortarse. Se llama a EmailJS con `await` antes de responder (tarda 1 o 2 segundos) o se usa `after()` de `next/server`.
- **Runtime:** las rutas que generan el QR o envían correos llevan `export const runtime = 'nodejs'`.
- **Protección de `/admin`:** las páginas redirigen al login si no hay sesión, pero la protección real está en `requireAdmin` de cada ruta de API.

### Variables de entorno (todas en Vercel)

| Variable | Visible en el navegador | Uso |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | sí | `/api/v1` |
| `NEXT_PUBLIC_SUPABASE_URL` | sí | URL del proyecto |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | sí | solo para el login de la directiva |
| `SUPABASE_SERVICE_ROLE_KEY` | **no** | Route Handlers; nunca con prefijo `NEXT_PUBLIC_` |
| `APP_URL` | no | enlaces del correo y URLs del QR |
| `EMAILJS_SERVICE_ID` | no | servicio Gmail conectado en EmailJS |
| `EMAILJS_TEMPLATE_APPROVED` / `EMAILJS_TEMPLATE_REJECTED` | no | `boleto_aprobado` / `orden_rechazada` |
| `EMAILJS_PUBLIC_KEY` / `EMAILJS_PRIVATE_KEY` | **no** | se usan solo en `server/email.js` |

### Despliegue

Un solo proyecto en Vercel (gratuito) y Supabase (gratuito). Pasar después a la Versión A significa borrar `app/api` y `server/`, levantar FastAPI con el mismo contrato y cambiar `NEXT_PUBLIC_API_URL`.

## Comparación y cuándo elegir

La Versión A conviene si dos personas trabajan en paralelo; la Versión B, si una sola persona tiene que llegar al 21 de noviembre.

| Aspecto | Versión A (FastAPI) | Versión B (solo Next.js) |
| --- | --- | --- |
| Proyectos y despliegues | 2 (Vercel + Railway o Fly) | 1 (Vercel) |
| Lenguajes | JavaScript + Python | JavaScript |
| Trabajo en paralelo | Natural: frontend y backend por separado | Posible, pero en el mismo repositorio |
| Configuración extra | CORS, dos `.env`, URL del backend | Ninguna |
| Costo mensual | Railway \~US$5 (plan Hobby) | US$0 |
| Riesgo el día de ventas | Un servidor más que puede fallar | Menor |
| Crecimiento futuro (más eventos, app móvil) | Mejor: API independiente | Bueno; se migra a A sin tocar la base |
| Aprendizaje | Backend formal con Python y SQLAlchemy | Full-stack con Next.js |

**Lo que no cambia entre versiones:** la base de datos, las funciones SQL, el contrato de la API, el frontend completo, el bucket de comprobantes y las cuentas de la directiva.

**Recomendación:** Versión A si el compañero se compromete con el backend desde el primer día; si no, Versión B. En ambos casos se empieza por el script SQL, que es común.

## Plan de trabajo

Se construye primero el camino completo de una compra real (retener → comprobante → aprobar → correo) y después se pule. Las ventas abren el lunes 16 de noviembre.

| Día | Versión A: tú (frontend) | Versión A: compañero (backend) | Versión B: una persona |
| --- | --- | --- | --- |
| Lun 9 – Mar 10 | Proyecto Next.js + Tailwind v4; migrar Hero, formulario y mapa del HTML; `api.js` con respuestas simuladas | Supabase: ejecutar el SQL, bucket privado, cuentas de la directiva; FastAPI con `/seats` y `/holds` | Supabase y SQL; proyecto Next.js; rutas `/seats` y `/holds`; migrar Hero, formulario y mapa |
| Mié 11 | Pantalla de pago (QR, total, código para la glosa) y subida del comprobante | `/orders/{id}/receipt`, `/orders/{id}`, liberar retención | Pago, comprobante y sus rutas |
| Jue 12 | Panel `/admin`: login, lista, visor de comprobante, aprobar y rechazar | Rutas de admin, `require_admin`, correos de aprobación y rechazo | Panel admin, rutas de admin y correos |
| Vie 13 | Página del boleto, estado de la orden, escáner de check-in | `/tickets/{token}`, `/admin/check-in`, bloquear asientos, stats | Boleto, estado de la orden y check-in |
| Sáb 14 | Desplegar en Vercel y conectar con el backend real | Desplegar en Railway o Fly | Desplegar en Vercel |
| Dom 15 | Prueba con 4 o 5 personas comprando a la vez, desde celulares reales; corregir | Igual | Igual |
| Lun 16 – Jue 20 | Ventas abiertas; la directiva revisa comprobantes al menos 2 veces al día | Monitorear errores | Igual |
| Vie 21 | Evento: check-in en la puerta desde 18:30 | Soporte | Igual |

**Plan B si algo se atrasa:**

- Sin escáner: imprimir la lista de órdenes aprobadas con sus asientos y marcar a mano en la puerta.
- Sin correo automático: la directiva envía por WhatsApp el enlace `/tickets/{token}` desde el panel.
- Lo indispensable para abrir ventas es retener, subir comprobante, aprobar y emitir boletos sin vender dos veces la misma silla.

## Reglas para la modularización y seguridad

Estas reglas se le dan a la IA que genera el código (Gemini u otra) junto con este documento, para que las dos versiones no se separen.

### Reglas para la IA

1. No modificar el esquema SQL ni crear tablas nuevas sin avisar; toda escritura pasa por las funciones `hold_seats`, `release_hold`, `submit_receipt`, `approve_order`, `reject_order`, `check_in` y `set_seats_blocked`.
2. Respetar exactamente el contrato `/api/v1`: rutas, nombres de campos y forma de los errores `{error, message}`.
3. El frontend llama al servidor solo a través de `src/services/api.js`, con la URL tomada de `NEXT_PUBLIC_API_URL`.
4. El total que se cobra lo calcula la base de datos; el del frontend es solo informativo.
5. La llave `SUPABASE_SERVICE_ROLE_KEY` y la llave privada de EmailJS solo existen en el servidor (FastAPI o la carpeta `server/`), nunca con prefijo `NEXT_PUBLIC_`.
6. Mantener la identidad visual del prototipo `jola-asientos.html`: tokens de color, tipografías Fredoka y Urbanist, modo claro y oscuro, animaciones que respetan `prefers-reduced-motion`.
7. Validar los datos del comprador con las mismas reglas en el navegador y en el servidor (`lib/validators.js`).
8. Componentes pequeños y de una sola responsabilidad, en la carpeta de su función (`features/seat-map`, `features/checkout`…); nada de lógica de negocio dentro de componentes visuales.

### Checklist de seguridad antes de abrir ventas

- [ ] RLS activado en las 4 tablas y permisos revocados para `anon` y `authenticated` (lo hace el script).
- [ ] Bucket `receipts` privado; el panel muestra comprobantes solo con URLs firmadas que vencen.
- [ ] Registro de usuarios desactivado en Supabase Auth; correos de la directiva cargados en `admins`.
- [ ] Todas las rutas `/admin/*` exigen `require_admin`, incluido el check-in.
- [ ] Comprobantes limitados a JPG, PNG, WEBP o PDF y máximo 4 MB, revisando tipo y tamaño en el servidor.
- [ ] Ninguna llave secreta en el repositorio; `.env` en `.gitignore` y `.env.example` sin valores reales.
- [ ] Backend conectado por el pooler (`pooler.supabase.com:5432`), no por la conexión directa IPv6.
- [ ] EmailJS: acceso de API para aplicaciones fuera del navegador activado, llave privada solo en el servidor y envío de prueba de ambas plantillas a un Gmail y a un Outlook.
- [ ] HTTPS en producción (Vercel lo trae), necesario además para la cámara del escáner.
- [ ] Límite de retenciones por IP o celular, para que nadie bloquee todo el auditorio (opcional: Cloudflare Turnstile).
- [ ] Prueba con varias personas comprando la misma silla a la vez: solo una debe obtenerla.
