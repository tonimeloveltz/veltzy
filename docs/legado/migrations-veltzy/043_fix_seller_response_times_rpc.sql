-- =============================================================================
-- 043_fix_seller_response_times_rpc.sql
-- Corrige a function get_seller_avg_response_times para usar schema veltzy
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_seller_avg_response_times(
    _company_id UUID,
    _start_date TIMESTAMPTZ DEFAULT now() - INTERVAL '30 days'
)
RETURNS TABLE (
    profile_id UUID,
    seller_name TEXT,
    avg_response_minutes NUMERIC,
    total_conversations INTEGER
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    WITH first_responses AS (
        SELECT
            l.assigned_to,
            l.id as lead_id,
            MIN(m.created_at) FILTER (WHERE m.sender_type = 'human') as first_human_response,
            MIN(m.created_at) FILTER (WHERE m.sender_type = 'lead') as first_lead_message
        FROM veltzy.leads l
        JOIN veltzy.messages m ON m.lead_id = l.id
        WHERE l.company_id = _company_id
        AND l.created_at >= _start_date
        AND l.assigned_to IS NOT NULL
        GROUP BY l.assigned_to, l.id
    )
    SELECT
        p.id as profile_id,
        p.name as seller_name,
        ROUND(AVG(
            EXTRACT(EPOCH FROM (fr.first_human_response - fr.first_lead_message)) / 60
        )::NUMERIC, 1) as avg_response_minutes,
        COUNT(DISTINCT fr.lead_id)::INTEGER as total_conversations
    FROM first_responses fr
    JOIN public.profiles p ON p.id = fr.assigned_to
    WHERE fr.first_human_response IS NOT NULL
    AND fr.first_lead_message IS NOT NULL
    AND fr.first_human_response > fr.first_lead_message
    GROUP BY p.id, p.name
    ORDER BY avg_response_minutes ASC;
$$;
