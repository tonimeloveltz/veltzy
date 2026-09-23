-- ============================================================================
-- 078_cadences.sql
-- mkt-ativo · Corte B (cadências / drip). SPEC: SPEC-mkt-ativo-corteB-cadencias.md
--
-- Entidade NOVA (Opção B): cadences + cadence_steps + cadence_runs. NAO toca o
-- motor de prod (automation_rules / run-automations) — zero regressão. O avanço
-- dos runs (WAIT via next_run_at) e feito por um cron proprio (process-cadences)
-- que ENFILEIRA na message_queue existente (reusa fila + envio multi-provider,
-- incl. cloud_api/waha). Espelha o padrao do sdr_followups (scheduled_for +
-- cancel-se-responde) SEM acoplar ao SDR.
--
-- ⛔ O gatilho de START (o que inicia uma cadencia num lead) é SEGURADO (decisão
-- de produto pendente) — este schema so modela cadencia/passos/execucao.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- cadences: a sequencia (drip) configurada por empresa.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS veltzy.cadences (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id             UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name                   TEXT NOT NULL,
  is_enabled             BOOLEAN NOT NULL DEFAULT true,
  -- Cancelamento configuravel por mudanca de stage (responder e opt-out sao sempre obrigatorios).
  cancel_on_stage_change BOOLEAN NOT NULL DEFAULT false,
  created_by             UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE veltzy.cadences IS
  'Cadencia (drip) de marketing: sequencia de passos com WAIT. Corte B do mkt-ativo. O gatilho de START e separado (pendente de produto); a execucao/avanco e do process-cadences (cron) reusando a message_queue.';

CREATE INDEX IF NOT EXISTS idx_cadences_company ON veltzy.cadences (company_id);

ALTER TABLE veltzy.cadences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cadences_select" ON veltzy.cadences;
CREATE POLICY "cadences_select" ON veltzy.cadences FOR SELECT TO authenticated
  USING (company_id = veltzy.get_current_company_id() OR veltzy.is_super_admin());
DROP POLICY IF EXISTS "cadences_write" ON veltzy.cadences;
CREATE POLICY "cadences_write" ON veltzy.cadences FOR ALL TO authenticated
  USING ((company_id = veltzy.get_current_company_id() AND veltzy.is_admin_or_manager()) OR veltzy.is_super_admin());
DROP TRIGGER IF EXISTS on_cadences_updated ON veltzy.cadences;
CREATE TRIGGER on_cadences_updated BEFORE UPDATE ON veltzy.cadences
  FOR EACH ROW EXECUTE FUNCTION veltzy.handle_updated_at();

-- ---------------------------------------------------------------------------
-- cadence_steps: passos ordenados. action_type:
--   send_message  (config: {content})          — texto renderizado, enfileira msg
--   send_template (config: {template_id})       — HSM (cloud_api) / texto (nao-oficial)
--   wait          (config: {days, hours})       — atrasa o proximo passo (next_run_at)
--   add_tag / remove_tag (config: {tag})
--   change_stage  (config: {stage_id})
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS veltzy.cadence_steps (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cadence_id   UUID NOT NULL REFERENCES veltzy.cadences(id) ON DELETE CASCADE,
  step_order   INTEGER NOT NULL,
  action_type  TEXT NOT NULL CHECK (action_type IN (
    'send_message', 'send_template', 'wait', 'add_tag', 'remove_tag', 'change_stage'
  )),
  config       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cadence_id, step_order)
);

COMMENT ON TABLE veltzy.cadence_steps IS
  'Passos ordenados de uma cadencia. wait usa config{days,hours} (atrasa next_run_at); send_template reusa o envio do Corte A (cloud_api HSM / nao-oficial texto).';

CREATE INDEX IF NOT EXISTS idx_cadence_steps_cadence ON veltzy.cadence_steps (cadence_id, step_order);

ALTER TABLE veltzy.cadence_steps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cadence_steps_select" ON veltzy.cadence_steps;
CREATE POLICY "cadence_steps_select" ON veltzy.cadence_steps FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM veltzy.cadences c WHERE c.id = cadence_steps.cadence_id
    AND (c.company_id = veltzy.get_current_company_id() OR veltzy.is_super_admin())));
DROP POLICY IF EXISTS "cadence_steps_write" ON veltzy.cadence_steps;
CREATE POLICY "cadence_steps_write" ON veltzy.cadence_steps FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM veltzy.cadences c WHERE c.id = cadence_steps.cadence_id
    AND ((c.company_id = veltzy.get_current_company_id() AND veltzy.is_admin_or_manager()) OR veltzy.is_super_admin())));

-- ---------------------------------------------------------------------------
-- cadence_runs: a execucao de uma cadencia para UM lead. O WAIT vive aqui
-- (next_run_at); o cron process-cadences avanca. Cancela se lead responde /
-- opt-out / (opcional) mudou stage.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS veltzy.cadence_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cadence_id    UUID NOT NULL REFERENCES veltzy.cadences(id) ON DELETE CASCADE,
  lead_id       UUID NOT NULL REFERENCES veltzy.leads(id) ON DELETE CASCADE,
  company_id    UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE, -- desnormalizado p/ RLS/index
  current_step  INTEGER NOT NULL DEFAULT 0,   -- indice do proximo step a executar (0-based)
  status        TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'cancelled', 'failed')),
  next_run_at   TIMESTAMPTZ NOT NULL DEFAULT now(),  -- quando o cron processa o proximo passo
  cancel_reason TEXT,                                 -- 'lead_responded' | 'opt_out' | 'stage_changed' | ...
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cadence_id, lead_id)  -- 1 run por lead por cadencia (nao reinscreve em duplicidade)
);

COMMENT ON TABLE veltzy.cadence_runs IS
  'Execucao de uma cadencia para um lead. next_run_at = mecanismo de WAIT (cron process-cadences pega active + next_run_at<=now). Cancela se lead responde / opt-out / (config) stage muda.';

-- Indice parcial: o cron so busca runs ativos vencidos.
CREATE INDEX IF NOT EXISTS idx_cadence_runs_due ON veltzy.cadence_runs (next_run_at)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_cadence_runs_lead ON veltzy.cadence_runs (lead_id);
CREATE INDEX IF NOT EXISTS idx_cadence_runs_company ON veltzy.cadence_runs (company_id);

ALTER TABLE veltzy.cadence_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cadence_runs_select" ON veltzy.cadence_runs;
CREATE POLICY "cadence_runs_select" ON veltzy.cadence_runs FOR SELECT TO authenticated
  USING (company_id = veltzy.get_current_company_id() OR veltzy.is_super_admin());
DROP POLICY IF EXISTS "cadence_runs_write" ON veltzy.cadence_runs;
CREATE POLICY "cadence_runs_write" ON veltzy.cadence_runs FOR ALL TO authenticated
  USING ((company_id = veltzy.get_current_company_id() AND veltzy.is_admin_or_manager()) OR veltzy.is_super_admin());
DROP TRIGGER IF EXISTS on_cadence_runs_updated ON veltzy.cadence_runs;
CREATE TRIGGER on_cadence_runs_updated BEFORE UPDATE ON veltzy.cadence_runs
  FOR EACH ROW EXECUTE FUNCTION veltzy.handle_updated_at();
