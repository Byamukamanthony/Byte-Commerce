-- UgaByte Commerce: Production Supabase PostgreSQL Migration
-- Apply on top of existing UgaByte Supabase Auth + public.profiles(id, role)
-- Safe idempotent migration: review existing tables before running.

create extension if not exists pgcrypto;

-- 1. Categories
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  parent_id uuid references public.categories(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 2. Stores
create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  name text not null,
  slug text not null unique,
  description text,
  logo_url text,
  cover_url text,
  phone text,
  whatsapp_number text,
  email text,
  location_text text,
  district text,
  status text not null default 'pending'
    check (status in ('pending','active','suspended','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. Store Members
create table if not exists public.store_members (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner'
    check (role in ('owner','manager','staff')),
  created_at timestamptz not null default now(),
  unique (store_id, user_id)
);

-- 4. Products
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  category_id uuid references public.categories(id),
  name text not null,
  slug text not null,
  description text,
  price numeric(14,2) not null check (price >= 0),
  compare_at_price numeric(14,2),
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  sku text,
  condition text default 'new' check (condition in ('new','used','refurbished')),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  is_featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, slug)
);

-- 5. Product Images
create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  storage_path text not null,
  alt_text text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- 6. Customer Addresses
create table if not exists public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recipient_name text not null,
  phone text not null,
  district text,
  area text,
  address_details text,
  created_at timestamptz not null default now()
);

-- 7. Orders (one store per order for MVP)
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  idempotency_key text unique,
  store_id uuid not null references public.stores(id),
  customer_id uuid references auth.users(id),
  customer_name text not null,
  customer_phone text not null,
  customer_email text,
  delivery_method text not null
    check (delivery_method in ('pickup','seller_delivery','third_party')),
  delivery_address text,
  delivery_fee numeric(14,2) not null default 0,
  subtotal numeric(14,2) not null check (subtotal >= 0),
  total numeric(14,2) not null check (total >= 0),
  currency text not null default 'UGX' check (currency = 'UGX'),
  payment_method text not null default 'cash_on_delivery'
    check (payment_method in ('cash_on_delivery','cash_on_pickup','mtn_momo','airtel_money')),
  payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid','pending','paid','failed','refunded')),
  status text not null default 'pending'
    check (status in ('pending','accepted','processing','ready','dispatched','completed','cancelled','rejected')),
  customer_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 8. Order Items (immutable purchase snapshots)
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  sku text,
  unit_price numeric(14,2) not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0),
  line_total numeric(14,2) not null check (line_total >= 0)
);

-- 9. Payments
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  provider text not null check (provider in ('cash','mtn_momo','airtel_money','other')),
  provider_reference text,
  amount numeric(14,2) not null check (amount >= 0),
  currency text not null default 'UGX',
  status text not null default 'pending'
    check (status in ('pending','successful','failed','refunded')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- 10. Order Status History
create table if not exists public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  old_status text,
  new_status text not null,
  changed_by uuid references auth.users(id),
  note text,
  created_at timestamptz not null default now()
);

-- 11. Favorites
create table if not exists public.store_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, store_id)
);

create table if not exists public.product_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

-- Indexes
create index if not exists products_store_status_idx on public.products(store_id, status);
create index if not exists products_category_idx on public.products(category_id);
create index if not exists products_search_idx on public.products
  using gin (to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(description,'')));
create index if not exists orders_store_created_idx on public.orders(store_id, created_at desc);
create index if not exists orders_customer_created_idx on public.orders(customer_id, created_at desc);
create index if not exists order_items_order_idx on public.order_items(order_id);
create index if not exists stores_status_idx on public.stores(status);

-- Helper Authorization Functions
create or replace function public.is_ugabyte_admin()
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.is_store_member(target_store_id uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.store_members
    where store_id = target_store_id and user_id = auth.uid()
  );
$$;

-- Enable Row Level Security on all tables
alter table public.categories enable row level security;
alter table public.stores enable row level security;
alter table public.store_members enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.customer_addresses enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.order_status_history enable row level security;
alter table public.store_favorites enable row level security;
alter table public.product_favorites enable row level security;

-- RLS Policies
create policy "Public read active categories" on public.categories
  for select using (is_active = true or public.is_ugabyte_admin());

create policy "Admin manage categories" on public.categories
  for all using (public.is_ugabyte_admin());

create policy "Public read active stores or own store" on public.stores
  for select using (
    status = 'active' or public.is_store_member(id) or public.is_ugabyte_admin()
  );

create policy "Authenticated create pending store" on public.stores
  for insert with check (auth.uid() = owner_id and status = 'pending');

create policy "Store members update own store" on public.stores
  for update using (public.is_store_member(id) or public.is_ugabyte_admin());

create policy "Public read published products of active stores" on public.products
  for select using (
    (status = 'published' and exists (
      select 1 from public.stores s where s.id = store_id and s.status = 'active'
    ))
    or public.is_store_member(store_id)
    or public.is_ugabyte_admin()
  );

create policy "Store members manage own products" on public.products
  for all using (public.is_store_member(store_id) or public.is_ugabyte_admin());

create policy "Customers read own orders; merchants read store orders" on public.orders
  for select using (
    customer_id = auth.uid()
    or public.is_store_member(store_id)
    or public.is_ugabyte_admin()
  );

create policy "Only store members or admin update orders" on public.orders
  for update using (public.is_store_member(store_id) or public.is_ugabyte_admin());

create policy "Users manage own addresses" on public.customer_addresses
  for all using (auth.uid() = user_id);

create policy "Users manage own favorites" on public.store_favorites
  for all using (auth.uid() = user_id);

create policy "Users manage own product favorites" on public.product_favorites
  for all using (auth.uid() = user_id);

create policy "Store members read team; owners manage members" on public.store_members
  for select using (
    user_id = auth.uid() or public.is_store_member(store_id) or public.is_ugabyte_admin()
  );

create policy "Public read images of published products; store members manage" on public.product_images
  for select using (
    exists (
      select 1 from public.products p
      join public.stores s on s.id = p.store_id
      where p.id = product_id
        and ((p.status = 'published' and s.status = 'active')
          or public.is_store_member(p.store_id)
          or public.is_ugabyte_admin())
    )
  );

create policy "Store members manage product images" on public.product_images
  for all using (
    exists (
      select 1 from public.products p
      where p.id = product_id
        and (public.is_store_member(p.store_id) or public.is_ugabyte_admin())
    )
  );

create policy "Customers and store members read order items" on public.order_items
  for select using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (o.customer_id = auth.uid() or public.is_store_member(o.store_id) or public.is_ugabyte_admin())
    )
  );

create policy "Customers and store members read payments" on public.payments
  for select using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (o.customer_id = auth.uid() or public.is_store_member(o.store_id) or public.is_ugabyte_admin())
    )
  );

create policy "Customers and store members read order status history" on public.order_status_history
  for select using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (o.customer_id = auth.uid() or public.is_store_member(o.store_id) or public.is_ugabyte_admin())
    )
  );

