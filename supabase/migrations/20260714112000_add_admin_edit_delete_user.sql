-- Create public.delete_user_by_admin RPC helper
CREATE OR REPLACE FUNCTION public.delete_user_by_admin(target_user_id UUID)
RETURNS VOID AS $$
BEGIN
  -- Security Check: Verify executor is authenticated and is an admin ONLY
  IF NOT public.check_is_admin() THEN
    RAISE EXCEPTION 'Access Denied: Only administrators can delete team members.';
  END IF;

  -- Prevent deleting oneself
  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Access Denied: You cannot delete your own admin account.';
  END IF;

  -- Clean up dependencies manually to avoid FK constraint issues
  DELETE FROM public.time_logs WHERE user_id = target_user_id;
  UPDATE public.projects SET user_id = NULL WHERE user_id = target_user_id;

  -- Delete from auth.users (cascades to profiles, identities, attendance, sprint_assignments, etc.)
  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Create public.edit_user_by_admin RPC helper
CREATE OR REPLACE FUNCTION public.edit_user_by_admin(
  target_user_id UUID,
  input_name TEXT,
  input_pin TEXT,
  input_role TEXT,
  input_password TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  hashed_password TEXT;
  user_email TEXT;
BEGIN
  -- Security Check: Verify executor is authenticated and is an admin ONLY
  IF NOT public.check_is_admin() THEN
    RAISE EXCEPTION 'Access Denied: Only administrators can edit team members.';
  END IF;

  user_email := input_pin || '@tracker.local';

  -- Validation Check
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = user_email AND id != target_user_id) THEN
    RAISE EXCEPTION 'PIN % is already registered to another team member.', input_pin;
  END IF;

  -- 1. Update public.profiles table
  UPDATE public.profiles
  SET name = input_name,
      pin = input_pin,
      role = input_role
  WHERE id = target_user_id;

  -- 2. Update auth.users
  IF input_password IS NOT NULL AND input_password <> '' THEN
    hashed_password := extensions.crypt(input_password || '_secure_salt', extensions.gen_salt('bf'));
    
    UPDATE auth.users
    SET email = user_email,
        encrypted_password = hashed_password,
        raw_user_meta_data = jsonb_build_object('name', input_name, 'pin', input_pin, 'role', input_role),
        updated_at = now()
    WHERE id = target_user_id;
  ELSE
    UPDATE auth.users
    SET email = user_email,
        raw_user_meta_data = jsonb_build_object('name', input_name, 'pin', input_pin, 'role', input_role),
        updated_at = now()
    WHERE id = target_user_id;
  END IF;

  -- 3. Update auth.identities
  UPDATE auth.identities
  SET identity_data = jsonb_build_object('sub', target_user_id::text, 'email', user_email, 'email_verified', true),
      updated_at = now()
  WHERE user_id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
