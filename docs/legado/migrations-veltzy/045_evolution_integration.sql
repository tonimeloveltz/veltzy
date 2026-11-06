-- =============================================================
-- Migration 045: Evolution API Integration
-- Adiciona colunas para multi-instancia WhatsApp via Evolution
-- Todas as colunas sao nullable com defaults, seguro para producao
-- =============================================================

-- 1. profiles: numero padrao do vendedor
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS default_whatsapp_instance TEXT DEFAULT NULL;

COMMENT ON COLUMN public.profiles.default_whatsapp_instance IS
  'instance_name da Evolution API. Texto livre, sem FK para Hub.';

-- 2. leads: instancia que originou a conversa + resumo de transfer
ALTER TABLE veltzy.leads
  ADD COLUMN IF NOT EXISTS whatsapp_instance_name TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS transfer_summary TEXT DEFAULT NULL;

COMMENT ON COLUMN veltzy.leads.whatsapp_instance_name IS
  'instance_name da Evolution que recebeu/iniciou esta conversa.';
COMMENT ON COLUMN veltzy.leads.transfer_summary IS
  'Resumo IA gerado quando SDR transfere lead para vendedor. Exibido no card do kanban e na notificacao.';

CREATE INDEX IF NOT EXISTS idx_leads_whatsapp_instance
  ON veltzy.leads (company_id, whatsapp_instance_name)
  WHERE whatsapp_instance_name IS NOT NULL;

-- 3. pipelines: instancia do SDR + template de transfer
ALTER TABLE veltzy.pipelines
  ADD COLUMN IF NOT EXISTS sdr_instance_name TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS sdr_transfer_message_template TEXT DEFAULT NULL;

COMMENT ON COLUMN veltzy.pipelines.sdr_instance_name IS
  'instance_name dedicada para AI SDR neste pipeline.';
COMMENT ON COLUMN veltzy.pipelines.sdr_transfer_message_template IS
  'Template da mensagem de transfer SDR->humano. Suporta {vendedor_nome}. Fallback hardcoded se null.';

-- 4. messages: instancia + delivery status
ALTER TABLE veltzy.messages
  ADD COLUMN IF NOT EXISTS instance_name TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS delivery_status TEXT DEFAULT 'sent'
    CHECK (delivery_status IN ('sent', 'failed', 'pending'));

COMMENT ON COLUMN veltzy.messages.delivery_status IS
  'sent=entregue ao provider, failed=instancia offline/erro, pending=aguardando envio.';

CREATE INDEX IF NOT EXISTS idx_messages_delivery_failed
  ON veltzy.messages (company_id, delivery_status, created_at DESC)
  WHERE delivery_status = 'failed';

-- 5. message_queue: instancia para roteamento
ALTER TABLE veltzy.message_queue
  ADD COLUMN IF NOT EXISTS instance_name TEXT DEFAULT NULL;
