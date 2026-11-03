-- =============================================================================
-- 044_leads_unique_instagram_id.sql
-- Impede leads duplicados com mesmo instagram_id na mesma empresa
-- =============================================================================

-- Remove duplicatas existentes de instagram_id (mantém o mais antigo)
DELETE FROM veltzy.leads a
USING veltzy.leads b
WHERE a.company_id = b.company_id
  AND a.instagram_id = b.instagram_id
  AND a.instagram_id IS NOT NULL
  AND a.created_at > b.created_at;

-- Cria constraint unique parcial (apenas quando instagram_id nao e null)
CREATE UNIQUE INDEX IF NOT EXISTS leads_company_instagram_unique
  ON veltzy.leads (company_id, instagram_id)
  WHERE instagram_id IS NOT NULL;
