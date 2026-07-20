import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://rwzfhcpwbmujsprnuvpb.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ3emZoY3B3Ym11anNwcm51dnBiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1MTI5NTQsImV4cCI6MjA5NzA4ODk1NH0.gzwnO97YDhToUGlmUzUu0CIYYfGqQ_N56UZr4jOP6DU';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function inspect() {
  // Test execute_sql_query with a SELECT query to see if it works!
  const selectQuery = "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'";
  const { data, error } = await supabase.rpc('execute_sql_query', { query_text: selectQuery });
  console.log("Public tables in DB:", data, "Error:", error);
}

inspect();
