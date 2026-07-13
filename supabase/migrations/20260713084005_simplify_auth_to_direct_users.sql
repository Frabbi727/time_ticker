-- Function to safely create a tracker user directly in auth.users
CREATE OR REPLACE FUNCTION public.create_tracker_user(input_pin TEXT, input_name TEXT)
RETURNS VOID AS $$
DECLARE
  new_user_id UUID := gen_random_uuid();
  hashed_password TEXT;
  user_email TEXT;
BEGIN
  user_email := input_pin || '@tracker.local';

  -- Check if user already exists
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = user_email) THEN
    RETURN;
  END IF;

  -- Generate the bcrypt hash for the password (pin + '_secure_salt') using the extensions schema
  hashed_password := extensions.crypt(input_pin || '_secure_salt', extensions.gen_salt('bf'));

  -- 1. Insert into auth.users (pre-confirmed, bypassing emails)
  -- Crucial: Required string columns must be set to empty strings (''), NOT NULL, otherwise GoTrue returns 500 Database error querying schema.
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
    jsonb_build_object('name', input_name, 'pin', input_pin),
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

  -- 2. Insert into auth.identities to link the email provider and allow standard logins
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

-- Seed Employee (PIN: 0000)
SELECT public.create_tracker_user('0000', 'Name');

-- Clean up any existing rows to prevent GoTrue 500 error due to NULL columns
UPDATE auth.users
SET
  confirmation_token = COALESCE(confirmation_token, ''),
  email_change = COALESCE(email_change, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  reauthentication_token = COALESCE(reauthentication_token, ''),
  recovery_token = COALESCE(recovery_token, ''),
  phone_change = COALESCE(phone_change, ''),
  phone_change_token = COALESCE(phone_change_token, '')
WHERE email = '0000@tracker.local';

-- Clean up allowed_users table and verify_allowed_pin RPC function
DROP FUNCTION IF EXISTS public.verify_allowed_pin(TEXT);
DROP TABLE IF EXISTS public.allowed_users CASCADE;
