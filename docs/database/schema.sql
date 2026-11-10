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
