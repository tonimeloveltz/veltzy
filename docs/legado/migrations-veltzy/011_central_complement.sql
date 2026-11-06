-- ===========================================
-- COMPLEMENTO: tabelas e functions faltantes no Central
-- ===========================================

-- Tabelas faltantes
CREATE TABLE IF NOT EXISTS veltzy.system_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
    key TEXT NOT NULL,
    value JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, key)
);

CREATE TABLE IF NOT EXISTS veltzy.activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id UUID,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS veltzy.company_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
    email TEXT NOT NULL,
    role public.app_role NOT NULL DEFAULT 'seller',
    invite_code TEXT NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
    invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    accepted_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS veltzy.support_tickets (
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

-- RLS nas tabelas novas
ALTER TABLE veltzy.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE veltzy.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE veltzy.company_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE veltzy.support_tickets ENABLE ROW LEVEL SECURITY;

-- Functions faltantes
CREATE OR REPLACE FUNCTION veltzy.get_current_company_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, veltzy
AS $$ SELECT company_id FROM public.profiles WHERE user_id = auth.uid() $$;

CREATE OR REPLACE FUNCTION veltzy.get_current_profile_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, veltzy
AS $$ SELECT id FROM public.profiles WHERE user_id = auth.uid() $$;

CREATE OR REPLACE FUNCTION veltzy.is_super_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, veltzy
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin') $$;

CREATE OR REPLACE FUNCTION veltzy.is_company_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, veltzy
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')) $$;

CREATE OR REPLACE FUNCTION veltzy.is_admin_or_manager()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, veltzy
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'manager', 'super_admin')) $$;

CREATE OR REPLACE FUNCTION veltzy.log_lead_activity()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO veltzy.activity_logs (company_id, user_id, action, resource_type, resource_id, metadata)
        VALUES (NEW.company_id, auth.uid(), 'created', 'lead', NEW.id, jsonb_build_object('name', NEW.name, 'phone', NEW.phone));
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.stage_id != NEW.stage_id THEN
            INSERT INTO veltzy.activity_logs (company_id, user_id, action, resource_type, resource_id, metadata)
            VALUES (NEW.company_id, auth.uid(), 'stage_changed', 'lead', NEW.id, jsonb_build_object('from_stage', OLD.stage_id, 'to_stage', NEW.stage_id));
        END IF;
        IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
            INSERT INTO veltzy.activity_logs (company_id, user_id, action, resource_type, resource_id, metadata)
            VALUES (NEW.company_id, auth.uid(), 'assigned', 'lead', NEW.id, jsonb_build_object('from', OLD.assigned_to, 'to', NEW.assigned_to));
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = veltzy, public;

CREATE OR REPLACE FUNCTION veltzy.log_availability_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.is_available IS DISTINCT FROM NEW.is_available THEN
        INSERT INTO veltzy.activity_logs (company_id, user_id, action, resource_type, resource_id, metadata)
        VALUES (NEW.company_id, auth.uid(),
            CASE WHEN NEW.is_available THEN 'seller_available' ELSE 'seller_unavailable' END,
            'profile', NEW.id, jsonb_build_object('is_available', NEW.is_available));
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = veltzy, public;

CREATE OR REPLACE FUNCTION veltzy.create_default_settings()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO veltzy.system_settings (company_id, key, value) VALUES
        (NEW.id, 'theme_config', '{"card_style": "glass", "sidebar_style": "expanded"}'::jsonb),
        (NEW.id, 'sdr_config', '{"enabled": false, "model": "gpt-4o-mini", "prompt": ""}'::jsonb),
        (NEW.id, 'business_rules', '{"fallback_role": "admin", "auto_reply_enabled": false, "fallback_lead_owner": null}'::jsonb);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = veltzy, public;

-- Triggers faltantes (DROP IF EXISTS para evitar duplicacao)
DROP TRIGGER IF EXISTS on_lead_activity ON veltzy.leads;
CREATE TRIGGER on_lead_activity AFTER INSERT OR UPDATE ON veltzy.leads FOR EACH ROW EXECUTE FUNCTION veltzy.log_lead_activity();

DROP TRIGGER IF EXISTS on_system_settings_updated ON veltzy.system_settings;
CREATE TRIGGER on_system_settings_updated BEFORE UPDATE ON veltzy.system_settings FOR EACH ROW EXECUTE FUNCTION veltzy.handle_updated_at();

DROP TRIGGER IF EXISTS on_support_tickets_updated ON veltzy.support_tickets;
CREATE TRIGGER on_support_tickets_updated BEFORE UPDATE ON veltzy.support_tickets FOR EACH ROW EXECUTE FUNCTION veltzy.handle_updated_at();

-- Triggers em public.* para onboarding
DROP TRIGGER IF EXISTS veltzy_on_company_created_settings ON public.companies;
CREATE TRIGGER veltzy_on_company_created_settings AFTER INSERT ON public.companies FOR EACH ROW EXECUTE FUNCTION veltzy.create_default_settings();

DROP TRIGGER IF EXISTS veltzy_on_profile_availability ON public.profiles;
CREATE TRIGGER veltzy_on_profile_availability AFTER UPDATE OF is_available ON public.profiles FOR EACH ROW EXECUTE FUNCTION veltzy.log_availability_change();

-- RLS policies nas tabelas novas
CREATE POLICY "vz_ss_select" ON veltzy.system_settings FOR SELECT TO authenticated USING (company_id = veltzy.get_current_company_id() OR veltzy.is_super_admin());
CREATE POLICY "vz_ss_all" ON veltzy.system_settings FOR ALL TO authenticated USING (company_id = veltzy.get_current_company_id() AND veltzy.is_company_admin() OR veltzy.is_super_admin());

CREATE POLICY "vz_al_select" ON veltzy.activity_logs FOR SELECT TO authenticated USING (company_id = veltzy.get_current_company_id() OR veltzy.is_super_admin());
CREATE POLICY "vz_al_insert" ON veltzy.activity_logs FOR INSERT TO authenticated WITH CHECK (company_id = veltzy.get_current_company_id() OR veltzy.is_super_admin());

CREATE POLICY "vz_ci_all" ON veltzy.company_invites FOR ALL TO authenticated USING (company_id = veltzy.get_current_company_id() AND veltzy.is_company_admin() OR veltzy.is_super_admin());
CREATE POLICY "vz_ci_select" ON veltzy.company_invites FOR SELECT TO authenticated USING (true);

CREATE POLICY "vz_st_select" ON veltzy.support_tickets FOR SELECT TO authenticated USING (user_id = auth.uid() OR veltzy.is_super_admin());
CREATE POLICY "vz_st_insert" ON veltzy.support_tickets FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "vz_st_update" ON veltzy.support_tickets FOR UPDATE TO authenticated USING (veltzy.is_super_admin());

-- Indices
CREATE INDEX IF NOT EXISTS idx_vz_activity_company_created ON veltzy.activity_logs(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vz_support_tickets_status ON veltzy.support_tickets(status, created_at DESC);

-- Grants
GRANT USAGE ON SCHEMA veltzy TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA veltzy TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA veltzy TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA veltzy TO authenticated;
GRANT USAGE ON SCHEMA veltzy TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA veltzy TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA veltzy TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA veltzy TO service_role;
