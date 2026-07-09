-- 1. Remove permissive public policies from time_logs
DROP POLICY IF EXISTS "Allow all" ON time_logs;

-- 2. Remove permissive public policies from projects
DROP POLICY IF EXISTS "Allow all" ON projects;
DROP POLICY IF EXISTS "Allow all access to projects" ON projects;

-- 3. Add policy allowing any authenticated user to view the list of projects
CREATE POLICY "Allow authenticated users to view all projects" ON projects
  FOR SELECT
  TO authenticated
  USING (true);
