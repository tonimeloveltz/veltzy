-- 055_webhook_inbound.sql
-- Feature: Webhook Inbound por Source
-- Corrige pipeline_sources, adiciona webhook_token, cria webhook_inbound_log

-- =============================================================================
-- 1. Corrigir pipeline_sources
--    FK apontava para pipeline_stages (errado). Deve apontar para pipelines.
--    Tabela nunca foi populada, seguro dropar e recriar.
-- =============================================================================

DROP TABLE IF EXISTS veltzy.pipeline_sources;

CREATE TABLE veltzy.pipeline_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pipeline_id UUID NOT NULL REFERENCES veltzy.pipelines(id) ON DELETE CASCADE,
    source_id UUID NOT NULL REFERENCES veltzy.lead_sources(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (pipeline_id, source_id)
);

ALTER TABLE veltzy.pipeline_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vz_piso_select" ON veltzy.pipeline_sources
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM veltzy.pipelines p
      WHERE p.id = pipeline_sources.pipeline_id
        AND p.company_id = veltzy.get_current_company_id()
    )
    OR veltzy.is_super_admin()
  );

CREATE POLICY "vz_piso_all" ON veltzy.pipeline_sources
  FOR ALL TO authenticated
  USING (
    (
      EXISTS (
        SELECT 1 FROM veltzy.pipelines p
        WHERE p.id = pipeline_sources.pipeline_id
          AND p.company_id = veltzy.get_current_company_id()
      )
      AND veltzy.is_company_admin()
    )
    OR veltzy.is_super_admin()
  );

-- =============================================================================
-- 2. Coluna webhook_token em source_integrations
--    UUID unico por integracao, indexado para lookup O(1) no source-webhook.
-- =============================================================================

ALTER TABLE veltzy.source_integrations
  ADD COLUMN IF NOT EXISTS webhook_token UUID UNIQUE;

CREATE INDEX IF NOT EXISTS idx_si_webhook_token
  ON veltzy.source_integrations(webhook_token)
  WHERE webhook_token IS NOT NULL;

-- =============================================================================
-- 3. Tabela webhook_inbound_log
--    Grava todo POST recebido (sucesso e falha) com payload bruto e parseado.
-- =============================================================================

CREATE TABLE veltzy.webhook_inbound_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    source_integration_id UUID REFERENCES veltzy.source_integrations(id) ON DELETE SET NULL,
    source_id UUID REFERENCES veltzy.lead_sources(id) ON DELETE SET NULL,
    status TEXT NOT NULL CHECK (status IN ('success', 'error', 'invalid_token', 'invalid_payload')),
    lead_id UUID REFERENCES veltzy.leads(id) ON DELETE SET NULL,
    raw_payload JSONB NOT NULL DEFAULT '{}',
    parsed_payload JSONB,
    error_message TEXT,
    ip_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE veltzy.webhook_inbound_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vz_wil_select" ON veltzy.webhook_inbound_log
  FOR SELECT TO authenticated
  USING (company_id = veltzy.get_current_company_id() OR veltzy.is_super_admin());

CREATE INDEX idx_wil_company_created
  ON veltzy.webhook_inbound_log(company_id, created_at DESC);

CREATE INDEX idx_wil_source_integration
  ON veltzy.webhook_inbound_log(source_integration_id, created_at DESC);
