-- Habilitar extensao pgcrypto para gen_random_bytes
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ===========================================
-- TABELAS DA FASE 5
-- ===========================================

-- Convites de equipe
CREATE TABLE public.company_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
    email TEXT NOT NULL,
    role app_role NOT NULL DEFAULT 'seller',
    invite_code TEXT NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
    invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    accepted_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===========================================
-- FUNCOES
-- ===========================================

-- Aceitar convite e vincular usuario a empresa
CREATE OR REPLACE FUNCTION public.accept_invite(p_invite_code TEXT, p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    _invite RECORD;
    _profile RECORD;
BEGIN
    SELECT * INTO _invite FROM public.company_invites
    WHERE invite_code = p_invite_code
    AND accepted_at IS NULL
    AND expires_at > now();

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Convite invalido ou expirado');
    END IF;

    SELECT * INTO _profile FROM public.profiles WHERE user_id = p_user_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Perfil nao encontrado');
    END IF;

    IF _profile.company_id IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Usuario ja pertence a uma empresa');
    END IF;

    UPDATE public.profiles SET company_id = _invite.company_id WHERE user_id = p_user_id;

    INSERT INTO public.user_roles (user_id, role)
    VALUES (p_user_id, _invite.role)
    ON CONFLICT (user_id, role) DO NOTHING;

    UPDATE public.company_invites SET accepted_at = now() WHERE id = _invite.id;

    RETURN jsonb_build_object('success', true, 'company_id', _invite.company_id);
END;
$$;

-- Remover usuario da empresa
CREATE OR REPLACE FUNCTION public.remove_user_from_company(p_target_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    _company_id UUID;
BEGIN
    _company_id := get_current_company_id();

    IF NOT is_company_admin() THEN
        RAISE EXCEPTION 'Permissao negada';
    END IF;

    UPDATE public.profiles
    SET company_id = NULL
    WHERE user_id = p_target_user_id AND company_id = _company_id;

    DELETE FROM public.user_roles
    WHERE user_id = p_target_user_id AND role NOT IN ('super_admin');
END;
$$;

-- Tempo medio de resposta por vendedor
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
        FROM public.leads l
        JOIN public.messages m ON m.lead_id = l.id
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

-- ===========================================
-- RLS
-- ===========================================

ALTER TABLE public.company_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage invites"
ON public.company_invites FOR ALL TO authenticated
USING (company_id = get_current_company_id() AND is_company_admin() OR is_super_admin());

CREATE POLICY "Anyone can view invite by code"
ON public.company_invites FOR SELECT TO authenticated
USING (true);
