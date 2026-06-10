-- ============================================================
-- 064: Unique partial index para pending_assignment
-- Impede mais de 1 deal pending_assignment por lead+pipeline
-- EXECUTAR via Dashboard SQL Editor DEPOIS de limpar duplicados
-- ============================================================

-- Passo 1: Limpeza dos duplicados (manter o mais antigo de cada grupo)
-- Rodar ANTES do CREATE INDEX
DELETE FROM veltzy.deals
WHERE id NOT IN (
  SELECT DISTINCT ON (lead_id, pipeline_id) id
  FROM veltzy.deals
  WHERE status = 'pending_assignment'
  ORDER BY lead_id, pipeline_id, created_at ASC
)
AND status = 'pending_assignment';

-- Passo 2: Criar unique index (rede de seguranca contra race condition)
CREATE UNIQUE INDEX IF NOT EXISTS idx_deals_unique_pending
ON veltzy.deals (lead_id, pipeline_id)
WHERE status = 'pending_assignment';
