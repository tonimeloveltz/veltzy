-- ===========================================
-- TABELAS DA FASE 2
-- ===========================================

-- Leads
CREATE TABLE public.leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
    name TEXT,
    phone TEXT NOT NULL,
    email TEXT,
    instagram_id TEXT,
    linkedin_id TEXT,
    source_id UUID REFERENCES public.lead_sources(id) ON DELETE SET NULL,
    stage_id UUID REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
    status lead_status NOT NULL DEFAULT 'new',
    temperature lead_temperature NOT NULL DEFAULT 'cold',
    ai_score INTEGER NOT NULL DEFAULT 0 CHECK (ai_score >= 0 AND ai_score <= 100),
    assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    is_ai_active BOOLEAN NOT NULL DEFAULT false,
    is_queued BOOLEAN NOT NULL DEFAULT false,
    conversation_status conversation_status NOT NULL DEFAULT 'unread',
    tags TEXT[] NOT NULL DEFAULT '{}',
    deal_value NUMERIC(12,2),
    observations TEXT,
    avatar_url TEXT,
    ad_context JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, phone)
);

-- Mapeamento N:N pipeline_stage <-> lead_source
CREATE TABLE public.pipeline_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pipeline_id UUID REFERENCES public.pipeline_stages(id) ON DELETE CASCADE NOT NULL,
    source_id UUID REFERENCES public.lead_sources(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (pipeline_id, source_id)
);

-- Activity logs (auditoria de leads)
CREATE TABLE public.activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id UUID,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===========================================
-- FUNCOES
-- ===========================================

-- Sincroniza lead.status quando stage muda (stage final -> deal ou lost)
CREATE OR REPLACE FUNCTION public.sync_lead_status_from_stage()
RETURNS TRIGGER AS $$
DECLARE
    _stage RECORD;
BEGIN
    IF NEW.stage_id IS NOT NULL AND NEW.stage_id != OLD.stage_id THEN
        SELECT is_final, is_positive INTO _stage
        FROM public.pipeline_stages WHERE id = NEW.stage_id;

        IF _stage.is_final THEN
            NEW.status = CASE WHEN _stage.is_positive THEN 'deal'::lead_status ELSE 'lost'::lead_status END;
        ELSE
            IF OLD.status IN ('deal', 'lost') THEN
                NEW.status = 'open'::lead_status;
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_lead_stage_changed
    BEFORE UPDATE OF stage_id ON public.leads
    FOR EACH ROW EXECUTE FUNCTION public.sync_lead_status_from_stage();

-- Log automatico de mudanca de stage
CREATE OR REPLACE FUNCTION public.log_lead_activity()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.activity_logs (company_id, user_id, action, resource_type, resource_id, metadata)
        VALUES (NEW.company_id, auth.uid(), 'created', 'lead', NEW.id, jsonb_build_object('name', NEW.name, 'phone', NEW.phone));
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.stage_id != NEW.stage_id THEN
            INSERT INTO public.activity_logs (company_id, user_id, action, resource_type, resource_id, metadata)
            VALUES (NEW.company_id, auth.uid(), 'stage_changed', 'lead', NEW.id,
                jsonb_build_object('from_stage', OLD.stage_id, 'to_stage', NEW.stage_id));
        END IF;
        IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
            INSERT INTO public.activity_logs (company_id, user_id, action, resource_type, resource_id, metadata)
            VALUES (NEW.company_id, auth.uid(), 'assigned', 'lead', NEW.id,
                jsonb_build_object('from', OLD.assigned_to, 'to', NEW.assigned_to));
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_lead_activity
    AFTER INSERT OR UPDATE ON public.leads
    FOR EACH ROW EXECUTE FUNCTION public.log_lead_activity();

-- ===========================================
-- RLS
-- ===========================================

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Leads: admins/managers veem todos, sellers veem apenas atribuidos
CREATE POLICY "Admins and managers see all leads"
ON public.leads FOR SELECT TO authenticated
USING (
    company_id = get_current_company_id()
    AND (is_admin_or_manager() OR assigned_to = get_current_profile_id())
    OR is_super_admin()
);

CREATE POLICY "Members can insert leads"
ON public.leads FOR INSERT TO authenticated
WITH CHECK (company_id = get_current_company_id() OR is_super_admin());

CREATE POLICY "Admins and managers can update any lead"
ON public.leads FOR UPDATE TO authenticated
USING (
    company_id = get_current_company_id()
    AND (is_admin_or_manager() OR assigned_to = get_current_profile_id())
    OR is_super_admin()
);

CREATE POLICY "Admins can delete leads"
ON public.leads FOR DELETE TO authenticated
USING (company_id = get_current_company_id() AND is_company_admin() OR is_super_admin());

-- Pipeline Sources
CREATE POLICY "Members can view pipeline sources"
ON public.pipeline_sources FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.pipeline_stages ps
        WHERE ps.id = pipeline_sources.pipeline_id
        AND ps.company_id = get_current_company_id()
    ) OR is_super_admin()
);

CREATE POLICY "Admins can manage pipeline sources"
ON public.pipeline_sources FOR ALL TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.pipeline_stages ps
        WHERE ps.id = pipeline_sources.pipeline_id
        AND ps.company_id = get_current_company_id()
        AND is_company_admin()
    ) OR is_super_admin()
);

-- Activity Logs
CREATE POLICY "Members can view company activity"
ON public.activity_logs FOR SELECT TO authenticated
USING (company_id = get_current_company_id() OR is_super_admin());

CREATE POLICY "System can insert activity logs"
ON public.activity_logs FOR INSERT TO authenticated
WITH CHECK (company_id = get_current_company_id() OR is_super_admin());

-- ===========================================
-- UPDATED_AT + REALTIME
-- ===========================================
CREATE TRIGGER on_leads_updated
    BEFORE UPDATE ON public.leads
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
