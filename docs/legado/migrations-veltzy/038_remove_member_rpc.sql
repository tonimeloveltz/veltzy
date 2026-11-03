-- =============================================================================
-- 038_remove_member_rpc.sql
-- RPC para remover membro da empresa e reatribuir seus leads
-- =============================================================================

CREATE OR REPLACE FUNCTION public.remove_user_from_company(
  p_target_user_id UUID,
  p_reassign_to UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _company_id UUID;
  _profile_id UUID;
  _leads_count INT;
BEGIN
  -- Busca company_id do usuario alvo
  SELECT company_id, id INTO _company_id, _profile_id
  FROM public.profiles
  WHERE user_id = p_target_user_id;

  IF _company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuario nao pertence a nenhuma empresa');
  END IF;

  -- Conta leads atribuidos ao membro
  SELECT count(*) INTO _leads_count
  FROM veltzy.leads
  WHERE company_id = _company_id AND assigned_to = _profile_id;

  -- Reatribui leads se necessario
  IF _leads_count > 0 THEN
    IF p_reassign_to IS NOT NULL THEN
      UPDATE veltzy.leads
      SET assigned_to = p_reassign_to, updated_at = now()
      WHERE company_id = _company_id AND assigned_to = _profile_id;
    ELSE
      UPDATE veltzy.leads
      SET assigned_to = NULL, updated_at = now()
      WHERE company_id = _company_id AND assigned_to = _profile_id;
    END IF;
  END IF;

  -- Remove roles do usuario nesta empresa
  DELETE FROM public.user_roles
  WHERE user_id = p_target_user_id AND company_id = _company_id;

  -- Desvincula profile da empresa
  UPDATE public.profiles
  SET company_id = NULL, updated_at = now()
  WHERE user_id = p_target_user_id AND company_id = _company_id;

  RETURN jsonb_build_object(
    'success', true,
    'leads_reassigned', _leads_count,
    'reassigned_to', p_reassign_to
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_user_from_company(UUID, UUID) TO authenticated;
