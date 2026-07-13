CREATE OR REPLACE FUNCTION public.get_table_columns(t_schema TEXT, t_name TEXT)
RETURNS TABLE (col_name TEXT, col_type TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT column_name::text, data_type::text
  FROM information_schema.columns
  WHERE table_schema = t_schema AND table_name = t_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
