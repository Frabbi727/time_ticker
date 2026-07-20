-- Migration: Create leave_wfh_requests table and RLS policies
CREATE TABLE IF NOT EXISTS public.leave_wfh_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  request_type TEXT NOT NULL CHECK (request_type IN ('leave', 'wfh')),
  leave_type TEXT CHECK (leave_type IN ('casual', 'sick', 'annual', 'general')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected')),
  admin_notes TEXT,
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.leave_wfh_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users can manage their own leave requests" ON public.leave_wfh_requests;
CREATE POLICY "Users can manage their own leave requests"
  ON public.leave_wfh_requests FOR ALL TO authenticated
  USING (auth.uid() = user_id OR public.check_is_admin())
  WITH CHECK (auth.uid() = user_id OR public.check_is_admin());
