-- ===========================================
-- MIGRACAO PARA SUPABASE CENTRAL
-- Schema veltzy.* com FKs para public.*
-- public.companies, public.profiles, public.user_roles ja existem
-- ===========================================

CREATE SCHEMA IF NOT EXISTS veltzy;

-- ===========================================
-- ENUMS (no schema veltzy, com fallback para public se ja existirem)
-- ===========================================
DO $$ BEGIN CREATE TYPE veltzy.lead_status AS ENUM ('new', 'qualifying', 'open', 'deal', 'lost'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE veltzy.lead_temperature AS ENUM ('cold', 'warm', 'hot', 'fire'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE veltzy.sender_type AS ENUM ('ai', 'human', 'lead'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE veltzy.conversation_status AS ENUM ('unread', 'read', 'replied', 'waiting_client', 'waiting_internal', 'resolved'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE veltzy.integration_type AS ENUM ('manual', 'webhook', 'whatsapp_api', 'instagram_api', 'linkedin_api'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ===========================================
-- TABELAS CORE
-- ===========================================

CREATE TABLE veltzy.system_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
    key TEXT NOT NULL,
    value JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, key)
);

CREATE TABLE veltzy.pipeline_stages (
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

CREATE TABLE veltzy.lead_sources (
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

CREATE TABLE veltzy.leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
    name TEXT,
    phone TEXT NOT NULL,
    email TEXT,
    instagram_id TEXT,
    linkedin_id TEXT,
    source_id UUID REFERENCES veltzy.lead_sources(id) ON DELETE SET NULL,
    stage_id UUID REFERENCES veltzy.pipeline_stages(id) ON DELETE SET NULL,
    status veltzy.lead_status NOT NULL DEFAULT 'new',
    temperature veltzy.lead_temperature NOT NULL DEFAULT 'cold',
    ai_score INTEGER NOT NULL DEFAULT 0 CHECK (ai_score >= 0 AND ai_score <= 100),
    assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    is_ai_active BOOLEAN NOT NULL DEFAULT false,
    is_queued BOOLEAN NOT NULL DEFAULT false,
    conversation_status veltzy.conversation_status NOT NULL DEFAULT 'unread',
    tags TEXT[] NOT NULL DEFAULT '{}',
    deal_value NUMERIC(12,2),
    observations TEXT,
    avatar_url TEXT,
    ad_context JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, phone)
);

CREATE TABLE veltzy.pipeline_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pipeline_id UUID REFERENCES veltzy.pipeline_stages(id) ON DELETE CASCADE NOT NULL,
    source_id UUID REFERENCES veltzy.lead_sources(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (pipeline_id, source_id)
);

CREATE TABLE veltzy.activity_logs (
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
-- TABELAS INBOX
-- ===========================================

CREATE TABLE veltzy.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES veltzy.leads(id) ON DELETE CASCADE NOT NULL,
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    sender_type veltzy.sender_type NOT NULL,
    message_type TEXT NOT NULL DEFAULT 'text'
        CHECK (message_type IN ('text', 'image', 'audio', 'video', 'document', 'sticker', 'location', 'contact')),
    file_url TEXT,
    file_name TEXT,
    file_mime_type TEXT,
    file_size INTEGER,
    source TEXT NOT NULL DEFAULT 'manual'
        CHECK (source IN ('whatsapp', 'instagram', 'linkedin', 'manual')),
    external_id TEXT,
    replied_message_id UUID REFERENCES veltzy.messages(id) ON DELETE SET NULL,
    is_scheduled BOOLEAN NOT NULL DEFAULT false,
    scheduled_at TIMESTAMPTZ,
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE veltzy.whatsapp_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL UNIQUE,
    instance_id TEXT NOT NULL,
    instance_token TEXT NOT NULL,
    client_token TEXT NOT NULL,
    phone_number TEXT,
    status TEXT NOT NULL DEFAULT 'disconnected'
        CHECK (status IN ('connected', 'disconnected', 'connecting', 'error')),
    qr_code TEXT,
    connected_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE veltzy.reply_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'geral',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===========================================
-- TABELAS AUTOMACOES
-- ===========================================

CREATE TABLE veltzy.automation_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    trigger_type TEXT NOT NULL
        CHECK (trigger_type IN ('lead_created', 'lead_stage_changed', 'lead_temperature_changed', 'message_received', 'no_response', 'deal_closed', 'lead_lost')),
    conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
    action_type TEXT NOT NULL
        CHECK (action_type IN ('send_message', 'change_stage', 'assign_lead', 'add_tag', 'remove_tag', 'update_temperature', 'send_webhook', 'notify_team')),
    action_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    priority INTEGER NOT NULL DEFAULT 0,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE veltzy.automation_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
    rule_id UUID REFERENCES veltzy.automation_rules(id) ON DELETE SET NULL,
    lead_id UUID REFERENCES veltzy.leads(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'success'
        CHECK (status IN ('success', 'failed', 'skipped')),
    trigger_data JSONB DEFAULT '{}'::jsonb,
    old_value JSONB,
    new_value JSONB,
    error_message TEXT,
    executed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE veltzy.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    type TEXT NOT NULL
        CHECK (type IN ('new_lead', 'lead_assigned', 'new_message', 'lead_transferred', 'system')),
    title TEXT NOT NULL,
    body TEXT,
    action_type TEXT,
    action_data JSONB DEFAULT '{}'::jsonb,
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===========================================
-- TABELAS ADMIN
-- ===========================================

CREATE TABLE veltzy.company_invites (
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

CREATE TABLE veltzy.source_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
    source_id UUID REFERENCES veltzy.lead_sources(id) ON DELETE CASCADE NOT NULL,
    integration_type TEXT NOT NULL
        CHECK (integration_type IN ('manual', 'webhook', 'whatsapp_api', 'instagram_api', 'linkedin_api')),
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, source_id, integration_type)
);

CREATE TABLE veltzy.instagram_connections (
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

CREATE TABLE veltzy.support_tickets (
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

CREATE TABLE veltzy.payment_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
    provider TEXT NOT NULL CHECK (provider IN ('asaas', 'stripe', 'mercadopago')),
    api_key TEXT NOT NULL,
    api_secret TEXT,
    webhook_secret TEXT,
    environment TEXT NOT NULL DEFAULT 'production' CHECK (environment IN ('sandbox', 'production')),
    is_active BOOLEAN NOT NULL DEFAULT false,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, provider)
);

-- ===========================================
-- FUNCTIONS
-- ===========================================

CREATE OR REPLACE FUNCTION veltzy.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION veltzy.get_current_company_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, veltzy
AS $$
    SELECT company_id FROM public.profiles WHERE user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION veltzy.get_current_profile_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, veltzy
AS $$
    SELECT id FROM public.profiles WHERE user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION veltzy.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, veltzy
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role = 'super_admin'
    )
$$;

CREATE OR REPLACE FUNCTION veltzy.is_company_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, veltzy
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')
    )
$$;

CREATE OR REPLACE FUNCTION veltzy.is_admin_or_manager()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, veltzy
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role IN ('admin', 'manager', 'super_admin')
    )
$$;

-- Sync lead status from stage
CREATE OR REPLACE FUNCTION veltzy.sync_lead_status_from_stage()
RETURNS TRIGGER AS $$
DECLARE
    _stage RECORD;
BEGIN
    IF NEW.stage_id IS NOT NULL AND NEW.stage_id != OLD.stage_id THEN
        SELECT is_final, is_positive INTO _stage
        FROM veltzy.pipeline_stages WHERE id = NEW.stage_id;
        IF _stage.is_final THEN
            NEW.status = CASE WHEN _stage.is_positive THEN 'deal'::veltzy.lead_status ELSE 'lost'::veltzy.lead_status END;
        ELSE
            IF OLD.status IN ('deal', 'lost') THEN
                NEW.status = 'open'::veltzy.lead_status;
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = veltzy, public;

-- Log lead activity
CREATE OR REPLACE FUNCTION veltzy.log_lead_activity()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO veltzy.activity_logs (company_id, user_id, action, resource_type, resource_id, metadata)
        VALUES (NEW.company_id, auth.uid(), 'created', 'lead', NEW.id, jsonb_build_object('name', NEW.name, 'phone', NEW.phone));
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.stage_id != NEW.stage_id THEN
            INSERT INTO veltzy.activity_logs (company_id, user_id, action, resource_type, resource_id, metadata)
            VALUES (NEW.company_id, auth.uid(), 'stage_changed', 'lead', NEW.id,
                jsonb_build_object('from_stage', OLD.stage_id, 'to_stage', NEW.stage_id));
        END IF;
        IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
            INSERT INTO veltzy.activity_logs (company_id, user_id, action, resource_type, resource_id, metadata)
            VALUES (NEW.company_id, auth.uid(), 'assigned', 'lead', NEW.id,
                jsonb_build_object('from', OLD.assigned_to, 'to', NEW.assigned_to));
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = veltzy, public;

-- Handle new message
CREATE OR REPLACE FUNCTION veltzy.handle_new_message()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.sender_type = 'lead' THEN
        UPDATE veltzy.leads SET conversation_status = 'unread', updated_at = now()
        WHERE id = NEW.lead_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = veltzy, public;

-- Log availability change
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

-- Default pipeline for new company
CREATE OR REPLACE FUNCTION veltzy.create_default_pipeline()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO veltzy.pipeline_stages (company_id, name, slug, position, color, is_final, is_positive) VALUES
        (NEW.id, 'Novo Lead', 'novo-lead', 0, '#3B82F6', false, null),
        (NEW.id, 'Qualificando', 'qualificando', 1, '#F59E0B', false, null),
        (NEW.id, 'Em Negociacao', 'em-negociacao', 2, '#8B5CF6', false, null),
        (NEW.id, 'Proposta Enviada', 'proposta-enviada', 3, '#06B6D4', false, null),
        (NEW.id, 'Fechado (Ganho)', 'fechado-ganho', 4, '#22C55E', true, true),
        (NEW.id, 'Perdido', 'perdido', 5, '#EF4444', true, false);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = veltzy, public;

-- Default lead sources for new company
CREATE OR REPLACE FUNCTION veltzy.create_default_sources()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO veltzy.lead_sources (company_id, name, slug, color, icon_name, is_system) VALUES
        (NEW.id, 'WhatsApp', 'whatsapp', '#25D366', 'MessageCircle', true),
        (NEW.id, 'Instagram', 'instagram', '#E4405F', 'Instagram', true),
        (NEW.id, 'Manual', 'manual', '#6B7280', 'UserPlus', true);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = veltzy, public;

-- Default settings for new company
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

-- ===========================================
-- TRIGGERS
-- ===========================================

-- Triggers em tabelas veltzy.*
CREATE TRIGGER on_lead_stage_changed BEFORE UPDATE OF stage_id ON veltzy.leads FOR EACH ROW EXECUTE FUNCTION veltzy.sync_lead_status_from_stage();
CREATE TRIGGER on_lead_activity AFTER INSERT OR UPDATE ON veltzy.leads FOR EACH ROW EXECUTE FUNCTION veltzy.log_lead_activity();
CREATE TRIGGER on_leads_updated BEFORE UPDATE ON veltzy.leads FOR EACH ROW EXECUTE FUNCTION veltzy.handle_updated_at();
CREATE TRIGGER on_message_received AFTER INSERT ON veltzy.messages FOR EACH ROW EXECUTE FUNCTION veltzy.handle_new_message();
CREATE TRIGGER on_system_settings_updated BEFORE UPDATE ON veltzy.system_settings FOR EACH ROW EXECUTE FUNCTION veltzy.handle_updated_at();
CREATE TRIGGER on_pipeline_stages_updated BEFORE UPDATE ON veltzy.pipeline_stages FOR EACH ROW EXECUTE FUNCTION veltzy.handle_updated_at();
CREATE TRIGGER on_lead_sources_updated BEFORE UPDATE ON veltzy.lead_sources FOR EACH ROW EXECUTE FUNCTION veltzy.handle_updated_at();
CREATE TRIGGER on_whatsapp_configs_updated BEFORE UPDATE ON veltzy.whatsapp_configs FOR EACH ROW EXECUTE FUNCTION veltzy.handle_updated_at();
CREATE TRIGGER on_reply_templates_updated BEFORE UPDATE ON veltzy.reply_templates FOR EACH ROW EXECUTE FUNCTION veltzy.handle_updated_at();
CREATE TRIGGER on_automation_rules_updated BEFORE UPDATE ON veltzy.automation_rules FOR EACH ROW EXECUTE FUNCTION veltzy.handle_updated_at();
CREATE TRIGGER on_source_integrations_updated BEFORE UPDATE ON veltzy.source_integrations FOR EACH ROW EXECUTE FUNCTION veltzy.handle_updated_at();
CREATE TRIGGER on_instagram_connections_updated BEFORE UPDATE ON veltzy.instagram_connections FOR EACH ROW EXECUTE FUNCTION veltzy.handle_updated_at();
CREATE TRIGGER on_support_tickets_updated BEFORE UPDATE ON veltzy.support_tickets FOR EACH ROW EXECUTE FUNCTION veltzy.handle_updated_at();
CREATE TRIGGER on_payment_configs_updated BEFORE UPDATE ON veltzy.payment_configs FOR EACH ROW EXECUTE FUNCTION veltzy.handle_updated_at();

-- Triggers em tabelas public.* (onboarding de empresa cria dados no veltzy)
CREATE TRIGGER veltzy_on_company_created_pipeline AFTER INSERT ON public.companies FOR EACH ROW EXECUTE FUNCTION veltzy.create_default_pipeline();
CREATE TRIGGER veltzy_on_company_created_sources AFTER INSERT ON public.companies FOR EACH ROW EXECUTE FUNCTION veltzy.create_default_sources();
CREATE TRIGGER veltzy_on_company_created_settings AFTER INSERT ON public.companies FOR EACH ROW EXECUTE FUNCTION veltzy.create_default_settings();
CREATE TRIGGER veltzy_on_profile_availability AFTER UPDATE OF is_available ON public.profiles FOR EACH ROW EXECUTE FUNCTION veltzy.log_availability_change();

-- ===========================================
-- RLS
-- ===========================================

ALTER TABLE veltzy.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE veltzy.pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE veltzy.lead_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE veltzy.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE veltzy.pipeline_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE veltzy.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE veltzy.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE veltzy.whatsapp_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE veltzy.reply_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE veltzy.automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE veltzy.automation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE veltzy.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE veltzy.company_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE veltzy.source_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE veltzy.instagram_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE veltzy.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE veltzy.payment_configs ENABLE ROW LEVEL SECURITY;

-- System Settings
CREATE POLICY "vz_ss_select" ON veltzy.system_settings FOR SELECT TO authenticated USING (company_id = veltzy.get_current_company_id() OR veltzy.is_super_admin());
CREATE POLICY "vz_ss_all" ON veltzy.system_settings FOR ALL TO authenticated USING (company_id = veltzy.get_current_company_id() AND veltzy.is_company_admin() OR veltzy.is_super_admin());

-- Pipeline Stages
CREATE POLICY "vz_ps_select" ON veltzy.pipeline_stages FOR SELECT TO authenticated USING (company_id = veltzy.get_current_company_id() OR veltzy.is_super_admin());
CREATE POLICY "vz_ps_all" ON veltzy.pipeline_stages FOR ALL TO authenticated USING (company_id = veltzy.get_current_company_id() AND veltzy.is_company_admin() OR veltzy.is_super_admin());

-- Lead Sources
CREATE POLICY "vz_ls_select" ON veltzy.lead_sources FOR SELECT TO authenticated USING (company_id = veltzy.get_current_company_id() OR veltzy.is_super_admin());
CREATE POLICY "vz_ls_all" ON veltzy.lead_sources FOR ALL TO authenticated USING (company_id = veltzy.get_current_company_id() AND veltzy.is_company_admin() OR veltzy.is_super_admin());

-- Leads
CREATE POLICY "vz_leads_select" ON veltzy.leads FOR SELECT TO authenticated USING (company_id = veltzy.get_current_company_id() AND (veltzy.is_admin_or_manager() OR assigned_to = veltzy.get_current_profile_id()) OR veltzy.is_super_admin());
CREATE POLICY "vz_leads_insert" ON veltzy.leads FOR INSERT TO authenticated WITH CHECK (company_id = veltzy.get_current_company_id() OR veltzy.is_super_admin());
CREATE POLICY "vz_leads_update" ON veltzy.leads FOR UPDATE TO authenticated USING (company_id = veltzy.get_current_company_id() AND (veltzy.is_admin_or_manager() OR assigned_to = veltzy.get_current_profile_id()) OR veltzy.is_super_admin());
CREATE POLICY "vz_leads_delete" ON veltzy.leads FOR DELETE TO authenticated USING (company_id = veltzy.get_current_company_id() AND veltzy.is_company_admin() OR veltzy.is_super_admin());

-- Messages
CREATE POLICY "vz_msg_select" ON veltzy.messages FOR SELECT TO authenticated USING (company_id = veltzy.get_current_company_id() AND (veltzy.is_admin_or_manager() OR EXISTS (SELECT 1 FROM veltzy.leads WHERE leads.id = messages.lead_id AND leads.assigned_to = veltzy.get_current_profile_id())) OR veltzy.is_super_admin());
CREATE POLICY "vz_msg_insert" ON veltzy.messages FOR INSERT TO authenticated WITH CHECK (company_id = veltzy.get_current_company_id() OR veltzy.is_super_admin());

-- Activity Logs
CREATE POLICY "vz_al_select" ON veltzy.activity_logs FOR SELECT TO authenticated USING (company_id = veltzy.get_current_company_id() OR veltzy.is_super_admin());
CREATE POLICY "vz_al_insert" ON veltzy.activity_logs FOR INSERT TO authenticated WITH CHECK (company_id = veltzy.get_current_company_id() OR veltzy.is_super_admin());

-- WhatsApp Configs
CREATE POLICY "vz_wa_select" ON veltzy.whatsapp_configs FOR SELECT TO authenticated USING (company_id = veltzy.get_current_company_id() OR veltzy.is_super_admin());
CREATE POLICY "vz_wa_all" ON veltzy.whatsapp_configs FOR ALL TO authenticated USING (company_id = veltzy.get_current_company_id() AND veltzy.is_company_admin() OR veltzy.is_super_admin());

-- Reply Templates
CREATE POLICY "vz_rt_select" ON veltzy.reply_templates FOR SELECT TO authenticated USING (company_id = veltzy.get_current_company_id() OR veltzy.is_super_admin());
CREATE POLICY "vz_rt_all" ON veltzy.reply_templates FOR ALL TO authenticated USING (company_id = veltzy.get_current_company_id() AND veltzy.is_company_admin() OR veltzy.is_super_admin());

-- Automation Rules
CREATE POLICY "vz_ar_select" ON veltzy.automation_rules FOR SELECT TO authenticated USING (company_id = veltzy.get_current_company_id() OR veltzy.is_super_admin());
CREATE POLICY "vz_ar_all" ON veltzy.automation_rules FOR ALL TO authenticated USING (company_id = veltzy.get_current_company_id() AND veltzy.is_admin_or_manager() OR veltzy.is_super_admin());

-- Automation Logs
CREATE POLICY "vz_alog_select" ON veltzy.automation_logs FOR SELECT TO authenticated USING (company_id = veltzy.get_current_company_id() OR veltzy.is_super_admin());
CREATE POLICY "vz_alog_insert" ON veltzy.automation_logs FOR INSERT TO authenticated WITH CHECK (company_id = veltzy.get_current_company_id() OR veltzy.is_super_admin());

-- Notifications
CREATE POLICY "vz_notif_select" ON veltzy.notifications FOR SELECT TO authenticated USING (user_id = auth.uid() OR veltzy.is_super_admin());
CREATE POLICY "vz_notif_insert" ON veltzy.notifications FOR INSERT TO authenticated WITH CHECK (company_id = veltzy.get_current_company_id() OR veltzy.is_super_admin());
CREATE POLICY "vz_notif_update" ON veltzy.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- Company Invites
CREATE POLICY "vz_ci_all" ON veltzy.company_invites FOR ALL TO authenticated USING (company_id = veltzy.get_current_company_id() AND veltzy.is_company_admin() OR veltzy.is_super_admin());
CREATE POLICY "vz_ci_select" ON veltzy.company_invites FOR SELECT TO authenticated USING (true);

-- Pipeline Sources
CREATE POLICY "vz_piso_select" ON veltzy.pipeline_sources FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM veltzy.pipeline_stages ps WHERE ps.id = pipeline_sources.pipeline_id AND ps.company_id = veltzy.get_current_company_id()) OR veltzy.is_super_admin());

