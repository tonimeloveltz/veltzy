-- =============================================================================
-- 037_fix_accept_invitation_rpc.sql
-- Corrige ON CONFLICT baseado nos constraints reais de user_roles:
--   - user_roles_user_id_role_key: UNIQUE (user_id, role)
--   - user_roles_user_company_role_unique: UNIQUE (user_id, company_id, role)
-- Abordagem: DELETE todos os roles do user + INSERT limpo (evita conflitos)
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

  -- Remove TODOS os roles do usuario (o trigger criou role generico sem company)
  -- Para novo usuario, so existe o role 'seller' sem company_id
  DELETE FROM public.user_roles
  WHERE user_id = p_user_id;

  -- Insere role correto com company_id (tabela limpa, sem conflitos)
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
