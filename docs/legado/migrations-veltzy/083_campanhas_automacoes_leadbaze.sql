-- 083 Campanhas + Automações (fidelidade Leadbaze)
-- Só schema. RLS: tabelas já têm policies por company; colunas novas herdam (sem policy nova).

-- ── Campanhas: mensagem livre + anti-ban editável por campanha ──
ALTER TABLE veltzy.blast_campaigns
  ADD COLUMN IF NOT EXISTS message_body text,   -- texto livre (usado quando template_id IS NULL)
  ADD COLUMN IF NOT EXISTS anti_ban jsonb;       -- override {delay_min_s,delay_max_s,hourly_cap,window_start,window_end}; null = defaults do servidor
-- template_id já é NULLABLE (confirmado no staging) → no-op.

-- ── Automações (cadences): 4 gatilhos novos + campos de recurring/webhook ──
-- Enum via CHECK: dropar e recriar com os novos valores (gotcha SQL Supabase).
ALTER TABLE veltzy.cadences DROP CONSTRAINT IF EXISTS cadences_trigger_event_check;
ALTER TABLE veltzy.cadences ADD CONSTRAINT cadences_trigger_event_check
  CHECK (
    trigger_event IS NULL OR trigger_event = ANY (ARRAY[
      'lead_created','lead_stage_changed','lead_temperature_changed','message_received',
      'no_response','deal_closed','lead_lost',
      'stage_changed','tag_added','recurring','webhook'
    ])
  );

ALTER TABLE veltzy.cadences
  ADD COLUMN IF NOT EXISTS recurring_cron text,   -- cron do gatilho 'recurring' (null fora dele)
  ADD COLUMN IF NOT EXISTS webhook_token text;     -- token do gatilho 'webhook' (null fora dele)

-- webhook_token único por automação quando presente.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cadences_webhook_token
  ON veltzy.cadences(webhook_token) WHERE webhook_token IS NOT NULL;
