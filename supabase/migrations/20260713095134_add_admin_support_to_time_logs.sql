-- Update RLS policies on public.projects to allow admins to manage all projects
DROP POLICY IF EXISTS "Allow authenticated users to manage their own projects" ON public.projects;
CREATE POLICY "Allow authenticated users to manage their own projects" ON public.projects
  FOR ALL TO authenticated
  USING (auth.uid() = user_id OR public.check_is_admin())
  WITH CHECK (auth.uid() = user_id OR public.check_is_admin());

-- Update RLS policies on public.time_logs to allow admins to manage all time logs
DROP POLICY IF EXISTS "Allow authenticated users to manage their own logs" ON public.time_logs;
CREATE POLICY "Allow authenticated users to manage their own logs" ON public.time_logs
  FOR ALL TO authenticated
  USING (auth.uid() = user_id OR public.check_is_admin())
  WITH CHECK (auth.uid() = user_id OR public.check_is_admin());
