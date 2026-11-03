-- Lembretes de reuniao
CREATE TABLE veltzy.task_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES veltzy.tasks(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES veltzy.leads(id) ON DELETE SET NULL,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'email', 'both')),
  scheduled_at TIMESTAMPTZ NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'edited', 'cancelled', 'failed')),
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_task_reminders_task_id ON veltzy.task_reminders(task_id);
CREATE INDEX idx_task_reminders_scheduled_at ON veltzy.task_reminders(scheduled_at);
CREATE INDEX idx_task_reminders_status ON veltzy.task_reminders(status);

ALTER TABLE veltzy.task_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_reminders_company_isolation" ON veltzy.task_reminders
FOR ALL TO authenticated
USING (company_id = veltzy.get_current_company_id() OR veltzy.is_super_admin())
WITH CHECK (company_id = veltzy.get_current_company_id() OR veltzy.is_super_admin());

CREATE TRIGGER set_updated_at BEFORE UPDATE ON veltzy.task_reminders
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