-- Source Integrations
CREATE POLICY "vz_si_select" ON veltzy.source_integrations FOR SELECT TO authenticated USING (company_id = veltzy.get_current_company_id() OR veltzy.is_super_admin());
CREATE POLICY "vz_si_all" ON veltzy.source_integrations FOR ALL TO authenticated USING (company_id = veltzy.get_current_company_id() AND veltzy.is_company_admin() OR veltzy.is_super_admin());

-- Instagram Connections
CREATE POLICY "vz_ig_select" ON veltzy.instagram_connections FOR SELECT TO authenticated USING (company_id = veltzy.get_current_company_id() OR veltzy.is_super_admin());
CREATE POLICY "vz_ig_all" ON veltzy.instagram_connections FOR ALL TO authenticated USING (company_id = veltzy.get_current_company_id() AND veltzy.is_company_admin() OR veltzy.is_super_admin());

-- Support Tickets
CREATE POLICY "vz_st_select" ON veltzy.support_tickets FOR SELECT TO authenticated USING (user_id = auth.uid() OR veltzy.is_super_admin());
CREATE POLICY "vz_st_insert" ON veltzy.support_tickets FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "vz_st_update" ON veltzy.support_tickets FOR UPDATE TO authenticated USING (veltzy.is_super_admin());

