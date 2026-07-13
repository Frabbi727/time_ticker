-- Create attendance table
CREATE TABLE IF NOT EXISTS public.attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  punch_in TIMESTAMPTZ NOT NULL DEFAULT now(),
  punch_out TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  -- A user can only have one attendance record per day
  CONSTRAINT unique_user_date UNIQUE (user_id, date)
);

-- Enable RLS
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies
CREATE POLICY "Users can manage their own attendance" ON public.attendance
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
