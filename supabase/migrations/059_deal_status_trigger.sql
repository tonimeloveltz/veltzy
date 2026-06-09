-- Migration 059: Trigger para setar status do deal ao mover para stage final
-- EXECUTAR VIA SQL EDITOR (banco compartilhado, nao usar CLI)
--
-- Parte A: Trigger que auto-seta status won/lost quando deal move para stage final
-- Parte B: Constraint que valida stage pertence ao pipeline do deal

-- ============================================================
-- PARTE A: Trigger de status automatico
-- ============================================================

CREATE OR REPLACE FUNCTION veltzy.set_deal_status_on_stage_change()
RETURNS TRIGGER AS $$
DECLARE
  stage_record RECORD;
BEGIN
  -- So executar se stage_id mudou
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
    ELSIF OLD.status IN ('won', 'lost') THEN
      -- Se estava fechado e voltou para stage nao-final, reabrir
      NEW.status := 'open';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_deal_status_on_stage_change ON veltzy.deals;

CREATE TRIGGER trg_deal_status_on_stage_change
  BEFORE UPDATE ON veltzy.deals
  FOR EACH ROW
  EXECUTE FUNCTION veltzy.set_deal_status_on_stage_change();

-- ============================================================
-- PARTE B: Constraint de integridade pipeline/stage
-- ============================================================

CREATE OR REPLACE FUNCTION veltzy.validate_deal_stage_pipeline()
RETURNS TRIGGER AS $$
BEGIN
  -- Validar que stage pertence ao pipeline do deal
  IF NEW.stage_id IS NOT NULL AND NEW.pipeline_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM veltzy.pipeline_stages
      WHERE id = NEW.stage_id AND pipeline_id = NEW.pipeline_id
    ) THEN
      RAISE EXCEPTION 'Stage % nao pertence ao pipeline %', NEW.stage_id, NEW.pipeline_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_deal_stage_pipeline ON veltzy.deals;

CREATE TRIGGER trg_validate_deal_stage_pipeline
  BEFORE INSERT OR UPDATE ON veltzy.deals
  FOR EACH ROW
  EXECUTE FUNCTION veltzy.validate_deal_stage_pipeline();
