-- 073_leads_whatsapp_provider.sql
-- WAHA V2 (multi-provider simultaneo): provider passa a ser derivado POR-LEAD.
--
-- leads.whatsapp_provider: gravado no INBOUND (o provider da conversa daquele
--   lead). O outbound (whatsapp-send) deriva o provider por
--   lead.whatsapp_provider ?? getActiveProvider(company) (fallback compat p/
--   leads antigos que nasceram antes do multi-provider).
-- messages.whatsapp_provider: auditoria opcional (por qual provider a msg
--   entrou/saiu).
--
-- NULLABLE, sem default: leads antigos ficam NULL e caem no fallback do
-- whatsapp-send. Sem CHECK (o dominio ja e validado no codigo/tipos; manter
-- flexivel evita travar novos providers no futuro).

ALTER TABLE veltzy.leads
  ADD COLUMN IF NOT EXISTS whatsapp_provider text;

ALTER TABLE veltzy.messages
  ADD COLUMN IF NOT EXISTS whatsapp_provider text;

COMMENT ON COLUMN veltzy.leads.whatsapp_provider IS
  'Provider WhatsApp da conversa deste lead (evolution|cloud_api|waha|zapi). Gravado no inbound; lido pelo whatsapp-send para responder pelo provider certo. NULL = lead antigo (fallback getActiveProvider).';
