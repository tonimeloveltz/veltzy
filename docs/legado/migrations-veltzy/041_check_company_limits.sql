-- Função para verificar limites de max_users e max_leads por empresa
create or replace function public.check_company_limits(
  p_company_id uuid,
  p_type text -- 'users' ou 'leads'
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_features jsonb;
  v_current_count int;
  v_limit int;
begin
  select features into v_features
  from public.companies
  where id = p_company_id;

  if p_type = 'users' then
    v_limit := coalesce((v_features->>'max_users')::int, 999999);
    select count(*) into v_current_count
    from public.user_roles
    where company_id = p_company_id;
  elsif p_type = 'leads' then
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
