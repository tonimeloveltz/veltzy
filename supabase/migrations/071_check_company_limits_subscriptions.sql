-- 071_check_company_limits_subscriptions.sql
-- Onboarding Unificado · Bloco 1 (Veltzy): teto de usuários lido do plano (Hub).
--
-- Muda o ramo p_type='users' de check_company_limits para:
--   1) FONTE do teto = public.get_product_seat_limit(company_id, 'veltzy') — função da Hera
--      (Bloco 0) que lê subscriptions.max_users com FALLBACK companies.features embutido.
--      coalesce(...,999999) = comportamento de TRANSIÇÃO: NULL de ambas as fontes NÃO bloqueia.
--   2) ASSENTO = count(distinct user_id) (multi-papel não infla a contagem).
-- Ramo p_type='leads' preservado sem alteração.
--
-- ⛔ DEPENDÊNCIA DE ORDEM: requer public.get_product_seat_limit (Bloco 0) já aplicado.
--    Confirmado no staging (hfebv). Precede a promoção ao Central.
-- Flip fail-closed (NULL -> allowed:false) é um 2º commit, pós-backfill do Hub. NÃO aqui.

create or replace function public.check_company_limits(
  p_company_id uuid,
  p_type text -- 'users' ou 'leads'
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_features jsonb;
  v_current_count int;
  v_limit int;
begin
  if p_type = 'users' then
    -- Fonte única do teto (subscriptions.max_users -> fallback companies.features na função da Hera).
    -- Transição: NULL das duas fontes cai em 999999 (não trava ninguém no dia do deploy).
    v_limit := coalesce(public.get_product_seat_limit(p_company_id, 'veltzy'::public.product_slug), 999999);

    -- Assento = usuários distintos, não linhas de user_roles (evita inflar com multi-papel).
    select count(distinct user_id) into v_current_count
    from public.user_roles
    where company_id = p_company_id;

  elsif p_type = 'leads' then
    select features into v_features
    from public.companies
    where id = p_company_id;

    v_limit := coalesce((v_features->>'max_leads')::int, 999999);
    select count(*) into v_current_count
    from veltzy.leads
    where company_id = p_company_id;

  else
    return jsonb_build_object('allowed', true, 'current', 0, 'limit', 999999);
  end if;

  return jsonb_build_object(
    'allowed', v_current_count < v_limit,
    'current', v_current_count,
    'limit', v_limit
  );
end;
$$;
