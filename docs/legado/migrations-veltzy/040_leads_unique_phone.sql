-- =============================================================================
-- 040_leads_unique_phone.sql
-- Impede leads duplicados com mesmo telefone na mesma empresa
-- =============================================================================

-- Remove duplicatas existentes (mantém o mais antigo)
DELETE FROM veltzy.leads a
USING veltzy.leads b
WHERE a.company_id = b.company_id
  AND a.phone = b.phone
  AND a.created_at > b.created_at;

-- Cria constraint unique
ALTER TABLE veltzy.leads
ADD CONSTRAINT leads_company_phone_unique
UNIQUE (company_id, phone);
