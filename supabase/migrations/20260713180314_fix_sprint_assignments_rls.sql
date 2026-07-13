-- 1. Create check_is_sprint_member check helper to safely check sprint assignments
-- bypasses standard SELECT recursion.
CREATE OR REPLACE FUNCTION public.check_is_sprint_member(sprint_uuid UUID, user_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.sprint_assignments 
    WHERE sprint_id = sprint_uuid AND user_id = user_uuid
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Drop old SELECT RLS policies
DROP POLICY IF EXISTS "Allow users to view sprints they are assigned to, or all if admin/BA" ON public.sprints;
DROP POLICY IF EXISTS "Allow users to view sprints if member or admin/BA" ON public.sprints;
DROP POLICY IF EXISTS "Allow users to view sprint assignments if assigned, or all if admin/BA" ON public.sprint_assignments;
DROP POLICY IF EXISTS "Allow users to view sprint assignments if member or admin/BA" ON public.sprint_assignments;

-- 3. Create updated RLS policies using check_is_sprint_member
CREATE POLICY "Allow users to view sprints if member or admin/BA" ON public.sprints
  FOR SELECT TO authenticated
  USING (
    public.check_is_admin_or_ba() OR 
    public.check_is_sprint_member(id, auth.uid())
  );

CREATE POLICY "Allow users to view sprint assignments if member or admin/BA" ON public.sprint_assignments
  FOR SELECT TO authenticated
  USING (
    public.check_is_admin_or_ba() OR 
    public.check_is_sprint_member(sprint_id, auth.uid())
  );
