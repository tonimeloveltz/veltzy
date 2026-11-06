-- Fase 0: Campo empresa no contato
ALTER TABLE veltzy.leads
ADD COLUMN IF NOT EXISTS company_name TEXT;

COMMENT ON COLUMN veltzy.leads.company_name IS 'Empresa que o contato representa (nao confundir com o tenant do SaaS)';
