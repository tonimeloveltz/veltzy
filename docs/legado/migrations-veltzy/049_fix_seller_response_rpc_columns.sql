-- Corrige get_seller_avg_response_times: usa sender_type='human' (nao direction/user)
-- veltzy.messages tem sender_type enum('ai','human','lead'), nao tem coluna direction
CREATE OR REPLACE FUNCTION public.get_seller_avg_response_times(
  _company_id uuid,
  _start_date timestamptz DEFAULT NULL
)
RETURNS TABLE (
  user_id uuid,
  avg_response_seconds numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH first_responses AS (
    SELECT
      l.assigned_to,
      l.id AS lead_id,
      MIN(m.created_at) AS first_response_at,
      l.created_at AS lead_created_at
    FROM veltzy.leads l
    JOIN veltzy.messages m ON m.lead_id = l.id
    WHERE l.company_id = _company_id
      AND m.sender_type = 'human'
      AND l.assigned_to IS NOT NULL
      AND (_start_date IS NULL OR l.created_at >= _start_date)
    GROUP BY l.id, l.assigned_to, l.created_at
  )
  SELECT
    fr.assigned_to AS user_id,
    ROUND(AVG(EXTRACT(EPOCH FROM (fr.first_response_at - fr.lead_created_at))))::numeric AS avg_response_seconds
  FROM first_responses fr
  GROUP BY fr.assigned_to;
END;
$$;
