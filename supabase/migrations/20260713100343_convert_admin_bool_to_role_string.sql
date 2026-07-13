-- 1. Add role column to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'employee';

-- 2. Migrate current is_admin boolean values to the new role string
UPDATE public.profiles SET role = 'admin' WHERE is_admin = TRUE;

-- 3. Drop the deprecated is_admin column
ALTER TABLE public.profiles DROP COLUMN IF EXISTS is_admin;

-- 4. Recreate check_is_admin security helper to check role string (SECURITY DEFINER to avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.check_is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Recreate handle_new_user trigger to default role from metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, name, pin, role)
  VALUES (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', 'User ' || coalesce(new.raw_user_meta_data->>'pin', new.id::text)),
    coalesce(new.raw_user_meta_data->>'pin', ''),
    coalesce(new.raw_user_meta_data->>'role', 'employee')
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
