-- Fix 1: GRANT SELECT em tenant_role_permissions para authenticated
-- O RLS esta correto (using true) mas o GRANT estava faltando
GRANT SELECT ON public.tenant_role_permissions TO authenticated;
GRANT SELECT ON public.tenant_role_permissions TO anon;

-- Fix 2: Recriar get_seller_avg_response_times com schema veltzy
-- A funcao original (migration 006) referenciava public.leads/messages,
-- que foram movidos para veltzy.* na migration 010.
-- A migration 043 tentou corrigir mas pode nao ter sido aplicada.
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
      AND m.direction = 'outbound'
      AND m.sender_type = 'user'
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
