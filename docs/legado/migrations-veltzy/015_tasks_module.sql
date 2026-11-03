-- Modulo Tarefas
CREATE TABLE veltzy.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES veltzy.leads(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('todo', 'followup', 'call', 'meeting')),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'done', 'cancelled')),
  due_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  meeting_date TIMESTAMPTZ,
  meeting_duration INT,
  meeting_link TEXT,
  meeting_lead_email TEXT,
  google_event_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tasks_company_id ON veltzy.tasks(company_id);
CREATE INDEX idx_tasks_lead_id ON veltzy.tasks(lead_id);
CREATE INDEX idx_tasks_assigned_to ON veltzy.tasks(assigned_to);
CREATE INDEX idx_tasks_status ON veltzy.tasks(status);
CREATE INDEX idx_tasks_due_date ON veltzy.tasks(due_date);

ALTER TABLE veltzy.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tasks_company_isolation" ON veltzy.tasks
FOR ALL TO authenticated
USING (company_id = veltzy.get_current_company_id() OR veltzy.is_super_admin())
WITH CHECK (company_id = veltzy.get_current_company_id() OR veltzy.is_super_admin());

CREATE TRIGGER set_updated_at BEFORE UPDATE ON veltzy.tasks
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
