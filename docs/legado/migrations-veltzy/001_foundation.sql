-- ===========================================
-- ENUMS
-- ===========================================
CREATE TYPE public.app_role AS ENUM ('super_admin', 'admin', 'manager', 'seller');
CREATE TYPE public.lead_status AS ENUM ('new', 'qualifying', 'open', 'deal', 'lost');
CREATE TYPE public.lead_temperature AS ENUM ('cold', 'warm', 'hot', 'fire');
CREATE TYPE public.sender_type AS ENUM ('ai', 'human', 'lead');
CREATE TYPE public.conversation_status AS ENUM ('unread', 'read', 'replied', 'waiting_client', 'waiting_internal', 'resolved');
CREATE TYPE public.integration_type AS ENUM ('manual', 'webhook', 'whatsapp_api', 'instagram_api', 'linkedin_api');

-- ===========================================
-- TABELAS CORE (FASE 1)
-- ===========================================

-- Empresas (tenants)
CREATE TABLE public.companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    logo_url TEXT,
    primary_color TEXT DEFAULT '158 64% 42%',
    secondary_color TEXT DEFAULT '240 5% 92%',
    features JSONB DEFAULT '{
        "whatsapp_enabled": false,
        "instagram_enabled": false,
        "ai_sdr_enabled": false,
        "custom_pipeline": false,
        "export_reports": false,
        "automation_rules": false,
        "max_users": 5,
        "max_leads": 500
    }'::jsonb,
    settings JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Perfis de usuarios
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
    email TEXT NOT NULL,
    name TEXT NOT NULL,
    is_available BOOLEAN NOT NULL DEFAULT true,
    last_seen_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Roles (tabela separada para seguranca)
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL DEFAULT 'seller',
    UNIQUE (user_id, role)
);

-- Configuracoes dinamicas por empresa
CREATE TABLE public.system_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
    key TEXT NOT NULL,
    value JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, key)
);

-- Pipeline stages
CREATE TABLE public.pipeline_stages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    color TEXT NOT NULL DEFAULT '#6B7280',
    is_final BOOLEAN NOT NULL DEFAULT false,
    is_positive BOOLEAN,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Origens de lead
CREATE TABLE public.lead_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#6B7280',
    icon_name TEXT NOT NULL DEFAULT 'User',
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_system BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===========================================
-- FUNCOES AUXILIARES
-- ===========================================

-- Updated at trigger
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Verificar role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = _user_id AND role = _role
    )
$$;

-- E super admin?
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role = 'super_admin'
    )
$$;

-- Company ID do usuario atual
CREATE OR REPLACE FUNCTION public.get_current_company_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT company_id FROM public.profiles WHERE user_id = auth.uid()
$$;

-- Profile ID do usuario atual
CREATE OR REPLACE FUNCTION public.get_current_profile_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT id FROM public.profiles WHERE user_id = auth.uid()
$$;

-- Pertence a empresa?
CREATE OR REPLACE FUNCTION public.belongs_to_company(_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE user_id = auth.uid() AND company_id = _company_id
    )
$$;

-- E admin da empresa?
CREATE OR REPLACE FUNCTION public.is_company_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')
    )
$$;

-- E admin ou manager?
CREATE OR REPLACE FUNCTION public.is_admin_or_manager()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role IN ('admin', 'manager', 'super_admin')
    )
$$;

-- Pode criar empresa?
CREATE OR REPLACE FUNCTION public.can_create_company()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE user_id = auth.uid() AND company_id IS NOT NULL
    )
$$;

-- ===========================================
-- TRIGGERS DE ONBOARDING
-- ===========================================

-- Criar profile + role seller ao cadastrar
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (user_id, email, name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1))
    );

    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'seller');

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Primeiro usuario da empresa vira admin
CREATE OR REPLACE FUNCTION public.assign_admin_role_on_first_company()
RETURNS TRIGGER AS $$
DECLARE
    _member_count INTEGER;
BEGIN
    IF NEW.company_id IS NOT NULL AND (OLD.company_id IS NULL OR OLD.company_id != NEW.company_id) THEN
        SELECT COUNT(*) INTO _member_count
        FROM public.profiles
        WHERE company_id = NEW.company_id AND id != NEW.id;

        IF _member_count = 0 THEN
            INSERT INTO public.user_roles (user_id, role)
            VALUES (NEW.user_id, 'admin')
            ON CONFLICT (user_id, role) DO NOTHING;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_profile_company_assigned
    AFTER UPDATE OF company_id ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.assign_admin_role_on_first_company();

