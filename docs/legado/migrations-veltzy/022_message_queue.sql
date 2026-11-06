-- Fila de mensagens com rate limit para proteger numero WhatsApp
CREATE TABLE veltzy.message_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES veltzy.leads(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'text',
  file_url TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  error_message TEXT,
  source TEXT DEFAULT 'automation',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_message_queue_status
ON veltzy.message_queue(company_id, status, scheduled_at);

ALTER TABLE veltzy.message_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "message_queue_company_isolation" ON veltzy.message_queue
FOR ALL TO authenticated
USING (company_id = veltzy.get_current_company_id() OR veltzy.is_super_admin())
WITH CHECK (company_id = veltzy.get_current_company_id() OR veltzy.is_super_admin());
