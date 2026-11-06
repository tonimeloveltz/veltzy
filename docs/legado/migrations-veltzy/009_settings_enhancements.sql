-- ===========================================
-- SCRIPTS / TEMPLATES - adicionar created_by
-- ===========================================
ALTER TABLE public.reply_templates
    ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- ===========================================
-- PAYMENT CONFIGS
-- ===========================================
CREATE TABLE public.payment_configs (
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

ALTER TABLE public.payment_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view company payment configs"
ON public.payment_configs FOR SELECT TO authenticated
USING (company_id = get_current_company_id() AND is_company_admin() OR is_super_admin());

CREATE POLICY "Admins can manage company payment configs"
ON public.payment_configs FOR ALL TO authenticated
USING (company_id = get_current_company_id() AND is_company_admin() OR is_super_admin());

CREATE TRIGGER on_payment_configs_updated
    BEFORE UPDATE ON public.payment_configs
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- ===========================================
-- AUDIT TRIGGER para disponibilidade de vendedor
-- ===========================================
CREATE OR REPLACE FUNCTION public.log_availability_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.is_available IS DISTINCT FROM NEW.is_available THEN
        INSERT INTO public.activity_logs (company_id, user_id, action, resource_type, resource_id, metadata)
        VALUES (
            NEW.company_id,
            auth.uid(),
            CASE WHEN NEW.is_available THEN 'seller_available' ELSE 'seller_unavailable' END,
            'profile',
            NEW.id,
            jsonb_build_object('is_available', NEW.is_available)
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_profile_availability_changed
    AFTER UPDATE OF is_available ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.log_availability_change();

-- ===========================================
-- GARANTIR business_rules com fallback_lead_owner
-- ===========================================
INSERT INTO system_settings (company_id, key, value)
SELECT c.id, 'business_rules', '{}'::jsonb
FROM companies c
WHERE NOT EXISTS (
    SELECT 1 FROM system_settings ss
    WHERE ss.company_id = c.id AND ss.key = 'business_rules'
)
ON CONFLICT DO NOTHING;

UPDATE system_settings
SET value = value || '{"fallback_lead_owner": null}'::jsonb
WHERE key = 'business_rules'
AND NOT (value ? 'fallback_lead_owner');
