-- =============================================================
-- Migration 068: Meta Cloud API (WhatsApp oficial) - Inbound
-- Modelo de dados para receber webhooks da Meta Cloud API.
-- PRD/Spec: docs/features/cloud-api-integration/
--
-- Todas as mudancas sao seguras para producao:
--  - Tabela nova (cloud_api_numbers)
--  - CHECKs aditivos (nenhum dado existente viola; confirmado em §0:
--    companies usa apenas 'evolution' e 'zapi')
-- =============================================================

-- -------------------------------------------------------------
-- PVO 1: Mapeamento phone_number_id -> empresa (roteamento de webhook)
-- phone_number_id UNIQUE (um numero pertence a um unico tenant),
-- waba_id presente (templates + identificacao da conta), indice em phone_number_id.
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS veltzy.cloud_api_numbers (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  phone_number_id    TEXT NOT NULL UNIQUE,          -- value.metadata.phone_number_id (chave de roteamento)
  waba_id            TEXT,                            -- WhatsApp Business Account id (templates, assinatura)
  display_number     TEXT,                            -- ex: +55 11 99999-0000 (humano)
  instance_label     TEXT,                            -- gravado em leads/messages.instance_name
  access_token       TEXT,                            -- token do numero p/ baixar midia e (futuro) outbound
  status             TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'offboarded')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE veltzy.cloud_api_numbers IS
  'Numeros WhatsApp oficiais (Meta Cloud API) por empresa. phone_number_id e a chave de roteamento do webhook. Em producao, populada pelo callback do Embedded Signup; seed manual e apenas para dev.';
COMMENT ON COLUMN veltzy.cloud_api_numbers.phone_number_id IS
  'value.metadata.phone_number_id do payload Meta. UNIQUE: um numero pertence a um unico tenant.';
COMMENT ON COLUMN veltzy.cloud_api_numbers.waba_id IS
  'WhatsApp Business Account id. Necessario para gerenciar templates e identificar a conta na assinatura.';
COMMENT ON COLUMN veltzy.cloud_api_numbers.instance_label IS
  'Valor gravado em leads.whatsapp_instance_name e messages.instance_name (reusa roteamento multi-instancia).';
COMMENT ON COLUMN veltzy.cloud_api_numbers.access_token IS
  'Token do numero para baixar midia (media_id expira) e outbound futuro. Fallback: META_SYSTEM_USER_TOKEN.';

-- phone_number_id ja e UNIQUE (indice unico implicito). Indice explicito documenta
-- a intencao de lookup O(1) em todo webhook e nao custa (idempotente).
CREATE INDEX IF NOT EXISTS idx_cloud_api_numbers_phone_number_id
  ON veltzy.cloud_api_numbers (phone_number_id);
CREATE INDEX IF NOT EXISTS idx_cloud_api_numbers_company
  ON veltzy.cloud_api_numbers (company_id);

ALTER TABLE veltzy.cloud_api_numbers ENABLE ROW LEVEL SECURITY;

-- Leitura: empresa propria ou super_admin. Escrita: admin/manager da empresa ou super_admin.
-- (Edge Function usa service role e ignora RLS.)
DROP POLICY IF EXISTS "cloud_api_numbers_select" ON veltzy.cloud_api_numbers;
CREATE POLICY "cloud_api_numbers_select" ON veltzy.cloud_api_numbers
  FOR SELECT TO authenticated
  USING (company_id = veltzy.get_current_company_id() OR veltzy.is_super_admin());

DROP POLICY IF EXISTS "cloud_api_numbers_write" ON veltzy.cloud_api_numbers;
CREATE POLICY "cloud_api_numbers_write" ON veltzy.cloud_api_numbers
  FOR ALL TO authenticated
  USING (
    (company_id = veltzy.get_current_company_id() AND veltzy.is_admin_or_manager())
    OR veltzy.is_super_admin()
  );

-- -------------------------------------------------------------
-- PVO 4: Provider 'cloud_api' aceito (ADITIVO)
-- Constraint name confirmado na migration 046. Mantem 'meta'/'wuzapi'/'revolution'
-- (limpeza dos valores mortos fica para migration separada).
-- -------------------------------------------------------------
ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_active_whatsapp_provider_check;
ALTER TABLE public.companies
  ADD CONSTRAINT companies_active_whatsapp_provider_check
  CHECK (active_whatsapp_provider = ANY (
    ARRAY['zapi', 'wuzapi', 'revolution', 'meta', 'evolution', 'cloud_api']
  ));

-- -------------------------------------------------------------
-- PVO 3: delivery_status estendido para delivered/read
-- A migration 045 criou o CHECK inline (ADD COLUMN ... CHECK), com nome
-- auto-gerado. Em vez de depender do nome exato, dropamos por introspecao
-- qualquer CHECK que referencie delivery_status (name-agnostic, robusto).
-- -------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'veltzy.messages'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%delivery_status%'
  LOOP
    EXECUTE format('ALTER TABLE veltzy.messages DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE veltzy.messages
  ADD CONSTRAINT messages_delivery_status_check
  CHECK (delivery_status IN ('pending', 'sent', 'delivered', 'read', 'failed'));

COMMENT ON COLUMN veltzy.messages.delivery_status IS
  'pending=na fila, sent=enviada ao provider, delivered=entregue ao device, read=lida, failed=erro. Progressao monotonica.';
