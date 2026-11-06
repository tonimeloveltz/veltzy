-- 054_create_deals_table.sql
-- Cria tabela deals (negocios) separada de leads (contatos).
-- Um lead pode ter multiplos deals simultaneos.

-- Tabela deals
CREATE TABLE IF NOT EXISTS veltzy.deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES veltzy.leads(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Negocio',
  value NUMERIC DEFAULT 0,
  stage_id UUID REFERENCES veltzy.pipeline_stages(id) ON DELETE SET NULL,
  pipeline_id UUID REFERENCES veltzy.pipelines(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'won', 'lost', 'archived', 'pending_assignment')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_deals_company_id ON veltzy.deals(company_id);
CREATE INDEX IF NOT EXISTS idx_deals_lead_id ON veltzy.deals(lead_id);
CREATE INDEX IF NOT EXISTS idx_deals_stage_id ON veltzy.deals(stage_id);
CREATE INDEX IF NOT EXISTS idx_deals_assigned_to ON veltzy.deals(assigned_to);
CREATE INDEX IF NOT EXISTS idx_deals_status ON veltzy.deals(status);

-- RLS
ALTER TABLE veltzy.deals ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'vz_deals_select' AND tablename = 'deals') THEN
    CREATE POLICY "vz_deals_select" ON veltzy.deals
      FOR SELECT TO authenticated
      USING (company_id = veltzy.get_current_company_id() OR veltzy.is_super_admin());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'vz_deals_insert' AND tablename = 'deals') THEN
    CREATE POLICY "vz_deals_insert" ON veltzy.deals
      FOR INSERT TO authenticated
      WITH CHECK (company_id = veltzy.get_current_company_id() OR veltzy.is_super_admin());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'vz_deals_update' AND tablename = 'deals') THEN
    CREATE POLICY "vz_deals_update" ON veltzy.deals
      FOR UPDATE TO authenticated
      USING (company_id = veltzy.get_current_company_id() OR veltzy.is_super_admin());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'vz_deals_delete' AND tablename = 'deals') THEN
    CREATE POLICY "vz_deals_delete" ON veltzy.deals
      FOR DELETE TO authenticated
      USING (veltzy.is_company_admin() OR veltzy.is_super_admin());
  END IF;
END $$;

-- GRANT
GRANT SELECT, INSERT, UPDATE, DELETE ON veltzy.deals TO authenticated;
GRANT ALL ON veltzy.deals TO service_role;

-- updated_at trigger
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_deals_updated_at') THEN
    CREATE TRIGGER set_deals_updated_at
      BEFORE UPDATE ON veltzy.deals
      FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
  END IF;
END $$;

-- Migration de dados: criar deal para cada lead existente (idempotente)
INSERT INTO veltzy.deals (
  company_id,
  lead_id,
  name,
  value,
  stage_id,
  pipeline_id,
  assigned_to,
  status,
  created_at
)
SELECT
  l.company_id,
  l.id,
  COALESCE(l.name, 'Negocio') AS name,
  COALESCE(l.deal_value, 0) AS value,
  l.stage_id,
  l.pipeline_id,
  l.assigned_to,
  CASE
    WHEN l.status = 'deal' THEN 'won'
    WHEN l.status = 'lost' THEN 'lost'
    WHEN l.status = 'archived' THEN 'archived'
    ELSE 'open'
  END AS status,
  l.created_at
FROM veltzy.leads l
WHERE NOT EXISTS (
  SELECT 1 FROM veltzy.deals d WHERE d.lead_id = l.id
);
