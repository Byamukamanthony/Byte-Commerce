-- Rollback Migration for UgaByte Commerce
-- Run only if reverting the Commerce module completely.

drop table if exists public.product_favorites cascade;
drop table if exists public.store_favorites cascade;
drop table if exists public.order_status_history cascade;
drop table if exists public.payments cascade;
drop table if exists public.order_items cascade;
drop table if exists public.orders cascade;
drop table if exists public.customer_addresses cascade;
drop table if exists public.product_images cascade;
drop table if exists public.products cascade;
drop table if exists public.store_members cascade;
drop table if exists public.stores cascade;
drop table if exists public.categories cascade;
drop function if exists public.is_store_member(uuid);
drop function if exists public.is_ugabyte_admin();
