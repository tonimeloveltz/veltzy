-- Migration 034: Fix invitations RLS policies
-- Garante que as policies existem (recria se necessario)
-- =============================================================================

-- Drop e recria para garantir que estao corretas
drop policy if exists "invitations_select_public" on public.invitations;
drop policy if exists "invitations_write_tenant" on public.invitations;
drop policy if exists "invitations_update_tenant" on public.invitations;
drop policy if exists "invitations_delete_tenant" on public.invitations;

-- RLS habilitado
alter table public.invitations enable row level security;

-- SELECT: publico (necessario para aceitar convite por token)
create policy "invitations_select_public" on public.invitations
  for select using (true);

-- INSERT: membros da empresa ou super_admin
create policy "invitations_write_tenant" on public.invitations
  for insert with check (
    company_id in (select public.get_user_companies())
    or public.is_super_admin()
  );

-- UPDATE: membros da empresa ou super_admin
create policy "invitations_update_tenant" on public.invitations
  for update using (
    company_id in (select public.get_user_companies())
    or public.is_super_admin()
  );

-- DELETE: membros da empresa ou super_admin
create policy "invitations_delete_tenant" on public.invitations
  for delete using (
    company_id in (select public.get_user_companies())
    or public.is_super_admin()
  );

-- Garante grants
grant select, insert, update, delete on public.invitations to authenticated;
