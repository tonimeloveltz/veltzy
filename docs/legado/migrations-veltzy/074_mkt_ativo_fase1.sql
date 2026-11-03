-- ============================================================================
-- 074_mkt_ativo_fase1.sql
-- Frente mkt-ativo (Fase 1): disparo em massa (campanhas) + envio de template HSM.
-- SPEC: SPEC-mkt-ativo-fase1.md  |  Branch: feat/automacoes-disparos
--
-- ESTA MIGRATION = itens 1a/1b/1c da spec (modelo de dados novo). NÃO duplica o
-- motor: a camada de campanha vai EXPANDIR itens na veltzy.message_queue existente
-- (source='campaign', que ja e TEXT livre, sem CHECK) e deixar o cron
-- process-message-queue enviar. Nada de motor/fila/envio e tocado aqui.
--
-- ⛔ ITEM 1d (flag companies.features) NAO entra aqui de proposito: o default de
--    companies.features no staging JA contem "campaign_whatsapp_enabled" — decisao
--    de produto pendente (reusar essa flag vs. criar mkt_ativo_enabled) devolvida
--    ao Copiloto. A flag entra em migration propria apos o go.
--
-- Convencoes confirmadas no banco (staging): tabelas de dominio no schema `veltzy`;
-- companies/profiles no schema `public`; helpers RLS em veltzy.* ; source de
-- message_queue e TEXT sem CHECK (aceita 'campaign' sem ALTER).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1a. veltzy.whatsapp_templates (catalogo HSM da Cloud API)
--     Alinhada EXATAMENTE ao type src/types/whatsapp-template.ts (WhatsAppTemplate).
--     ⚠️ NAO confundir com veltzy.reply_templates (resposta rapida do inbox).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS veltzy.whatsapp_templates (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  cloud_api_number_id UUID REFERENCES veltzy.cloud_api_numbers(id) ON DELETE SET NULL,
  waba_id             TEXT NOT NULL,                 -- WhatsApp Business Account id
  meta_template_id    TEXT,                          -- id do template na Meta (null enquanto nao sincronizado)
  name                TEXT NOT NULL,
  language            TEXT NOT NULL,                 -- ex: pt_BR
  category            TEXT NOT NULL
    CHECK (category IN ('UTILITY', 'MARKETING', 'AUTHENTICATION')),
  status              TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'PAUSED', 'DISABLED')),
  quality_rating      TEXT
    CHECK (quality_rating IN ('GREEN', 'YELLOW', 'RED')),
  components          JSONB NOT NULL DEFAULT '[]'::jsonb,  -- HEADER/BODY/FOOTER/BUTTONS (forma Graph)
  rejected_reason     TEXT,
  created_by          UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Um template Meta e unico por conta/nome/idioma; espelha a chave da Graph.
  UNIQUE (company_id, name, language)
);

COMMENT ON TABLE veltzy.whatsapp_templates IS
  'Catalogo de templates HSM (WhatsApp Cloud API) por empresa. Espelha o type WhatsAppTemplate; sincronizado do Hub->Meta via cloud-api-templates-proxy. So metadados (texto generico com {{n}}), sem PII. NAO confundir com reply_templates (resposta rapida do inbox).';
COMMENT ON COLUMN veltzy.whatsapp_templates.components IS
  'Componentes crus da Graph (HEADER/BODY/FOOTER/BUTTONS). Usado para preview e contagem de variaveis {{n}}.';
COMMENT ON COLUMN veltzy.whatsapp_templates.status IS
  'Estado do template na Meta. Disparo em massa via Cloud API so permite APPROVED (compliance).';

CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_company
  ON veltzy.whatsapp_templates (company_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_company_status
  ON veltzy.whatsapp_templates (company_id, status);

ALTER TABLE veltzy.whatsapp_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "whatsapp_templates_select" ON veltzy.whatsapp_templates;
CREATE POLICY "whatsapp_templates_select" ON veltzy.whatsapp_templates
  FOR SELECT TO authenticated
  USING (company_id = veltzy.get_current_company_id() OR veltzy.is_super_admin());

DROP POLICY IF EXISTS "whatsapp_templates_write" ON veltzy.whatsapp_templates;
CREATE POLICY "whatsapp_templates_write" ON veltzy.whatsapp_templates
  FOR ALL TO authenticated
  USING (
    (company_id = veltzy.get_current_company_id() AND veltzy.is_admin_or_manager())
    OR veltzy.is_super_admin()
  );

DROP TRIGGER IF EXISTS on_whatsapp_templates_updated ON veltzy.whatsapp_templates;
CREATE TRIGGER on_whatsapp_templates_updated
  BEFORE UPDATE ON veltzy.whatsapp_templates
  FOR EACH ROW EXECUTE FUNCTION veltzy.handle_updated_at();

-- ----------------------------------------------------------------------------
-- 1b. veltzy.blast_campaigns (campanha de disparo em massa) — adaptada do Leadbaze
--     No Veltzy o disparo e SEMPRE via template (nao texto livre como no Leadbaze).
--     Sem heartbeat: o progresso vem da fila/recipients, nao de loop+sleep.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS veltzy.blast_campaigns (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  template_id       UUID REFERENCES veltzy.whatsapp_templates(id) ON DELETE RESTRICT,
  variable_mapping  JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {"1":"lead.name","2":"Black Friday"}
  audience_filter   JSONB NOT NULL DEFAULT '{}'::jsonb,  -- status/tags/temperature/pipeline/stage/source
  throttle_config   JSONB,                                -- override anti-ban (§4bis); null = defaults de sistema
  status            TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','scheduled','queued','running','completed','failed','paused','cancelled')),
  scheduled_at      TIMESTAMPTZ,
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  total_recipients  INTEGER NOT NULL DEFAULT 0,
  queued_count      INTEGER NOT NULL DEFAULT 0,
  sent_count        INTEGER NOT NULL DEFAULT 0,
  failed_count      INTEGER NOT NULL DEFAULT 0,
  created_by        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE veltzy.blast_campaigns IS
  'Campanha de disparo em massa (mkt-ativo). Expande em itens da message_queue; o cron process-message-queue envia. Disparo sempre via template (whatsapp_templates). throttle_config sobrescreve os limites anti-ban do §4bis (null=defaults de sistema).';
COMMENT ON COLUMN veltzy.blast_campaigns.throttle_config IS
  'Override anti-ban por-campanha: {delay_min,delay_max,daily_cap,window_start,window_end}. Ausente = defaults de sistema enforcados no servidor para providers nao-oficiais (§4bis).';

CREATE INDEX IF NOT EXISTS idx_blast_campaigns_company
  ON veltzy.blast_campaigns (company_id);
CREATE INDEX IF NOT EXISTS idx_blast_campaigns_company_status
  ON veltzy.blast_campaigns (company_id, status);
CREATE INDEX IF NOT EXISTS idx_blast_campaigns_scheduled
  ON veltzy.blast_campaigns (status, scheduled_at);

ALTER TABLE veltzy.blast_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blast_campaigns_select" ON veltzy.blast_campaigns;
CREATE POLICY "blast_campaigns_select" ON veltzy.blast_campaigns
  FOR SELECT TO authenticated
  USING (company_id = veltzy.get_current_company_id() OR veltzy.is_super_admin());

DROP POLICY IF EXISTS "blast_campaigns_write" ON veltzy.blast_campaigns;
CREATE POLICY "blast_campaigns_write" ON veltzy.blast_campaigns
  FOR ALL TO authenticated
  USING (
    (company_id = veltzy.get_current_company_id() AND veltzy.is_admin_or_manager())
    OR veltzy.is_super_admin()
  );

DROP TRIGGER IF EXISTS on_blast_campaigns_updated ON veltzy.blast_campaigns;
CREATE TRIGGER on_blast_campaigns_updated
  BEFORE UPDATE ON veltzy.blast_campaigns
  FOR EACH ROW EXECUTE FUNCTION veltzy.handle_updated_at();

-- ----------------------------------------------------------------------------
-- 1c. veltzy.blast_recipients (destinatarios de uma campanha) — adaptada do Leadbaze
--     message_queue_id liga o recipient ao item enfileirado (fonte do status).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS veltzy.blast_recipients (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id       UUID NOT NULL REFERENCES veltzy.blast_campaigns(id) ON DELETE CASCADE,
  lead_id           UUID REFERENCES veltzy.leads(id) ON DELETE SET NULL,
  phone             TEXT,                              -- snapshot no momento do disparo
  status            TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','queued','sent','failed','skipped')),
  message_queue_id  UUID REFERENCES veltzy.message_queue(id) ON DELETE SET NULL,
  error_message     TEXT,
  sent_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, lead_id)
);

COMMENT ON TABLE veltzy.blast_recipients IS
  'Destinatarios de uma campanha. message_queue_id liga ao item enfileirado; o status do recipient reflete o processamento da fila. RLS via campaign_id -> company_id.';

CREATE INDEX IF NOT EXISTS idx_blast_recipients_campaign
  ON veltzy.blast_recipients (campaign_id);
CREATE INDEX IF NOT EXISTS idx_blast_recipients_campaign_status
  ON veltzy.blast_recipients (campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_blast_recipients_queue
  ON veltzy.blast_recipients (message_queue_id);

ALTER TABLE veltzy.blast_recipients ENABLE ROW LEVEL SECURITY;

-- Isolamento por tenant via a campanha-mae (subquery com as policies da campanha).
DROP POLICY IF EXISTS "blast_recipients_select" ON veltzy.blast_recipients;
CREATE POLICY "blast_recipients_select" ON veltzy.blast_recipients
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM veltzy.blast_campaigns c
      WHERE c.id = blast_recipients.campaign_id
        AND (c.company_id = veltzy.get_current_company_id() OR veltzy.is_super_admin())
    )
  );

DROP POLICY IF EXISTS "blast_recipients_write" ON veltzy.blast_recipients;
CREATE POLICY "blast_recipients_write" ON veltzy.blast_recipients
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM veltzy.blast_campaigns c
      WHERE c.id = blast_recipients.campaign_id
        AND (
          (c.company_id = veltzy.get_current_company_id() AND veltzy.is_admin_or_manager())
          OR veltzy.is_super_admin()
        )
    )
  );
