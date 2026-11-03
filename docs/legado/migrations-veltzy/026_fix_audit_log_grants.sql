-- Concede INSERT e SELECT nas tabelas do auth-ecosystem para anon e authenticated
grant select, insert on public.auth_audit_log to anon, authenticated;
grant select on public.permissions to anon, authenticated;
grant select on public.role_permissions to anon, authenticated;
grant select, insert, update on public.invitations to anon, authenticated;
grant select, insert, update on public.lead_transfer_requests to authenticated;
