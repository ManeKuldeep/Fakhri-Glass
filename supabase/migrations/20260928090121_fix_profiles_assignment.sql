-- Fix: replace old assignment value 'turbhe' with 'mumbai'.
-- Safe to re-run.

update public.profiles
set assignment = 'mumbai'
where assignment = 'turbhe';

alter table public.profiles
  drop constraint if exists profiles_assignment_check;

alter table public.profiles
  add constraint profiles_assignment_check
  check (assignment in ('mumbai', 'sanpada', 'cutter'));