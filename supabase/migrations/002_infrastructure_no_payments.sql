-- UgaByte Commerce Migration 002:
-- Infrastructure Hardening, Persistent Carts, Storage Policies, Admin Audit Logs,
-- and No-In-App-Payment Order Arrangement Support.

-- 1. Account Status on Profiles (for suspension / moderation)
alter table if exists public.profiles
  add column if not exists account_status text not null default 'active'
  check (account_status in ('active', 'suspended'));

-- 2. Persistent Server-Side Carts & Cart Items (for authenticated customers)
create table if not exists public.carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, product_id)
);

alter table public.carts enable row level security;
alter table public.cart_items enable row level security;

drop policy if exists "Users manage own cart" on public.carts;
create policy "Users manage own cart" on public.carts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage own cart items" on public.cart_items;
create policy "Users manage own cart items" on public.cart_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 3. Disable in-app payment provider writes on orders/payments while keeping historical read compat
alter table public.orders drop constraint if exists orders_payment_method_check;
alter table public.orders
  add constraint orders_payment_method_check
  check (payment_method in ('direct_arrangement','cash_on_delivery','cash_on_pickup'));

alter table public.orders alter column payment_method set default 'direct_arrangement';

-- Ensure payments table stays read-only via RLS (no client inserts/updates)
revoke insert, update, delete on public.payments from anon, authenticated;

-- 4. Admin Audit Logs
create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references auth.users(id),
  action text not null,
  target_type text not null,
  target_id text not null,
  details text,
  created_at timestamptz not null default now()
);

alter table public.admin_audit_logs enable row level security;

drop policy if exists "Admins read audit logs" on public.admin_audit_logs;
create policy "Admins read audit logs" on public.admin_audit_logs
  for select using (public.is_ugabyte_admin());

drop policy if exists "Admins insert audit logs" on public.admin_audit_logs;
create policy "Admins insert audit logs" on public.admin_audit_logs
  for insert with check (public.is_ugabyte_admin() and auth.uid() = admin_id);

-- 5. Operational Logs (Service-role write, Admin read)
create table if not exists public.operational_logs (
  id uuid primary key default gen_random_uuid(),
  level text not null check (level in ('info','warn','error')),
  event_type text not null,
  message text not null,
  route text,
  user_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.operational_logs enable row level security;

drop policy if exists "Admins read operational logs" on public.operational_logs;
create policy "Admins read operational logs" on public.operational_logs
  for select using (public.is_ugabyte_admin());

-- 6. Supabase Storage Buckets & Store-Scoped Storage RLS Policies
insert into storage.buckets (id, name, public)
values
  ('store-logos', 'store-logos', true),
  ('store-covers', 'store-covers', true),
  ('product-images', 'product-images', true)
on conflict (id) do nothing;

-- Object path convention: <store_id>/<filename>
drop policy if exists "Public read commerce images" on storage.objects;
create policy "Public read commerce images" on storage.objects
  for select using (bucket_id in ('store-logos', 'store-covers', 'product-images'));

drop policy if exists "Store members upload store assets" on storage.objects;
create policy "Store members upload store assets" on storage.objects
  for insert with check (
    bucket_id in ('store-logos', 'store-covers', 'product-images')
    and auth.role() = 'authenticated'
    and (
      public.is_ugabyte_admin()
      or public.is_store_member((storage.foldername(name))[1]::uuid)
    )
  );

drop policy if exists "Store members update own store assets" on storage.objects;
create policy "Store members update own store assets" on storage.objects
  for update using (
    bucket_id in ('store-logos', 'store-covers', 'product-images')
    and (
      public.is_ugabyte_admin()
      or public.is_store_member((storage.foldername(name))[1]::uuid)
    )
  );

drop policy if exists "Store members delete own store assets" on storage.objects;
create policy "Store members delete own store assets" on storage.objects
  for delete using (
    bucket_id in ('store-logos', 'store-covers', 'product-images')
    and (
      public.is_ugabyte_admin()
      or public.is_store_member((storage.foldername(name))[1]::uuid)
    )
  );
