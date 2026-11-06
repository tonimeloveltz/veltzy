-- ===========================================
-- MULTIPLOS PIPELINES POR EMPRESA
-- ===========================================

-- 1. Nova tabela: veltzy.pipelines
CREATE TABLE veltzy.pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6B7280',
  position INTEGER NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, slug)
);

CREATE INDEX idx_pipelines_company ON veltzy.pipelines(company_id);
CREATE INDEX idx_pipelines_company_active ON veltzy.pipelines(company_id, is_active);

-- RLS
ALTER TABLE veltzy.pipelines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vz_pip_select" ON veltzy.pipelines FOR SELECT TO authenticated
  USING (company_id = veltzy.get_current_company_id() OR veltzy.is_super_admin());

CREATE POLICY "vz_pip_all" ON veltzy.pipelines FOR ALL TO authenticated
  USING (
    (company_id = veltzy.get_current_company_id() AND veltzy.is_company_admin())
    OR veltzy.is_super_admin()
  );

-- Trigger updated_at
CREATE TRIGGER on_pipelines_updated
  BEFORE UPDATE ON veltzy.pipelines
  FOR EACH ROW EXECUTE FUNCTION veltzy.handle_updated_at();

-- Constraint: apenas 1 default por empresa
CREATE OR REPLACE FUNCTION veltzy.ensure_single_default_pipeline()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE veltzy.pipelines
    SET is_default = false
    WHERE company_id = NEW.company_id
      AND id != NEW.id
      AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = veltzy, public;

CREATE TRIGGER ensure_single_default_pipeline_trigger
  BEFORE INSERT OR UPDATE OF is_default ON veltzy.pipelines
  FOR EACH ROW EXECUTE FUNCTION veltzy.ensure_single_default_pipeline();

-- 2. Adicionar pipeline_id em pipeline_stages
ALTER TABLE veltzy.pipeline_stages ADD COLUMN pipeline_id UUID REFERENCES veltzy.pipelines(id) ON DELETE CASCADE;
CREATE INDEX idx_pipeline_stages_pipeline ON veltzy.pipeline_stages(pipeline_id);

-- 3. Adicionar pipeline_id em leads
ALTER TABLE veltzy.leads ADD COLUMN pipeline_id UUID REFERENCES veltzy.pipelines(id) ON DELETE SET NULL;
CREATE INDEX idx_leads_pipeline ON veltzy.leads(pipeline_id);

-- 4. Migracao de dados (idempotente)
-- Para cada company que tem stages, criar pipeline padrao
INSERT INTO veltzy.pipelines (company_id, name, slug, color, position, is_default, is_active)
SELECT DISTINCT
  company_id,
  'Pipeline Principal',
  'principal',
  '#3B82F6',
  0,
  true,
  true
FROM veltzy.pipeline_stages
WHERE company_id NOT IN (SELECT company_id FROM veltzy.pipelines)
ON CONFLICT (company_id, slug) DO NOTHING;

-- Popular pipeline_id nos stages existentes
UPDATE veltzy.pipeline_stages ps
SET pipeline_id = p.id
FROM veltzy.pipelines p
WHERE ps.company_id = p.company_id
  AND p.is_default = true
  AND ps.pipeline_id IS NULL;

-- Popular pipeline_id nos leads existentes
UPDATE veltzy.leads l
SET pipeline_id = p.id
FROM veltzy.pipelines p
WHERE l.company_id = p.company_id
  AND p.is_default = true
  AND l.pipeline_id IS NULL;

-- Tornar NOT NULL apos migracao
ALTER TABLE veltzy.pipeline_stages ALTER COLUMN pipeline_id SET NOT NULL;
ALTER TABLE veltzy.leads ALTER COLUMN pipeline_id SET NOT NULL;

-- 5. Atualizar trigger de criacao de empresa
CREATE OR REPLACE FUNCTION veltzy.create_default_pipeline()
RETURNS TRIGGER AS $$
DECLARE
  v_pipeline_id UUID;
BEGIN
  -- Criar pipeline padrao
  INSERT INTO veltzy.pipelines (company_id, name, slug, color, position, is_default, is_active)
  VALUES (NEW.id, 'Pipeline Principal', 'principal', '#3B82F6', 0, true, true)
  RETURNING id INTO v_pipeline_id;

  -- Criar estagios padrao vinculados ao pipeline
  INSERT INTO veltzy.pipeline_stages (company_id, pipeline_id, name, slug, position, color, is_final, is_positive) VALUES
    (NEW.id, v_pipeline_id, 'Novo Lead',        'novo-lead',        0, '#3B82F6', false, null),
    (NEW.id, v_pipeline_id, 'Qualificando',     'qualificando',     1, '#F59E0B', false, null),
    (NEW.id, v_pipeline_id, 'Em Negociacao',    'em-negociacao',    2, '#8B5CF6', false, null),
    (NEW.id, v_pipeline_id, 'Proposta Enviada', 'proposta-enviada', 3, '#06B6D4', false, null),
    (NEW.id, v_pipeline_id, 'Fechado (Ganho)',  'fechado-ganho',    4, '#22C55E', true,  true),
    (NEW.id, v_pipeline_id, 'Perdido',          'perdido',          5, '#EF4444', true,  false);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = veltzy, public;
