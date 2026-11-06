-- ===========================================
-- TABELAS DA FASE 6
-- ===========================================

-- Source integrations (config tecnica por origem de lead)
CREATE TABLE public.source_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
    source_id UUID REFERENCES public.lead_sources(id) ON DELETE CASCADE NOT NULL,
    integration_type TEXT NOT NULL
        CHECK (integration_type IN ('manual', 'webhook', 'whatsapp_api', 'instagram_api', 'linkedin_api')),
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, source_id, integration_type)
);

-- Conexoes Instagram OAuth
CREATE TABLE public.instagram_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL UNIQUE,
    page_id TEXT NOT NULL,
    page_name TEXT,
    instagram_account_id TEXT NOT NULL,
    instagram_username TEXT,
    access_token TEXT NOT NULL,
    token_expires_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tickets de suporte
CREATE TABLE public.support_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    error_message TEXT,
    error_stack TEXT,
    page_url TEXT,
    user_agent TEXT,
    priority TEXT NOT NULL DEFAULT 'medium'
        CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===========================================
-- INDICES
-- ===========================================
CREATE INDEX idx_source_integrations_company ON public.source_integrations(company_id);
CREATE INDEX idx_support_tickets_status ON public.support_tickets(status, created_at DESC);
CREATE INDEX idx_support_tickets_company ON public.support_tickets(company_id);

-- ===========================================
-- RLS
-- ===========================================

ALTER TABLE public.source_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view source integrations"
ON public.source_integrations FOR SELECT TO authenticated
USING (company_id = get_current_company_id() OR is_super_admin());

CREATE POLICY "Admins can manage source integrations"
ON public.source_integrations FOR ALL TO authenticated
USING (company_id = get_current_company_id() AND is_company_admin() OR is_super_admin());

CREATE POLICY "Members can view instagram connection"
ON public.instagram_connections FOR SELECT TO authenticated
USING (company_id = get_current_company_id() OR is_super_admin());

CREATE POLICY "Admins can manage instagram connection"
ON public.instagram_connections FOR ALL TO authenticated
USING (company_id = get_current_company_id() AND is_company_admin() OR is_super_admin());

CREATE POLICY "Users can view own tickets"
ON public.support_tickets FOR SELECT TO authenticated
USING (user_id = auth.uid() OR is_super_admin());

CREATE POLICY "Admins can view company tickets"
ON public.support_tickets FOR SELECT TO authenticated
USING (company_id = get_current_company_id() AND is_company_admin() OR is_super_admin());

CREATE POLICY "Authenticated can insert tickets"
ON public.support_tickets FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "SuperAdmin can update tickets"
ON public.support_tickets FOR UPDATE TO authenticated
USING (is_super_admin());

-- ===========================================
-- TRIGGERS
-- ===========================================
CREATE TRIGGER on_source_integrations_updated
    BEFORE UPDATE ON public.source_integrations
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER on_instagram_connections_updated
    BEFORE UPDATE ON public.instagram_connections
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER on_support_tickets_updated
    BEFORE UPDATE ON public.support_tickets
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
