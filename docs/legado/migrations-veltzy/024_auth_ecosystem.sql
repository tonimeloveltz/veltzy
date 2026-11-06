-- =============================================================================
-- 024_auth_ecosystem.sql
-- Implementa o padrao auth-ecosystem completo: permissions granulares,
-- auth_audit_log, invitations, lead_transfer_requests e funcoes RLS
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Adicionar company_id na user_roles (se nao existir)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_roles'
      and column_name = 'company_id'
  ) then
    alter table public.user_roles
      add column company_id uuid references public.companies(id) on delete cascade;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_roles_user_company_role_unique'
  ) then
    alter table public.user_roles
      add constraint user_roles_user_company_role_unique
      unique (user_id, company_id, role);
  end if;
end $$;

create index if not exists user_roles_user_company_idx on public.user_roles(user_id, company_id);

-- ---------------------------------------------------------------------------
-- 2. Tabelas (sem policies que referenciam funcoes)
-- ---------------------------------------------------------------------------

-- permissions
create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  description text,
  product text check (product in ('veltzy', 'leadbaze', 'powerv', 'hub', 'all'))
);

alter table public.permissions enable row level security;
create policy "permissions_read_all" on public.permissions
  for select using (true);

-- role_permissions
create table if not exists public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  role app_role not null,
  permission_key text not null references public.permissions(key),
  unique (role, permission_key)
);

alter table public.role_permissions enable row level security;
create policy "role_permissions_read_all" on public.role_permissions
  for select using (true);

-- auth_audit_log
create table if not exists public.auth_audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  event text not null,
  ip_address text,
  user_agent text,
  metadata jsonb default '{}',
  created_at timestamptz not null default now()
);

create index if not exists auth_audit_log_user_id_idx on public.auth_audit_log(user_id);
create index if not exists auth_audit_log_company_id_idx on public.auth_audit_log(company_id);
create index if not exists auth_audit_log_event_idx on public.auth_audit_log(event);
create index if not exists auth_audit_log_created_at_idx on public.auth_audit_log(created_at);

-- RLS: insert aberto para authenticated e anon (logar falhas de login)
-- select apenas super_admin
alter table public.auth_audit_log enable row level security;
create policy "auth_audit_insert_authenticated" on public.auth_audit_log
  for insert to authenticated with check (true);
create policy "auth_audit_insert_anon" on public.auth_audit_log
  for insert to anon with check (true);
create policy "auth_audit_select_super" on public.auth_audit_log
  for select using (public.is_super_admin());

-- invitations
create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  invited_by uuid not null references auth.users(id),
  email text not null,
  role app_role not null,
  token uuid not null unique default gen_random_uuid(),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'expired', 'revoked')),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.invitations enable row level security;
-- Policy de select aberto por token (para aceitar convite sem estar logado)
create policy "invitations_select_public" on public.invitations
  for select using (true);

-- lead_transfer_requests
create table if not exists public.lead_transfer_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  lead_id uuid not null,
  requested_by uuid not null references auth.users(id),
  requested_to uuid not null references auth.users(id),
  type text not null check (type in ('duplicate_conflict', 'queue_transfer', 'manual_transfer')),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  resolved_by uuid references auth.users(id),
  notes text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table public.lead_transfer_requests enable row level security;

-- ---------------------------------------------------------------------------
-- 3. Seeds
-- ---------------------------------------------------------------------------

insert into public.permissions (key, description, product) values
  ('hub.access',                    'Acessar o Hub',                          'hub'),
  ('company.configure',             'Configurar produto e integracoes',       'all'),
  ('company.billing',               'Gerenciar assinatura e plano',           'all'),
  ('members.invite_admin',          'Convidar admins',                        'all'),
  ('members.invite_manager',        'Convidar managers',                      'all'),
  ('members.invite_seller',         'Convidar sellers',                       'all'),
  ('members.invite_representative', 'Convidar representatives',               'all'),
  ('members.remove',                'Remover membros',                        'all'),
  ('leads.view_all',                'Ver todos os leads da empresa',          'veltzy'),
  ('leads.view_own',                'Ver apenas os proprios leads',           'veltzy'),
  ('leads.receive_traffic',         'Receber leads de trafego',               'veltzy'),
  ('leads.create_manual',           'Cadastrar lead manualmente',             'veltzy'),
  ('leads.delete',                  'Deletar leads',                          'veltzy'),
  ('leads.transfer_resolve',        'Resolver conflitos e transferencias',    'veltzy'),
  ('leads.transfer_request',        'Solicitar transferencia de lead',        'veltzy'),
  ('reports.full',                  'Ver relatorios completos da empresa',    'all'),
  ('reports.own',                   'Ver apenas os proprios relatorios',      'all'),
  ('pipeline.configure',            'Configurar fases do pipeline',           'veltzy'),
  ('ai.configure',                  'Configurar IA do produto',               'all'),
  ('integrations.configure',        'Configurar integracoes',                 'all')
