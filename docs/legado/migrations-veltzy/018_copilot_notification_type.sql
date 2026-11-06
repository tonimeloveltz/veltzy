-- Adicionar tipo 'copilot' ao CHECK constraint de notifications
ALTER TABLE veltzy.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE veltzy.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('new_lead', 'lead_assigned', 'new_message', 'lead_transferred', 'system', 'copilot'));
