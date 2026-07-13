-- 1. Add is_admin column to public.profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Create function to check if the current user is an admin (SECURITY DEFINER to avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.check_is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_admin = TRUE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Update RLS policies on public.profiles to allow admins to view all profiles
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.check_is_admin());

-- 4. Update RLS policies on public.attendance to allow admins to manage all attendance logs
DROP POLICY IF EXISTS "Users can manage their own attendance" ON public.attendance;
CREATE POLICY "Users can manage their own attendance" ON public.attendance
  FOR ALL TO authenticated
  USING (auth.uid() = user_id OR public.check_is_admin())
  WITH CHECK (auth.uid() = user_id OR public.check_is_admin());

-- 5. Call the creation function to initialize the auth.users and auth.identities records for 1111
SELECT public.create_tracker_user('1111', 'System Admin');

-- Set is_admin flag to true for 1111
UPDATE public.profiles SET is_admin = TRUE WHERE pin = '1111';