on conflict (key) do nothing;

insert into public.role_permissions (role, permission_key) values
  ('super_admin', 'hub.access'),
  ('super_admin', 'company.configure'),
  ('super_admin', 'company.billing'),
  ('super_admin', 'members.invite_admin'),
  ('super_admin', 'members.invite_manager'),
  ('super_admin', 'members.invite_seller'),
  ('super_admin', 'members.invite_representative'),
  ('super_admin', 'members.remove'),
  ('super_admin', 'leads.view_all'),
  ('super_admin', 'leads.view_own'),
  ('super_admin', 'leads.receive_traffic'),
  ('super_admin', 'leads.create_manual'),
  ('super_admin', 'leads.delete'),
  ('super_admin', 'leads.transfer_resolve'),
  ('super_admin', 'leads.transfer_request'),
  ('super_admin', 'reports.full'),
  ('super_admin', 'reports.own'),
  ('super_admin', 'pipeline.configure'),
  ('super_admin', 'ai.configure'),
  ('super_admin', 'integrations.configure'),
  ('admin', 'company.configure'),
  ('admin', 'company.billing'),
  ('admin', 'members.invite_admin'),
  ('admin', 'members.invite_manager'),
  ('admin', 'members.invite_seller'),
  ('admin', 'members.invite_representative'),
  ('admin', 'members.remove'),
  ('admin', 'leads.view_all'),
  ('admin', 'leads.view_own'),
  ('admin', 'leads.receive_traffic'),
  ('admin', 'leads.create_manual'),
  ('admin', 'leads.delete'),
  ('admin', 'leads.transfer_resolve'),
  ('admin', 'leads.transfer_request'),
  ('admin', 'reports.full'),
  ('admin', 'reports.own'),
  ('admin', 'pipeline.configure'),
  ('admin', 'ai.configure'),
  ('admin', 'integrations.configure'),
  ('manager', 'members.invite_seller'),
  ('manager', 'members.invite_representative'),
  ('manager', 'leads.view_all'),
  ('manager', 'leads.view_own'),
  ('manager', 'leads.receive_traffic'),
  ('manager', 'leads.create_manual'),
  ('manager', 'leads.transfer_resolve'),
  ('manager', 'leads.transfer_request'),
  ('manager', 'reports.full'),
  ('manager', 'reports.own'),
  ('seller', 'leads.view_own'),
  ('seller', 'leads.receive_traffic'),
  ('seller', 'leads.create_manual'),
  ('seller', 'reports.own'),
  ('representative', 'leads.view_own'),
  ('representative', 'leads.create_manual'),
  ('representative', 'leads.transfer_request'),
  ('representative', 'reports.own')
on conflict (role, permission_key) do nothing;

-- ---------------------------------------------------------------------------
-- 4. Funcoes RLS (agora que as tabelas existem)
-- ---------------------------------------------------------------------------

create or replace function public.has_permission(p_key text)
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role = ur.role
    where ur.user_id = auth.uid()
      and rp.permission_key = p_key
  );
$$;

create or replace function public.get_user_companies()
returns setof uuid language sql stable security definer
set search_path = public as $$
  select distinct company_id
  from public.user_roles
  where user_id = auth.uid()
    and company_id is not null;
$$;

-- ---------------------------------------------------------------------------
-- 5. Policies que dependem das funcoes (invitations e lead_transfer_requests)
-- ---------------------------------------------------------------------------

create policy "invitations_write_tenant" on public.invitations
  for insert with check (
    company_id in (select public.get_user_companies())
    or public.is_super_admin()
  );

create policy "invitations_update_tenant" on public.invitations
  for update using (
    company_id in (select public.get_user_companies())
    or public.is_super_admin()
  );

create policy "invitations_delete_tenant" on public.invitations
  for delete using (
    company_id in (select public.get_user_companies())
    or public.is_super_admin()
  );

create policy "lead_transfers_select" on public.lead_transfer_requests
  for select using (
    company_id in (select public.get_user_companies())
    or public.is_super_admin()
  );

create policy "lead_transfers_insert" on public.lead_transfer_requests
  for insert with check (
    company_id in (select public.get_user_companies())
    or public.is_super_admin()
  );

create policy "lead_transfers_update" on public.lead_transfer_requests
  for update using (
    company_id in (select public.get_user_companies())
    or public.is_super_admin()
  );
