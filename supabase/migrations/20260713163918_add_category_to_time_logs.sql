-- Add category column to time_logs table
ALTER TABLE public.time_logs ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'Development';
