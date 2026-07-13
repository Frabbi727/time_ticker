CREATE OR REPLACE FUNCTION public.execute_sql_query(query_text TEXT)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  EXECUTE 'SELECT jsonb_agg(t) FROM (' || query_text || ') t' INTO result;
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
