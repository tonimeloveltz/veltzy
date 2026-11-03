-- ============================================================
-- Documentacao das mudancas feitas em 2026-05-04
-- Fix: restore inbox after zapi oauth migration
-- ============================================================
-- Contexto: Apos migrar credenciais Z-API de veltzy.whatsapp_configs
-- para public.oauth_integrations, o inbox parou de funcionar porque:
-- 1. Edge functions com JWT nao tinham acesso via RLS
-- 2. Edge functions sem JWT (webhooks) nao tinham GRANT para service_role
-- 3. Policies RLS estavam bloqueando queries legitimas
-- ============================================================

-- 1. GRANT para service_role (ja aplicado em 031, repetido aqui como idempotente)
GRANT ALL ON public.oauth_integrations TO service_role;
GRANT ALL ON public.oauth_integrations TO authenticated;

-- 2. Policies RLS para oauth_integrations
-- Permite SELECT para usuarios autenticados da mesma empresa
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'oauth_integrations_select' AND tablename = 'oauth_integrations') THEN
    EXECUTE 'CREATE POLICY oauth_integrations_select ON public.oauth_integrations FOR SELECT TO authenticated USING (company_id = public.get_current_company_id())';
  END IF;
END $$;

-- Permite ALL para admins da empresa
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'oauth_integrations_admin' AND tablename = 'oauth_integrations') THEN
    EXECUTE 'CREATE POLICY oauth_integrations_admin ON public.oauth_integrations FOR ALL TO authenticated USING (company_id = public.get_current_company_id() OR public.is_super_admin())';
  END IF;
END $$;

-- Permite bypass para service_role (edge functions sem JWT: webhooks, crons)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_bypass' AND tablename = 'oauth_integrations') THEN
    EXECUTE 'CREATE POLICY service_role_bypass ON public.oauth_integrations FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
END $$;

-- 3. Campo token no metadata (JSONB)
-- O campo metadata da tabela oauth_integrations para provider='zapi' contem:
--   instance_id    TEXT  - ID da instancia Z-API
--   token          TEXT  - Token da instancia (instance_token)
--   client_token   TEXT  - Client token para autenticacao
--   server_url     TEXT  - URL base da Z-API (default: https://api.z-api.io)
--   phone_number   TEXT  - Numero conectado (nullable)
--   qr_code        TEXT  - QR code para conexao (nullable)
--   connected_at   TEXT  - Timestamp da ultima conexao (nullable)
-- Nenhuma alteracao de schema necessaria - metadata e JSONB flexivel
COMMENT ON COLUMN public.oauth_integrations.metadata IS 'JSONB com credenciais do provider. Para zapi: instance_id, token, client_token, server_url, phone_number, qr_code, connected_at';
