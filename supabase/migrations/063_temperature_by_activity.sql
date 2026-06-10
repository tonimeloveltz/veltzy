-- ============================================================
-- 063: Temperatura do lead por atividade (sem IA)
-- Regra: baseada no tempo desde a ultima mensagem RECEBIDA do lead
-- Aplicar via Dashboard SQL Editor (nao CLI)
-- ============================================================

-- 1. Funcao que computa temperatura a partir de um timestamp
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

-- 2. Trigger: ao inserir mensagem do lead (sender_type=lead), setar temperatura=fire
CREATE OR REPLACE FUNCTION veltzy.trg_update_temperature_on_message()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = veltzy, public
AS $$
BEGIN
  IF NEW.sender_type = 'lead' THEN
    UPDATE veltzy.leads
    SET temperature = 'fire'
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

-- 3. Funcao de recalculo (chamada pelo cron)
CREATE OR REPLACE FUNCTION veltzy.recalculate_lead_temperatures()
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path = veltzy, public
AS $$
  UPDATE veltzy.leads
  SET temperature = veltzy.compute_lead_temperature(last_customer_message_at)
  WHERE temperature IS DISTINCT FROM veltzy.compute_lead_temperature(last_customer_message_at);
$$;

-- 4. pg_cron: recalcular a cada hora (esfriamento)
-- Requer extensao pg_cron habilitada no Supabase (habilitada por padrao)
SELECT cron.schedule(
  'recalculate-lead-temperatures',
  '0 * * * *',
  $$SELECT veltzy.recalculate_lead_temperatures()$$
);

-- 5. Backfill: recalcular todos os leads existentes agora
SELECT veltzy.recalculate_lead_temperatures();
