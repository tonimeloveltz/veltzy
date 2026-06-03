-- 057_fix_source_integrations_rls_v2.sql
-- Fix: INSERT em veltzy.source_integrations falhava com RLS violation.
-- A 056 criou vz_si_all mas pode ter conflitado com a vz_si_select existente.
-- Esta migration dropa tudo e recria de forma limpa e idempotente.

-- Garantir RLS habilitado
ALTER TABLE veltzy.source_integrations ENABLE ROW LEVEL SECURITY;

-- Dropar todas as policies existentes
DROP POLICY IF EXISTS "vz_si_select" ON veltzy.source_integrations;
DROP POLICY IF EXISTS "vz_si_all" ON veltzy.source_integrations;

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
