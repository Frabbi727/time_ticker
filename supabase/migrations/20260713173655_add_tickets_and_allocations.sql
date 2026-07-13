-- Add JSONB columns for Jira tickets and team allocations to sprints
ALTER TABLE public.sprints ADD COLUMN IF NOT EXISTS jira_tickets JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.sprints ADD COLUMN IF NOT EXISTS team_allocations JSONB DEFAULT '{}'::jsonb;
