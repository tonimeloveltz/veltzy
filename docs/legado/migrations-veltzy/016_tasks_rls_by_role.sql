-- RLS granular por role para tasks
DROP POLICY IF EXISTS "tasks_company_isolation" ON veltzy.tasks;

-- Admin e Manager veem tudo da empresa
CREATE POLICY "tasks_admin_manager_all" ON veltzy.tasks
FOR ALL TO authenticated
USING (
  company_id = veltzy.get_current_company_id()
  AND veltzy.is_admin_or_manager()
)
WITH CHECK (
  company_id = veltzy.get_current_company_id()
  AND veltzy.is_admin_or_manager()
);

-- Seller e Representative veem apenas tarefas proprias (assigned ou created)
CREATE POLICY "tasks_seller_own_only" ON veltzy.tasks
FOR ALL TO authenticated
USING (
  company_id = veltzy.get_current_company_id()
  AND (assigned_to = veltzy.get_current_profile_id() OR created_by = veltzy.get_current_profile_id())
  AND NOT veltzy.is_admin_or_manager()
)
WITH CHECK (
  company_id = veltzy.get_current_company_id()
  AND NOT veltzy.is_admin_or_manager()
);

-- Super admin acesso total
CREATE POLICY "tasks_super_admin" ON veltzy.tasks
FOR ALL TO authenticated
USING (veltzy.is_super_admin())
WITH CHECK (veltzy.is_super_admin());
