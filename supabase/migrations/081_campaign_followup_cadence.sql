-- ============================================================================
-- 081_campaign_followup_cadence.sql
-- mkt-ativo Fase 2 · follow-up campanha→cadência + stageChanged. SPEC-mkt-ativo-fase2 (chat).
-- Tudo ADITIVO. NÃO toca motor de prod (automation_rules/run-automations/process-message-queue).
-- ============================================================================

-- PARTE B — config do follow-up na campanha.
ALTER TABLE veltzy.blast_campaigns
  ADD COLUMN IF NOT EXISTS followup_cadence_id UUID REFERENCES veltzy.cadences(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS followup_mode TEXT NOT NULL DEFAULT 'none'
    CHECK (followup_mode IN ('none', 'immediate', 'no_reply')),
  ADD COLUMN IF NOT EXISTS followup_delay_days INTEGER NOT NULL DEFAULT 0,
  -- marca que o follow-up ja foi disparado (idempotencia do cron; nao re-inscreve).
  ADD COLUMN IF NOT EXISTS followup_done_at TIMESTAMPTZ;

COMMENT ON COLUMN veltzy.blast_campaigns.followup_mode IS
  'Follow-up pós-campanha: none | immediate (ao completar, recipients SENT) | no_reply (SENT sem resposta apos followup_delay_days). Inicia followup_cadence_id via addLeadsToCadence.';

-- PARTE C — stageChanged: snapshot do stage no inicio do run (fecha o TODO do Corte B).
ALTER TABLE veltzy.cadence_runs
  ADD COLUMN IF NOT EXISTS initial_stage_id UUID;

COMMENT ON COLUMN veltzy.cadence_runs.initial_stage_id IS
  'Stage do deal aberto mais recente no momento do START. process-cadences compara com o stage atual → se mudou e cancel_on_stage_change, cancela.';
