-- Corrige RLS do auth_audit_log para permitir insert anonimo (logar falhas de login)
drop policy if exists "auth_audit_insert" on public.auth_audit_log;

create policy "auth_audit_insert_authenticated" on public.auth_audit_log
  for insert to authenticated with check (true);

create policy "auth_audit_insert_anon" on public.auth_audit_log
  for insert to anon with check (true);
