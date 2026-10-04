-- 082 mkt-ativo Onda 2: métricas de entrega (Entregue/Lido por contato via receipts Cloud API)
-- Só schema (2 colunas + index). O expurgo (pg_cron) é aplicado à parte (supabase/crons/).
-- RLS de veltzy.messages já está ligada (3 policies por company); as colunas novas herdam.

-- (1) Elo mensagem -> item da fila (chave do join recipient->mensagem na tela de detalhe).
ALTER TABLE veltzy.messages
  ADD COLUMN IF NOT EXISTS message_queue_id uuid
  REFERENCES veltzy.message_queue(id) ON DELETE SET NULL;

-- (2) Timestamp do último receipt (âncora de retenção LGPD + ordenação).
ALTER TABLE veltzy.messages
  ADD COLUMN IF NOT EXISTS delivery_updated_at timestamptz;

-- (3) Index parcial para o join da tela (recipients de uma campanha -> suas mensagens).
CREATE INDEX IF NOT EXISTS idx_messages_message_queue_id
  ON veltzy.messages(message_queue_id)
  WHERE message_queue_id IS NOT NULL;
