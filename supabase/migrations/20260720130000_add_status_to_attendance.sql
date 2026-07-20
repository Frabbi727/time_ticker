-- Migration: Add status and notes to attendance table
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Present';
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.attendance ALTER COLUMN punch_in DROP NOT NULL;
