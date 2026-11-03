-- Migration 033: Bulk Actions - Adicionar status 'archived' e atualizar trigger
-- =============================================================================

-- 1. Adicionar valor 'archived' ao enum lead_status
ALTER TYPE veltzy.lead_status ADD VALUE IF NOT EXISTS 'archived';

-- 2. Atualizar trigger log_lead_activity para logar mudancas de status
CREATE OR REPLACE FUNCTION veltzy.log_lead_activity()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO veltzy.activity_logs (company_id, user_id, action, resource_type, resource_id, metadata)
        VALUES (NEW.company_id, auth.uid(), 'created', 'lead', NEW.id,
            jsonb_build_object('name', NEW.name, 'phone', NEW.phone));
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.stage_id != NEW.stage_id THEN
            INSERT INTO veltzy.activity_logs (company_id, user_id, action, resource_type, resource_id, metadata)
            VALUES (NEW.company_id, auth.uid(), 'stage_changed', 'lead', NEW.id,
                jsonb_build_object('from_stage', OLD.stage_id, 'to_stage', NEW.stage_id));
        END IF;
        IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
            INSERT INTO veltzy.activity_logs (company_id, user_id, action, resource_type, resource_id, metadata)
            VALUES (NEW.company_id, auth.uid(), 'assigned', 'lead', NEW.id,
                jsonb_build_object('from', OLD.assigned_to, 'to', NEW.assigned_to));
        END IF;
        -- NOVO: log de mudanca de status (inclui archived)
        IF OLD.status IS DISTINCT FROM NEW.status THEN
            INSERT INTO veltzy.activity_logs (company_id, user_id, action, resource_type, resource_id, metadata)
            VALUES (NEW.company_id, auth.uid(), 'status_changed', 'lead', NEW.id,
                jsonb_build_object('from_status', OLD.status::text, 'to_status', NEW.status::text));
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = veltzy, public;
