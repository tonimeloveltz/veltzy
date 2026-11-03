-- =============================================================================
-- 039_fix_accept_invitation_with_name.sql
-- Adiciona parametro p_name para atualizar profile dentro da RPC
-- (evita update separado que falha por RLS quando user nao tem sessao)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.accept_invitation(
  p_invitation_id UUID,
  p_user_id UUID,
  p_name TEXT DEFAULT NULL
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

  -- Atualiza profile com company_id (e nome se fornecido)
  IF p_name IS NOT NULL THEN
    UPDATE public.profiles
    SET company_id = _invite.company_id, name = p_name, updated_at = now()
    WHERE user_id = p_user_id;
  ELSE
    UPDATE public.profiles
    SET company_id = _invite.company_id, updated_at = now()
    WHERE user_id = p_user_id;
  END IF;

  -- Remove TODOS os roles do usuario
  DELETE FROM public.user_roles
  WHERE user_id = p_user_id;

  -- Insere role correto com company_id
  INSERT INTO public.user_roles (user_id, company_id, role)
  VALUES (p_user_id, _invite.company_id, _invite.role);

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

-- Permitir chamada por anon (signUp sem sessao) e authenticated
GRANT EXECUTE ON FUNCTION public.accept_invitation(UUID, UUID, TEXT) TO anon, authenticated;
