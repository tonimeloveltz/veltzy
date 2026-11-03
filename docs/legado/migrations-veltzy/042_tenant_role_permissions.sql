-- Permissões granulares por empresa (overrides dos defaults em role_permissions)
-- O Hub configura overrides aqui; o Veltzy consome no login.

create table if not exists public.tenant_role_permissions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  role public.app_role not null,
  permission_key text not null references public.permissions(key),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, role, permission_key)
);

-- RLS
alter table public.tenant_role_permissions enable row level security;

create policy "tenant_role_perms_select" on public.tenant_role_permissions
  for select to authenticated
  using (true);

create policy "tenant_role_perms_admin" on public.tenant_role_permissions
  for all to authenticated
  using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid()
      and role in ('super_admin', 'admin')
    )
  );

-- Index para busca por company_id + role
create index if not exists idx_tenant_role_perms_company_role
  on public.tenant_role_permissions(company_id, role);
