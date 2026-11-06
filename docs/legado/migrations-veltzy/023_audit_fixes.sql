-- Fix F1: Corrige nome do enum (020 usou sender_type_enum, correto e sender_type)
ALTER TYPE veltzy.sender_type ADD VALUE IF NOT EXISTS 'internal';

-- Fix F2: RPC get_conversation_list excluindo notas internas do preview
DROP FUNCTION IF EXISTS veltzy.get_conversation_list(UUID);

CREATE FUNCTION veltzy.get_conversation_list(p_company_id UUID)
RETURNS TABLE (
  id UUID,
  company_id UUID,
  name TEXT,
  phone TEXT,
  email TEXT,
  instagram_id TEXT,
  linkedin_id TEXT,
  source_id UUID,
  stage_id UUID,
  status TEXT,
  temperature TEXT,
  ai_score INT,
  assigned_to UUID,
  is_ai_active BOOLEAN,
  is_queued BOOLEAN,
  conversation_status TEXT,
  tags TEXT[],
  deal_value NUMERIC,
  observations TEXT,
  avatar_url TEXT,
  ad_context JSONB,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  last_customer_message_at TIMESTAMPTZ,
  sla_breached BOOLEAN,
  assigned_name TEXT,
  assigned_email TEXT,
  assigned_available BOOLEAN,
  source_name TEXT,
  source_slug TEXT,
  source_color TEXT,
  source_icon TEXT,
  last_message_content TEXT,
  last_message_at TIMESTAMPTZ,
  last_message_sender TEXT,
  last_message_type TEXT,
  unread_count BIGINT
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = veltzy, public
AS $$
  SELECT
    l.id,
    l.company_id,
    l.name,
    l.phone,
    l.email,
    l.instagram_id,
    l.linkedin_id,
    l.source_id,
    l.stage_id,
    l.status,
    l.temperature,
    l.ai_score,
    l.assigned_to,
    l.is_ai_active,
    l.is_queued,
    l.conversation_status,
    l.tags,
    l.deal_value,
    l.observations,
    l.avatar_url,
    l.ad_context,
    l.created_at,
    l.updated_at,
    l.last_customer_message_at,
    l.sla_breached,
    p.name AS assigned_name,
    p.email AS assigned_email,
    p.is_available AS assigned_available,
    ls.name AS source_name,
    ls.slug AS source_slug,
    ls.color AS source_color,
    ls.icon_name AS source_icon,
    lm.content AS last_message_content,
    lm.created_at AS last_message_at,
    lm.sender_type AS last_message_sender,
    lm.message_type AS last_message_type,
    COALESCE(uc.cnt, 0) AS unread_count
  FROM veltzy.leads l
  LEFT JOIN public.profiles p ON l.assigned_to = p.id
  LEFT JOIN veltzy.lead_sources ls ON l.source_id = ls.id
  LEFT JOIN LATERAL (
    SELECT m.content, m.created_at, m.sender_type, m.message_type
    FROM veltzy.messages m
    WHERE m.lead_id = l.id
      AND (m.is_internal IS NOT TRUE)
    ORDER BY m.created_at DESC
    LIMIT 1
  ) lm ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS cnt
    FROM veltzy.messages m
    WHERE m.lead_id = l.id AND m.is_read = false AND m.sender_type = 'lead'
  ) uc ON true
  WHERE l.company_id = p_company_id
  ORDER BY
    l.sla_breached DESC NULLS LAST,
    lm.created_at DESC NULLS LAST;
$$;
