-- Create public.get_team_profiles secure function to bypass SELECT RLS on public.profiles,
-- returning all users to authenticated members but masking sensitive PIN values to '****' for non-admins.
CREATE OR REPLACE FUNCTION public.get_team_profiles()
RETURNS TABLE (
  id UUID,
  name TEXT,
  role TEXT,
  pin TEXT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  -- Verify the requester is authenticated
  IF auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION 'Access Denied: Must be authenticated.';
  END IF;

  RETURN QUERY
  SELECT 
    p.id,
    p.name,
    p.role,
    CASE 
      WHEN auth.uid() = p.id OR public.check_is_admin() THEN p.pin
      ELSE '****'
    END AS pin,
    p.created_at
  FROM public.profiles p;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
