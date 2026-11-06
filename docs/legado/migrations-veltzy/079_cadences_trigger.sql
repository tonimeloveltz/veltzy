-- ============================================================================
-- 079_cadences_trigger.sql
-- mkt-ativo · Corte B — gatilho de START da cadência (decisão do Toni: MANUAL + POR EVENTO).
--
-- Adiciona a cadences o gatilho POR EVENTO (aditivo; o START manual não precisa de
-- coluna — a UI cria o cadence_run direto). trigger_event NULL = só manual; setado =
-- a edge start-cadences (chamada AO LADO do run-automations, sem tocá-lo) cria run
-- quando o evento ocorre, avaliando trigger_conditions (espelha automation_rules).
-- ============================================================================

ALTER TABLE veltzy.cadences
  ADD COLUMN IF NOT EXISTS trigger_event TEXT
    CHECK (trigger_event IS NULL OR trigger_event IN (
      'lead_created', 'lead_stage_changed', 'lead_temperature_changed',
      'message_received', 'no_response', 'deal_closed', 'lead_lost'
    )),
  ADD COLUMN IF NOT EXISTS trigger_conditions JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN veltzy.cadences.trigger_event IS
  'Evento que inicia a cadencia automaticamente (mesmos trigger_type de automation_rules). NULL = so start manual. A edge start-cadences (ao lado do run-automations) cria o run quando o evento ocorre.';
COMMENT ON COLUMN veltzy.cadences.trigger_conditions IS
  'Condicoes opcionais (JSONB array {field,operator,value}, espelha automation_rules.conditions) avaliadas contra o lead no start por evento.';

-- Indice p/ o lookup do start por evento (company + trigger + habilitada).
CREATE INDEX IF NOT EXISTS idx_cadences_trigger
  ON veltzy.cadences (company_id, trigger_event)
  WHERE is_enabled = true AND trigger_event IS NOT NULL;
