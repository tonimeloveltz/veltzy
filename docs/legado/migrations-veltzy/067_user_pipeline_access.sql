-- F3: Controle de acesso de vendedor a pipelines (allowlist app-level)
-- Linha presente = vendedor tem acesso ao pipeline
-- Sem linhas = vendedor ve todos (default permissivo)

CREATE TABLE IF NOT EXISTS veltzy.user_pipeline_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  pipeline_id UUID NOT NULL REFERENCES veltzy.pipelines(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, pipeline_id)
);

CREATE INDEX IF NOT EXISTS idx_upa_user ON veltzy.user_pipeline_access (user_id);
CREATE INDEX IF NOT EXISTS idx_upa_pipeline ON veltzy.user_pipeline_access (pipeline_id);
CREATE INDEX IF NOT EXISTS idx_upa_company ON veltzy.user_pipeline_access (company_id);

ALTER TABLE veltzy.user_pipeline_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "upa_select" ON veltzy.user_pipeline_access FOR SELECT TO authenticated
  USING (company_id = veltzy.get_current_company_id() OR veltzy.is_super_admin());

CREATE POLICY "upa_all" ON veltzy.user_pipeline_access FOR ALL TO authenticated
  USING (
    (company_id = veltzy.get_current_company_id() AND veltzy.is_admin_or_manager())
    OR veltzy.is_super_admin()
  );
