-- Make profiles.full_name and profiles.assignment NOT NULL.
-- All 3 existing profiles already have values; this just enforces the constraint.
-- See ARCHITECTURE.md §9 (hardening backlog).

ALTER TABLE public.profiles
  ALTER COLUMN full_name SET NOT NULL;

ALTER TABLE public.profiles
  ALTER COLUMN assignment SET NOT NULL;
