-- ============================================================================
-- 075_leads_marketing_opt_out.sql
-- Frente mkt-ativo (Fase 1) · §4bis — opt-out de marketing por lead.
-- SPEC: SPEC-mkt-ativo-fase1.md
--
-- O Veltzy nao tinha opt-out/block/do-not-contact de lead. Este e o MINIMO
-- aprovado: marcacao por-lead que o disparo em massa (edge blast-dispatch)
-- vai EXCLUIR da audiencia. Aditivo e seguro (colunas com default).
--
-- Fase 2: captura automatica de 'SAIR'/'PARE' numa resposta (por ora, marcacao
-- manual/UI). Escopo desta migration = so as colunas + indice.
-- ============================================================================

ALTER TABLE veltzy.leads
  ADD COLUMN IF NOT EXISTS marketing_opt_out BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS opt_out_at TIMESTAMPTZ;

COMMENT ON COLUMN veltzy.leads.marketing_opt_out IS
  'Lead pediu para nao receber disparos de marketing (mkt-ativo). O blast-dispatch exclui marketing_opt_out=true da audiencia. Fase 1: marcacao manual/UI.';
COMMENT ON COLUMN veltzy.leads.opt_out_at IS
  'Momento em que o lead optou por sair (marketing_opt_out). Null se nunca optou.';

-- Indice parcial: so os que optaram por sair (minoria) — acelera a exclusao na
-- montagem da audiencia sem custo em leads ativos.
CREATE INDEX IF NOT EXISTS idx_leads_marketing_opt_out
  ON veltzy.leads (company_id)
  WHERE marketing_opt_out = true;
