-- 1. Purge all operational logs
TRUNCATE TABLE public.time_logs CASCADE;
TRUNCATE TABLE public.attendance CASCADE;

-- 2. Ensure admin 1111 exists in auth.users and profiles
SELECT public.create_tracker_user('1111', 'System Admin');
UPDATE public.profiles SET role = 'admin' WHERE pin = '1111';

-- 3. Associate all projects to the admin user to prevent FK violation
UPDATE public.projects SET user_id = (SELECT id FROM auth.users WHERE email = '1111@tracker.local') WHERE user_id IS NOT NULL;

-- 4. Purge non-admin identities and users from auth schema
DELETE FROM auth.identities WHERE email <> '1111@tracker.local';
DELETE FROM auth.users WHERE email <> '1111@tracker.local';

-- 5. Purge non-admin profiles
DELETE FROM public.profiles WHERE pin <> '1111';
