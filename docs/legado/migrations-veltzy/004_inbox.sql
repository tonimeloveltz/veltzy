-- ===========================================
-- TABELAS DA FASE 3
-- ===========================================

-- Mensagens do chat
CREATE TABLE public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE NOT NULL,
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    sender_type sender_type NOT NULL,
    message_type TEXT NOT NULL DEFAULT 'text'
        CHECK (message_type IN ('text', 'image', 'audio', 'video', 'document', 'sticker', 'location', 'contact')),
    file_url TEXT,
    file_name TEXT,
    file_mime_type TEXT,
    file_size INTEGER,
    source TEXT NOT NULL DEFAULT 'manual'
        CHECK (source IN ('whatsapp', 'instagram', 'linkedin', 'manual')),
    external_id TEXT,
    replied_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
    is_scheduled BOOLEAN NOT NULL DEFAULT false,
    scheduled_at TIMESTAMPTZ,
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Configuracao WhatsApp (Z-API) por empresa
CREATE TABLE public.whatsapp_configs (
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

-- Templates de resposta rapida
CREATE TABLE public.reply_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'geral',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===========================================
-- INDICES PARA PERFORMANCE
-- ===========================================
CREATE INDEX idx_messages_lead_id ON public.messages(lead_id);
CREATE INDEX idx_messages_company_id ON public.messages(company_id);
CREATE INDEX idx_messages_created_at ON public.messages(created_at DESC);
CREATE INDEX idx_leads_conversation_status ON public.leads(company_id, conversation_status);
CREATE INDEX idx_leads_assigned_to ON public.leads(assigned_to);

-- ===========================================
-- FUNCOES
-- ===========================================

-- Atualiza conversation_status do lead ao receber mensagem
CREATE OR REPLACE FUNCTION public.handle_new_message()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.sender_type = 'lead' THEN
        UPDATE public.leads
        SET
            conversation_status = 'unread',
            updated_at = now()
        WHERE id = NEW.lead_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_message_received
    AFTER INSERT ON public.messages
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_message();

-- ===========================================
-- RLS
-- ===========================================

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reply_templates ENABLE ROW LEVEL SECURITY;

-- Messages
CREATE POLICY "Admins and managers see all messages"
ON public.messages FOR SELECT TO authenticated
USING (
    company_id = get_current_company_id()
    AND (
        is_admin_or_manager()
        OR EXISTS (
            SELECT 1 FROM public.leads
            WHERE leads.id = messages.lead_id
            AND leads.assigned_to = get_current_profile_id()
        )
    )
    OR is_super_admin()
);

CREATE POLICY "Members can insert messages"
ON public.messages FOR INSERT TO authenticated
WITH CHECK (company_id = get_current_company_id() OR is_super_admin());

-- WhatsApp Configs
CREATE POLICY "Members can view whatsapp config"
ON public.whatsapp_configs FOR SELECT TO authenticated
USING (company_id = get_current_company_id() OR is_super_admin());

CREATE POLICY "Admins can manage whatsapp config"
ON public.whatsapp_configs FOR ALL TO authenticated
USING (company_id = get_current_company_id() AND is_company_admin() OR is_super_admin());

-- Reply Templates
CREATE POLICY "Members can view templates"
ON public.reply_templates FOR SELECT TO authenticated
USING (company_id = get_current_company_id() OR is_super_admin());

CREATE POLICY "Admins can manage templates"
ON public.reply_templates FOR ALL TO authenticated
USING (company_id = get_current_company_id() AND is_company_admin() OR is_super_admin());

-- ===========================================
-- REALTIME + TRIGGERS
-- ===========================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

CREATE TRIGGER on_whatsapp_configs_updated
    BEFORE UPDATE ON public.whatsapp_configs
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER on_reply_templates_updated
    BEFORE UPDATE ON public.reply_templates
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
