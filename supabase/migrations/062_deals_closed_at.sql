-- Migration 062: Adicionar closed_at em deals + atualizar trigger de status
-- EXECUTAR VIA SQL EDITOR (banco compartilhado, nao usar CLI)

-- 1. Adicionar coluna
ALTER TABLE veltzy.deals ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

-- 2. Backfill: deals ja won/lost recebem updated_at como aproximacao
UPDATE veltzy.deals
SET closed_at = updated_at
WHERE status IN ('won', 'lost') AND closed_at IS NULL;

-- 3. Atualizar trigger para setar closed_at
CREATE OR REPLACE FUNCTION veltzy.set_deal_status_on_stage_change()
RETURNS TRIGGER AS $$
DECLARE
  stage_record RECORD;
BEGIN
  IF NEW.stage_id IS DISTINCT FROM OLD.stage_id AND NEW.stage_id IS NOT NULL THEN
    SELECT is_final, is_positive
    INTO stage_record
    FROM veltzy.pipeline_stages
    WHERE id = NEW.stage_id;

    IF stage_record.is_final THEN
      IF stage_record.is_positive THEN
        NEW.status := 'won';
      ELSE
        NEW.status := 'lost';
      END IF;
      NEW.closed_at := now();
    ELSIF OLD.status IN ('won', 'lost') THEN
      -- Reabriu: limpar closed_at
      NEW.status := 'open';
      NEW.closed_at := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
