-- 1. Create a security helper to check if the current user is an admin or a BA
CREATE OR REPLACE FUNCTION public.check_is_admin_or_ba()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'ba')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Restrict project editing/creation to Admins and BAs
DROP POLICY IF EXISTS "Allow authenticated users to manage their own projects" ON public.projects;
CREATE POLICY "Allow admins and BAs to manage projects" ON public.projects
  FOR ALL TO authenticated
  USING (public.check_is_admin_or_ba())
  WITH CHECK (public.check_is_admin_or_ba());

-- 3. Create sprints table
CREATE TABLE IF NOT EXISTS public.sprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  duration_days INTEGER NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  status TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'active', 'completed', 'paused')),
  jira_url TEXT,
  description TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Enable RLS on sprints
ALTER TABLE public.sprints ENABLE ROW LEVEL SECURITY;

-- 5. Create sprint_assignments table
CREATE TABLE IF NOT EXISTS public.sprint_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sprint_id UUID NOT NULL REFERENCES public.sprints(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (sprint_id, user_id)
);

-- 6. Enable RLS on sprint_assignments
ALTER TABLE public.sprint_assignments ENABLE ROW LEVEL SECURITY;

-- 7. Define RLS Policies for sprints
CREATE POLICY "Allow users to view sprints they are assigned to, or all if admin/BA" ON public.sprints
  FOR SELECT TO authenticated
  USING (
    public.check_is_admin_or_ba() OR 
    EXISTS (
      SELECT 1 FROM public.sprint_assignments 
      WHERE sprint_assignments.sprint_id = sprints.id AND sprint_assignments.user_id = auth.uid()
    )
  );

CREATE POLICY "Allow admins and BAs to manage sprints" ON public.sprints
  FOR ALL TO authenticated
  USING (public.check_is_admin_or_ba())
  WITH CHECK (public.check_is_admin_or_ba());

-- 8. Define RLS Policies for sprint_assignments
CREATE POLICY "Allow users to view sprint assignments if assigned, or all if admin/BA" ON public.sprint_assignments
  FOR SELECT TO authenticated
  USING (
    public.check_is_admin_or_ba() OR 
    user_id = auth.uid()
  );

CREATE POLICY "Allow admins and BAs to manage sprint assignments" ON public.sprint_assignments
  FOR ALL TO authenticated
  USING (public.check_is_admin_or_ba())
  WITH CHECK (public.check_is_admin_or_ba());