-- Payment Configs
CREATE POLICY "vz_pc_select" ON veltzy.payment_configs FOR SELECT TO authenticated USING (company_id = veltzy.get_current_company_id() AND veltzy.is_company_admin() OR veltzy.is_super_admin());
CREATE POLICY "vz_pc_all" ON veltzy.payment_configs FOR ALL TO authenticated USING (company_id = veltzy.get_current_company_id() AND veltzy.is_company_admin() OR veltzy.is_super_admin());

-- ===========================================
-- INDICES
-- ===========================================

CREATE INDEX idx_vz_leads_company_stage ON veltzy.leads(company_id, stage_id);
CREATE INDEX idx_vz_leads_company_assigned ON veltzy.leads(company_id, assigned_to);
CREATE INDEX idx_vz_leads_company_temp ON veltzy.leads(company_id, temperature);
CREATE INDEX idx_vz_leads_company_updated ON veltzy.leads(company_id, updated_at DESC);
CREATE INDEX idx_vz_leads_conversation ON veltzy.leads(company_id, conversation_status);
CREATE INDEX idx_vz_leads_queued ON veltzy.leads(company_id, is_queued) WHERE is_queued = true;
CREATE INDEX idx_vz_messages_lead ON veltzy.messages(lead_id);
CREATE INDEX idx_vz_messages_company ON veltzy.messages(company_id);
CREATE INDEX idx_vz_messages_created ON veltzy.messages(created_at DESC);
CREATE INDEX idx_vz_messages_lead_created ON veltzy.messages(lead_id, created_at DESC);
CREATE INDEX idx_vz_profiles_company_avail ON public.profiles(company_id, is_available);
CREATE INDEX idx_vz_activity_company_created ON veltzy.activity_logs(company_id, created_at DESC);
CREATE INDEX idx_vz_automation_rules_company ON veltzy.automation_rules(company_id, is_enabled);
CREATE INDEX idx_vz_automation_logs_company ON veltzy.automation_logs(company_id, executed_at DESC);
CREATE INDEX idx_vz_notifications_user ON veltzy.notifications(user_id, is_read, created_at DESC);
CREATE INDEX idx_vz_source_integrations ON veltzy.source_integrations(company_id);
CREATE INDEX idx_vz_support_tickets_status ON veltzy.support_tickets(status, created_at DESC);

-- ===========================================
-- REALTIME
-- ===========================================

ALTER PUBLICATION supabase_realtime ADD TABLE veltzy.leads;
ALTER PUBLICATION supabase_realtime ADD TABLE veltzy.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE veltzy.notifications;

-- ===========================================
-- GRANT schema access to authenticated role
-- ===========================================

GRANT USAGE ON SCHEMA veltzy TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA veltzy TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA veltzy TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA veltzy TO authenticated;

-- Also grant to anon for Edge Functions
GRANT USAGE ON SCHEMA veltzy TO anon;
GRANT SELECT ON ALL TABLES IN SCHEMA veltzy TO anon;

-- Service role (Edge Functions)
GRANT USAGE ON SCHEMA veltzy TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA veltzy TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA veltzy TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA veltzy TO service_role;
