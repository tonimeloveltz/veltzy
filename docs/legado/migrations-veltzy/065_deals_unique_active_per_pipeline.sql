-- ============================================================
-- 065: Unique index para deals ativos por lead+pipeline
-- Impede 2 deals open ou pending_assignment simultaneos
-- para o mesmo lead no mesmo pipeline.
-- EXECUTAR via Dashboard SQL Editor DEPOIS de limpar duplicados.
-- ============================================================

-- Passo 0: Dimensionar (rodar antes, so leitura)
-- SELECT company_id, lead_id, pipeline_id, count(*) as total,
--        array_agg(status ORDER BY created_at) as statuses
-- FROM veltzy.deals
-- GROUP BY company_id, lead_id, pipeline_id
-- HAVING count(*) > 1
-- ORDER BY count(*) DESC;

-- Passo 1: Remover index parcial antigo (coberto pelo novo)
DROP INDEX IF EXISTS veltzy.idx_deals_unique_pending;

-- Passo 2: Criar index abrangente (open + pending_assignment)
CREATE UNIQUE INDEX IF NOT EXISTS idx_deals_unique_active_per_pipeline
ON veltzy.deals (lead_id, pipeline_id)
WHERE status IN ('open', 'pending_assignment');
