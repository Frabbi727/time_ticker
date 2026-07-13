-- Drop the unique constraint to allow multiple check-ins per day for a user
ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS unique_user_date;
