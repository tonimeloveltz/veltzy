-- =============================================================================
-- 036_accept_invitation_rpc.sql
-- RPC SECURITY DEFINER para aceitar convite (bypassa RLS de user_roles/profiles)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.accept_invitation(
  p_invitation_id UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _invite RECORD;
BEGIN
  -- Busca convite pendente e valido
  SELECT * INTO _invite FROM public.invitations
  WHERE id = p_invitation_id
    AND status = 'pending'
    AND expires_at > now();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Convite invalido ou expirado');
  END IF;

  -- Atualiza profile com company_id
  UPDATE public.profiles
  SET company_id = _invite.company_id,
      updated_at = now()
  WHERE user_id = p_user_id;

  -- Remove role generico sem company (criado pelo trigger on_auth_user_created)
  DELETE FROM public.user_roles
  WHERE user_id = p_user_id AND company_id IS NULL;

  -- Insere role correto com company_id
  INSERT INTO public.user_roles (user_id, company_id, role)
  VALUES (p_user_id, _invite.company_id, _invite.role)
  ON CONFLICT (user_id, role) DO UPDATE SET company_id = _invite.company_id;

  -- Marca convite como aceito
  UPDATE public.invitations
  SET status = 'accepted', accepted_at = now()
  WHERE id = p_invitation_id;

  RETURN jsonb_build_object(
    'success', true,
    'company_id', _invite.company_id,
    'role', _invite.role
  );
END;
$$;

-- Permite chamada por usuarios autenticados
GRANT EXECUTE ON FUNCTION public.accept_invitation(UUID, UUID) TO authenticated;
