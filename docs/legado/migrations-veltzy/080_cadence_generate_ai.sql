-- ============================================================================
-- 080_cadence_generate_ai.sql
-- mkt-ativo IA · ação 'generate_ai' nas cadências. SPEC: SPEC-mkt-ativo-ia.md
--
-- Adiciona 'generate_ai' ao CHECK de cadence_steps.action_type. config (jsonb livre,
-- sem mudança de schema) carrega {prompt, temperature?, max_tokens?}. A geração passa
-- SEMPRE pelo gateway do Hub (ai-complete) e é gateada por companies.features.ai_msg_enabled
-- (server-side, custo). Aditivo.
-- ============================================================================

ALTER TABLE veltzy.cadence_steps DROP CONSTRAINT IF EXISTS cadence_steps_action_type_check;
ALTER TABLE veltzy.cadence_steps ADD CONSTRAINT cadence_steps_action_type_check
  CHECK (action_type IN (
    'send_message', 'send_template', 'wait', 'add_tag', 'remove_tag', 'change_stage', 'generate_ai'
  ));
