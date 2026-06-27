-- =============================================================
-- Migration 069: Cloud API Outbound — multi-número
-- Aditiva. Nenhum dado existente é alterado.
-- PRD/Spec: docs/features/cloud-api-outbound/
-- =============================================================

-- 1. Vínculo lead -> número Cloud API (inbound carimba, outbound lê).
--    Nullable: leads de Evolution/Z-API não têm.
ALTER TABLE veltzy.leads
  ADD COLUMN IF NOT EXISTS cloud_api_number_id UUID NULL
    REFERENCES veltzy.cloud_api_numbers(id);

COMMENT ON COLUMN veltzy.leads.cloud_api_number_id IS
  'Número Cloud API pelo qual este lead conversa. Carimbado pelo inbound (cloud-api-inbound), lido pelo outbound (whatsapp-send). NULL para leads de outros providers.';

-- Índice para o lookup do outbound e para o FK (PG não cria automático).
CREATE INDEX IF NOT EXISTS idx_leads_cloud_api_number_id
  ON veltzy.leads (cloud_api_number_id);

-- 2. Default por empresa.
ALTER TABLE veltzy.cloud_api_numbers
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;

-- Um único default por empresa (índice parcial).
CREATE UNIQUE INDEX IF NOT EXISTS cloud_api_numbers_one_default_per_company
  ON veltzy.cloud_api_numbers (company_id) WHERE is_default;

-- 3. Documentar duplo uso de external_id.
COMMENT ON COLUMN veltzy.messages.external_id IS
  'ID do provider para esta mensagem. Inbound: wamid recebido (dedup). Outbound: wamid retornado pela Meta no envio (correlação para status, Fase 3). wamid é único global, os dois usos nunca colidem.';
