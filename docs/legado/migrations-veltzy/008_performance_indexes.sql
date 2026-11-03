-- Indices adicionais para performance
CREATE INDEX IF NOT EXISTS idx_leads_company_stage ON public.leads(company_id, stage_id);
CREATE INDEX IF NOT EXISTS idx_leads_company_assigned ON public.leads(company_id, assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_company_temperature ON public.leads(company_id, temperature);
CREATE INDEX IF NOT EXISTS idx_leads_company_updated ON public.leads(company_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_lead_created ON public.messages(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_company_available ON public.profiles(company_id, is_available);
CREATE INDEX IF NOT EXISTS idx_activity_logs_company_created ON public.activity_logs(company_id, created_at DESC);
