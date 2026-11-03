-- ===========================================
-- TABELAS DA FASE 4
-- ===========================================

-- Regras de automacao
CREATE TABLE public.automation_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    trigger_type TEXT NOT NULL
        CHECK (trigger_type IN (
            'lead_created', 'lead_stage_changed', 'lead_temperature_changed',
            'message_received', 'no_response', 'deal_closed', 'lead_lost'
        )),
    conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
    action_type TEXT NOT NULL
        CHECK (action_type IN (
            'send_message', 'change_stage', 'assign_lead',
            'add_tag', 'remove_tag', 'update_temperature',
            'send_webhook', 'notify_team'
        )),
    action_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    priority INTEGER NOT NULL DEFAULT 0,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Historico de execucao de automacoes
CREATE TABLE public.automation_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
    rule_id UUID REFERENCES public.automation_rules(id) ON DELETE SET NULL,
    lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'success'
        CHECK (status IN ('success', 'failed', 'skipped')),
    trigger_data JSONB DEFAULT '{}'::jsonb,
    old_value JSONB,
    new_value JSONB,
    error_message TEXT,
    executed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Notificacoes persistentes por usuario
CREATE TABLE public.notifications (
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
-- INDICES
-- ===========================================
CREATE INDEX idx_automation_rules_company ON public.automation_rules(company_id, is_enabled);
CREATE INDEX idx_automation_logs_company ON public.automation_logs(company_id, executed_at DESC);
CREATE INDEX idx_notifications_user ON public.notifications(user_id, is_read, created_at DESC);
CREATE INDEX idx_leads_queued ON public.leads(company_id, is_queued) WHERE is_queued = true;

-- ===========================================
-- RLS
-- ===========================================

ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view automation rules"
ON public.automation_rules FOR SELECT TO authenticated
USING (company_id = get_current_company_id() OR is_super_admin());

CREATE POLICY "Admins can manage automation rules"
ON public.automation_rules FOR ALL TO authenticated
USING (company_id = get_current_company_id() AND is_admin_or_manager() OR is_super_admin());

CREATE POLICY "Members can view automation logs"
ON public.automation_logs FOR SELECT TO authenticated
USING (company_id = get_current_company_id() OR is_super_admin());

CREATE POLICY "System can insert automation logs"
ON public.automation_logs FOR INSERT TO authenticated
WITH CHECK (company_id = get_current_company_id() OR is_super_admin());

CREATE POLICY "Users can view own notifications"
ON public.notifications FOR SELECT TO authenticated
USING (user_id = auth.uid() OR is_super_admin());

CREATE POLICY "System can insert notifications"
ON public.notifications FOR INSERT TO authenticated
WITH CHECK (company_id = get_current_company_id() OR is_super_admin());

CREATE POLICY "Users can update own notifications"
ON public.notifications FOR UPDATE TO authenticated
USING (user_id = auth.uid());

-- ===========================================
-- REALTIME + TRIGGERS
-- ===========================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

CREATE TRIGGER on_automation_rules_updated
    BEFORE UPDATE ON public.automation_rules
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
