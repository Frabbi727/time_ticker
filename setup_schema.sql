-- Create Projects Table
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create Time Logs Table
CREATE TABLE IF NOT EXISTS time_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  description TEXT NOT NULL,
  remarks TEXT,
  date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  direct_duration TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Insert test data
INSERT INTO projects (name) VALUES ('Internal Research'), ('Client Alpha'), ('System Maintenance');
