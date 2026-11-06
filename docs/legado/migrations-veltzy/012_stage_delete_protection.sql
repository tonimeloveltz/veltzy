-- Protege contra deleção de stages que ainda possuem leads
CREATE OR REPLACE FUNCTION veltzy.check_stage_has_leads()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM veltzy.leads
    WHERE stage_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'Não é possível excluir uma etapa que contém leads.';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_stage_leads ON veltzy.pipeline_stages;

CREATE TRIGGER trg_check_stage_leads
BEFORE DELETE ON veltzy.pipeline_stages
FOR EACH ROW
EXECUTE FUNCTION veltzy.check_stage_has_leads();
