-- ============================================================
-- 063: Temperatura do lead por atividade (sem IA)
-- Regra: baseada no tempo desde a ultima mensagem RECEBIDA do lead
-- Aplicar via Dashboard SQL Editor (nao CLI)
-- ============================================================

-- 1. Criar coluna para armazenar timestamp da ultima mensagem do lead
ALTER TABLE veltzy.leads
ADD COLUMN IF NOT EXISTS last_customer_message_at TIMESTAMPTZ;

-- 2. Funcao que computa temperatura a partir de um timestamp
CREATE OR REPLACE FUNCTION veltzy.compute_lead_temperature(last_msg_at TIMESTAMPTZ)
RETURNS veltzy.lead_temperature
LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN last_msg_at IS NULL THEN 'cold'::veltzy.lead_temperature
    WHEN last_msg_at > now() - INTERVAL '1 hour'  THEN 'fire'::veltzy.lead_temperature
    WHEN last_msg_at > now() - INTERVAL '24 hours' THEN 'hot'::veltzy.lead_temperature
    WHEN last_msg_at > now() - INTERVAL '3 days'   THEN 'warm'::veltzy.lead_temperature
    ELSE 'cold'::veltzy.lead_temperature
  END
$$;

-- 3. Trigger: ao inserir mensagem do lead, popular timestamp + setar fire
CREATE OR REPLACE FUNCTION veltzy.trg_update_temperature_on_message()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = veltzy, public
AS $$
BEGIN
  IF NEW.sender_type = 'lead' THEN
    UPDATE veltzy.leads
    SET last_customer_message_at = NEW.created_at,
        temperature = 'fire'
    WHERE id = NEW.lead_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lead_temperature_on_message ON veltzy.messages;
CREATE TRIGGER trg_lead_temperature_on_message
  AFTER INSERT ON veltzy.messages
  FOR EACH ROW
  EXECUTE FUNCTION veltzy.trg_update_temperature_on_message();

-- 4. Funcao de recalculo (chamada pelo cron a cada hora para esfriamento)
-- NOTA: se a tabela leads crescer muito, otimizar filtrando por
-- last_customer_message_at > now() - INTERVAL '4 days' (leads que ainda
-- podem mudar de temperatura) ou excluindo status archived.
CREATE OR REPLACE FUNCTION veltzy.recalculate_lead_temperatures()
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path = veltzy, public
AS $$
  UPDATE veltzy.leads
  SET temperature = veltzy.compute_lead_temperature(last_customer_message_at)
  WHERE temperature IS DISTINCT FROM veltzy.compute_lead_temperature(last_customer_message_at);
$$;

-- 5. Backfill: popular last_customer_message_at a partir do historico de mensagens
UPDATE veltzy.leads l
SET last_customer_message_at = sub.last_msg
FROM (
  SELECT lead_id, MAX(created_at) AS last_msg
  FROM veltzy.messages
  WHERE sender_type = 'lead'
  GROUP BY lead_id
) sub
WHERE l.id = sub.lead_id;

-- 6. Recalcular temperaturas com os timestamps corretos
SELECT veltzy.recalculate_lead_temperatures();

-- 7. pg_cron: recalcular a cada hora (esfriamento gradual)
-- Requer extensao pg_cron habilitada no Supabase (habilitada por padrao)
SELECT cron.schedule(
  'recalculate-lead-temperatures',
  '0 * * * *',
  $$SELECT veltzy.recalculate_lead_temperatures()$$
);
