-- ============================================================
-- Google Calendar: conexao OAuth por vendedor (Onda 1)
-- ============================================================
-- Modelada em public.instagram_connections (007_admin_superadmin.sql:20),
-- porem com RLS mais estrita: a conexao pertence ao PROFILE, nao a empresa.
-- access_token e refresh_token sao credenciais bearer da conta Google do
-- vendedor; colega de empresa nao le o token de ninguem.
-- ============================================================

CREATE TABLE public.google_calendar_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  google_email TEXT NOT NULL,
  calendar_id TEXT NOT NULL DEFAULT 'primary',
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  scope TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_gcal_connections_company ON public.google_calendar_connections(company_id);

ALTER TABLE public.google_calendar_connections ENABLE ROW LEVEL SECURITY;

-- ===========================================
-- RLS: apenas a propria linha
-- ===========================================
-- A condicao e por profile_id, NAO por company_id. Diferente do precedente do
-- Instagram, que expoe o access_token a toda a empresa.

CREATE POLICY gcal_connections_select_own
ON public.google_calendar_connections FOR SELECT TO authenticated
USING (profile_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY gcal_connections_manage_own
ON public.google_calendar_connections FOR ALL TO authenticated
USING (profile_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()))
WITH CHECK (profile_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- Bypass para service_role (edge functions gcal-oauth e calendar-event, que
-- renovam token e gravam google_event_id sem JWT de usuario).
-- Mesmo padrao documentado em 032_document_oauth_integrations_fixes.sql.
CREATE POLICY gcal_connections_service_role_bypass
ON public.google_calendar_connections FOR ALL TO service_role
USING (true) WITH CHECK (true);

GRANT ALL ON public.google_calendar_connections TO service_role;
GRANT ALL ON public.google_calendar_connections TO authenticated;

-- public.set_updated_at() e usada por veltzy.tasks (015) e veltzy.task_reminders
-- (017), mas nenhuma migration do repo a cria: ela e da era Lovable. O guard
-- abaixo nao toca na funcao existente, so evita que esta migration quebre em um
-- banco reconstruido do zero.
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'set_updated_at'
  ) THEN
    CREATE FUNCTION public.set_updated_at()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $fn$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $fn$;
  END IF;
END
$do$;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.google_calendar_connections
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.google_calendar_connections IS 'Conexao OAuth do Google Calendar, uma linha por profile (vendedor). O evento nasce na agenda de quem atende.';
COMMENT ON COLUMN public.google_calendar_connections.last_error IS 'Ultima falha de autenticacao (ex: invalid_grant apos revogacao). Exibida no card de Minha Conta quando is_active = false.';
