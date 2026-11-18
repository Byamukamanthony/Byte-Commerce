-- Rollback for UgaByte Commerce Migration 002
drop policy if exists "Store members delete own store assets" on storage.objects;
drop policy if exists "Store members update own store assets" on storage.objects;
drop policy if exists "Store members upload store assets" on storage.objects;
drop policy if exists "Public read commerce images" on storage.objects;

drop table if exists public.operational_logs;
drop table if exists public.admin_audit_logs;
drop table if exists public.cart_items;
drop table if exists public.carts;

alter table if exists public.profiles drop column if exists account_status;
