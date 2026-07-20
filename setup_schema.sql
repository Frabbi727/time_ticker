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

-- Create Billing Records Table (Admin Only)
CREATE TABLE IF NOT EXISTS billing_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jira_ticket TEXT NOT NULL,
  unique_billing_code TEXT UNIQUE NOT NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  man_days NUMERIC(10,2) NOT NULL DEFAULT 0,
  rate_per_man_day NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Pending',
  notes TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE billing_records ENABLE ROW LEVEL SECURITY;

