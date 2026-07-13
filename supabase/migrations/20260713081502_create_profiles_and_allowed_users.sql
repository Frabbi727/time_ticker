-- Create allowed_users table to hold pre-approved PINs and Names
CREATE TABLE IF NOT EXISTS public.allowed_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  pin TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create profiles table linked to auth.users
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  pin TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on both tables
ALTER TABLE public.allowed_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- RLS policies for profiles: users can manage their own profile
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Function to check if a PIN is allowed and get the associated name (accessible to public)
CREATE OR REPLACE FUNCTION public.verify_allowed_pin(input_pin TEXT)
RETURNS TABLE (pin_exists BOOLEAN, user_name TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT TRUE, allowed_users.name
  FROM public.allowed_users
  WHERE allowed_users.pin = input_pin;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to automatically create a profile when a new user signs up in auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, name, pin)
  VALUES (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', 'User ' || coalesce(new.raw_user_meta_data->>'pin', new.id::text)),
    coalesce(new.raw_user_meta_data->>'pin', '')
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Insert an initial test user into allowed_users
INSERT INTO public.allowed_users (name, pin) 
VALUES ('MD FAZLE RABBI', '1909')
ON CONFLICT (pin) DO NOTHING;
