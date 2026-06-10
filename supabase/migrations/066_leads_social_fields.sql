-- ============================================================
-- 066: Campos de redes sociais no contato (lead)
-- Aplicar via Dashboard SQL Editor (nao CLI)
-- ============================================================

ALTER TABLE veltzy.leads
ADD COLUMN IF NOT EXISTS instagram_handle TEXT,
ADD COLUMN IF NOT EXISTS linkedin_url TEXT;
