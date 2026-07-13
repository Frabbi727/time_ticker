-- Function to look up a user's email based on their PIN
CREATE OR REPLACE FUNCTION public.get_email_by_pin(input_pin TEXT)
RETURNS TEXT AS $$
DECLARE
  found_email TEXT;
BEGIN
  -- 1. Try to find by metadata pin first
  SELECT email INTO found_email
  FROM auth.users
  WHERE raw_user_meta_data->>'pin' = input_pin;

  -- 2. If not found, try to find by email prefix (e.g., input_pin || '@%')
  IF found_email IS NULL THEN
    SELECT email INTO found_email
    FROM auth.users
    WHERE email LIKE input_pin || '@%'
    LIMIT 1;
  END IF;

  RETURN found_email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
