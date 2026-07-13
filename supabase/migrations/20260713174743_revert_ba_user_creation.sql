-- Revert create_new_employee to strictly enforce public.check_is_admin() (Only Admins can register team members)
CREATE OR REPLACE FUNCTION public.create_new_employee(
  input_pin TEXT,
  input_name TEXT,
  input_password TEXT,
  input_role TEXT DEFAULT 'employee'
)
RETURNS VOID AS $$
DECLARE
  new_user_id UUID := gen_random_uuid();
  hashed_password TEXT;
  user_email TEXT;
BEGIN
  -- Security Check: Verify executor is authenticated and is an admin ONLY
  IF NOT public.check_is_admin() THEN
    RAISE EXCEPTION 'Access Denied: Only administrators can register new members.';
  END IF;

  user_email := input_pin || '@tracker.local';

  -- Validation Check
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = user_email) THEN
    RAISE EXCEPTION 'PIN % is already registered to a team member.', input_pin;
  END IF;

  hashed_password := extensions.crypt(input_password || '_secure_salt', extensions.gen_salt('bf'));

  -- Insert into auth.users
  INSERT INTO auth.users (
    instance_id,
    id,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    aud,
    phone,
    confirmation_token,
    email_change,
    email_change_token_new,
    email_change_token_current,
    reauthentication_token,
    recovery_token,
    phone_change,
    phone_change_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    new_user_id,
    'authenticated',
    user_email,
    hashed_password,
    now(),
    '{"provider": "email", "providers": ["email"]}',
    jsonb_build_object('name', input_name, 'pin', input_pin, 'role', input_role),
    now(),
    now(),
    'authenticated',
    NULL,
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    ''
  );

  -- Insert into auth.identities
  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    new_user_id,
    new_user_id,
    jsonb_build_object('sub', new_user_id::text, 'email', user_email, 'email_verified', true),
    'email',
    new_user_id::text,
    now(),
    now(),
    now()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
