-- Migration 060: Permitir manager criar/editar/deletar reply_templates
-- EXECUTAR VIA SQL EDITOR (banco compartilhado, nao usar CLI)
--
-- Antes: vz_rt_all usava is_company_admin() (so admin + super_admin)
-- Depois: usa is_admin_or_manager() (admin + manager + super_admin)
-- SELECT (vz_rt_select) continua igual — todos da empresa podem ver

DROP POLICY IF EXISTS "vz_rt_all" ON veltzy.reply_templates;

CREATE POLICY "vz_rt_all" ON veltzy.reply_templates
  FOR ALL TO authenticated
  USING (
    company_id = veltzy.get_current_company_id() AND veltzy.is_admin_or_manager()
    OR veltzy.is_super_admin()
  );
