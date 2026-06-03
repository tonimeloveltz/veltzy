-- 056_fix_source_integrations_rls.sql
-- Fix: INSERT em veltzy.source_integrations falhava com RLS violation.
-- Causa: policy FOR ALL nao existia ou faltava WITH CHECK.
-- Solucao: dropar todas as policies e recriar de forma limpa.

-- Garantir RLS habilitado
ALTER TABLE veltzy.source_integrations ENABLE ROW LEVEL SECURITY;

-- Dropar todas as policies existentes (nomes possiveis da 010 e 056)
DROP POLICY IF EXISTS "vz_si_select" ON veltzy.source_integrations;
DROP POLICY IF EXISTS "vz_si_all" ON veltzy.source_integrations;
DROP POLICY IF EXISTS "vz_si_insert" ON veltzy.source_integrations;
DROP POLICY IF EXISTS "vz_si_update" ON veltzy.source_integrations;
DROP POLICY IF EXISTS "vz_si_delete" ON veltzy.source_integrations;

-- SELECT: qualquer membro da empresa
CREATE POLICY "vz_si_select" ON veltzy.source_integrations
  FOR SELECT TO authenticated
  USING (
    company_id = veltzy.get_current_company_id()
    OR veltzy.is_super_admin()
  );

-- INSERT/UPDATE/DELETE: admin da empresa ou super_admin
CREATE POLICY "vz_si_all" ON veltzy.source_integrations
  FOR ALL TO authenticated
  USING (
    (company_id = veltzy.get_current_company_id() AND veltzy.is_company_admin())
    OR veltzy.is_super_admin()
  )
  WITH CHECK (
    (company_id = veltzy.get_current_company_id() AND veltzy.is_company_admin())
    OR veltzy.is_super_admin()
  );