-- Pipeline padrao ao criar empresa
CREATE OR REPLACE FUNCTION public.create_default_pipeline_for_company()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.pipeline_stages (company_id, name, slug, position, color, is_final, is_positive) VALUES
        (NEW.id, 'Novo Lead', 'novo-lead', 0, '#3B82F6', false, null),
        (NEW.id, 'Qualificando', 'qualificando', 1, '#F59E0B', false, null),
        (NEW.id, 'Em Negociacao', 'em-negociacao', 2, '#8B5CF6', false, null),
        (NEW.id, 'Proposta Enviada', 'proposta-enviada', 3, '#06B6D4', false, null),
        (NEW.id, 'Fechado (Ganho)', 'fechado-ganho', 4, '#22C55E', true, true),
        (NEW.id, 'Perdido', 'perdido', 5, '#EF4444', true, false);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_company_created_pipeline
    AFTER INSERT ON public.companies
    FOR EACH ROW EXECUTE FUNCTION public.create_default_pipeline_for_company();

-- Origens padrao ao criar empresa
CREATE OR REPLACE FUNCTION public.create_default_lead_sources_for_company()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.lead_sources (company_id, name, slug, color, icon_name, is_system) VALUES
        (NEW.id, 'WhatsApp', 'whatsapp', '#25D366', 'MessageCircle', true),
        (NEW.id, 'Instagram', 'instagram', '#E4405F', 'Instagram', true),
        (NEW.id, 'Manual', 'manual', '#6B7280', 'UserPlus', true);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_company_created_sources
    AFTER INSERT ON public.companies
    FOR EACH ROW EXECUTE FUNCTION public.create_default_lead_sources_for_company();

-- Settings padrao ao criar empresa
CREATE OR REPLACE FUNCTION public.create_default_settings_for_company()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.system_settings (company_id, key, value) VALUES
        (NEW.id, 'theme_config', '{"card_style": "glass", "sidebar_style": "expanded"}'::jsonb),
        (NEW.id, 'sdr_config', '{"enabled": false, "model": "gpt-4o-mini", "prompt": ""}'::jsonb),
        (NEW.id, 'business_rules', '{"fallback_role": "admin", "auto_reply_enabled": false}'::jsonb);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_company_created_settings
    AFTER INSERT ON public.companies
    FOR EACH ROW EXECUTE FUNCTION public.create_default_settings_for_company();

-- ===========================================
-- RLS POLICIES
-- ===========================================

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_sources ENABLE ROW LEVEL SECURITY;

-- Companies
CREATE POLICY "Members can view own company"
ON public.companies FOR SELECT TO authenticated
USING (id = get_current_company_id() OR is_super_admin());

CREATE POLICY "Authenticated can insert company"
ON public.companies FOR INSERT TO authenticated
WITH CHECK (can_create_company());

CREATE POLICY "Admins can update own company"
ON public.companies FOR UPDATE TO authenticated
USING (id = get_current_company_id() AND is_company_admin() OR is_super_admin());

-- Profiles
CREATE POLICY "Members can view company profiles"
ON public.profiles FOR SELECT TO authenticated
USING (company_id = get_current_company_id() OR user_id = auth.uid() OR is_super_admin());

CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can insert own profile"
ON public.profiles FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

-- User Roles
CREATE POLICY "Users can view own roles"
ON public.user_roles FOR SELECT TO authenticated
USING (user_id = auth.uid() OR is_super_admin());

CREATE POLICY "Admins can view company roles"
ON public.user_roles FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.user_id = user_roles.user_id
        AND p.company_id = get_current_company_id()
    )
    AND is_company_admin()
);

CREATE POLICY "Admins can manage roles"
ON public.user_roles FOR ALL TO authenticated
USING (is_company_admin() OR is_super_admin());

-- System Settings
CREATE POLICY "Members can view company settings"
ON public.system_settings FOR SELECT TO authenticated
USING (company_id = get_current_company_id() OR is_super_admin());

CREATE POLICY "Admins can manage company settings"
ON public.system_settings FOR ALL TO authenticated
USING (company_id = get_current_company_id() AND is_company_admin() OR is_super_admin());

-- Pipeline Stages
CREATE POLICY "Members can view company stages"
ON public.pipeline_stages FOR SELECT TO authenticated
USING (company_id = get_current_company_id() OR is_super_admin());

CREATE POLICY "Admins can manage company stages"
ON public.pipeline_stages FOR ALL TO authenticated
USING (company_id = get_current_company_id() AND is_company_admin() OR is_super_admin());

-- Lead Sources
CREATE POLICY "Members can view company sources"
ON public.lead_sources FOR SELECT TO authenticated
USING (company_id = get_current_company_id() OR is_super_admin());

CREATE POLICY "Admins can manage company sources"
ON public.lead_sources FOR ALL TO authenticated
USING (company_id = get_current_company_id() AND is_company_admin() OR is_super_admin());

-- ===========================================
-- UPDATED_AT TRIGGERS
-- ===========================================
CREATE TRIGGER on_companies_updated BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER on_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER on_system_settings_updated BEFORE UPDATE ON public.system_settings FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER on_pipeline_stages_updated BEFORE UPDATE ON public.pipeline_stages FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER on_lead_sources_updated BEFORE UPDATE ON public.lead_sources FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
