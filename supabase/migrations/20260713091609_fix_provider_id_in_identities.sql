-- Recreate the create_tracker_user function to set provider_id to the user's email address
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

  -- 2. Insert into auth.identities to link the email provider
  -- Crucial: provider_id for the email provider MUST be the email address, NOT the user ID UUID.
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
    user_email, -- provider_id is user_email
    now(),
    now(),
    now()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update the existing identity row for 1909 to set provider_id to '1909@tracker.local'
UPDATE auth.identities
SET provider_id = '1909@tracker.local'
WHERE email = '1909@tracker.local';
