-- =============================================================================
-- 050_fix_accept_invitation_app_role_cast.sql
-- Fix: _final_role declarado como app_role (enum) ao inves de TEXT.
-- Sem cast explicito, INSERT em user_roles.role falhava com erro 42804
-- (column "role" is of type app_role but expression is of type text).
-- Tambem adiciona logica de auto-admin: se nenhum admin existe na empresa,
-- o primeiro usuario aceito vira admin automaticamente.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.accept_invitation(
  p_invitation_id uuid,
  p_user_id uuid,
  p_name text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _invite RECORD;
  _final_role app_role;
  _admin_count INT;
BEGIN
  SELECT * INTO _invite FROM public.invitations
  WHERE id = p_invitation_id
    AND status = 'pending'
    AND expires_at > now();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Convite invalido ou expirado');
  END IF;

  -- Se nenhum admin existe na empresa, forcar admin
  SELECT count(*) INTO _admin_count FROM public.user_roles
  WHERE company_id = _invite.company_id AND role = 'admin'::app_role;

  IF _admin_count = 0 THEN
    _final_role := 'admin'::app_role;
  ELSE
    _final_role := _invite.role::app_role;
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

  -- Remove roles com company (preserva role generico sem company)
  DELETE FROM public.user_roles
  WHERE user_id = p_user_id
    AND company_id IS NOT NULL;

  -- Insere role correto com company_id
  INSERT INTO public.user_roles (user_id, company_id, role)
  VALUES (p_user_id, _invite.company_id, _final_role)
  ON CONFLICT (user_id, company_id, role) DO NOTHING;

  -- Marca convite como aceito
  UPDATE public.invitations
  SET status = 'accepted', accepted_at = now()
  WHERE id = p_invitation_id;

  RETURN jsonb_build_object(
    'success', true,
    'company_id', _invite.company_id,
    'role', _final_role
  );
END;
$function$;

-- Permitir chamada por anon (signUp sem sessao) e authenticated
GRANT EXECUTE ON FUNCTION public.accept_invitation(uuid, uuid, text) TO anon, authenticated;
