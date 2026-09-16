-- Instagram DM, Onda 1: conferencia depois do db push do Hub e do deploy das
-- functions no STAGING. SOMENTE LEITURA.
--
-- O SQL Editor do Supabase mostra so o resultado do ULTIMO comando: rodar um
-- bloco por vez (selecionar o bloco e executar).

-- -----------------------------------------------------------------------------
-- 1. Policy de leitura de instagram_connections
--    Esperado: uma linha  vz_ig_select | SELECT | {authenticated}
-- -----------------------------------------------------------------------------
SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'veltzy'
  AND tablename = 'instagram_connections'
ORDER BY policyname;

-- -----------------------------------------------------------------------------
-- 2. Colunas da migration
--    Esperado: 8 linhas. page_id com is_nullable = YES; auth_flow com default
--    'facebook_login'; status com default 'active'.
-- -----------------------------------------------------------------------------
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'veltzy'
  AND table_name = 'instagram_connections'
  AND column_name IN (
    'page_id', 'auth_flow', 'status', 'instagram_app_user_id',
    'instagram_name', 'token_refreshed_at', 'webhook_subscribed_at', 'last_error'
  )
ORDER BY column_name;

-- -----------------------------------------------------------------------------
-- 3. Indice unico de conta ativa (D3)
--    Esperado: uma linha, UNIQUE ... WHERE (is_active AND instagram_account_id <> '')
-- -----------------------------------------------------------------------------
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'veltzy'
  AND tablename = 'instagram_connections'
  AND indexname = 'instagram_connections_active_account_unique';

-- -----------------------------------------------------------------------------
-- 4. Empresa de teste pronta para conectar
--    O botao "Conectar Instagram" exige instagram_enabled = true, e o lead novo
--    precisa da origem 'instagram'. Se a flag estiver false, ligar pela tela de
--    feature flags do Hub (nao por SQL).
-- -----------------------------------------------------------------------------
SELECT
  c.id,
  c.name,
  COALESCE((
    SELECT f.enabled
    FROM public.tenant_feature_flags f
    WHERE f.company_id = c.id
      AND f.feature_key = 'instagram_enabled'
  ), false) AS instagram_enabled,
  EXISTS (
    SELECT 1
    FROM veltzy.lead_sources s
    WHERE s.company_id = c.id
      AND s.slug = 'instagram'
  ) AS tem_origem_instagram
FROM public.companies c
ORDER BY c.name;

-- -----------------------------------------------------------------------------
-- 5a. M8 fase 3 (entrou junto no db push): nenhuma policy de INSERT
--     Esperado: nenhuma linha com cmd = INSERT (sobra auth_audit_select_super)
-- -----------------------------------------------------------------------------
SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'auth_audit_log'
ORDER BY policyname;

-- -----------------------------------------------------------------------------
-- 5b. M8: o log de login continua gravando
--     Antes de rodar: fazer um login com senha errada no front do staging.
--     Esperado: um login_failed com created_at de agora. Se nao aparecer, o
--     front do staging ainda nao tem o commit 9797127 publicado.
-- -----------------------------------------------------------------------------
SELECT event, user_id IS NULL AS anonimo, created_at
FROM public.auth_audit_log
ORDER BY created_at DESC
LIMIT 5;

-- -----------------------------------------------------------------------------
-- 6. M9 (entrou junto): RLS nas tabelas de backup de leads
--    Esperado: rls_ligado = true nas que ainda existirem
-- -----------------------------------------------------------------------------
SELECT n.nspname || '.' || c.relname AS tabela, c.relrowsecurity AS rls_ligado
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'veltzy'
  AND c.relname IN ('leads_col_backup_20260814', 'leads_pipeline_backup_20260817');

-- -----------------------------------------------------------------------------
-- 7. Chave do Vault que o cron usa (so o nome, nunca o valor)
--    Esperado: uma linha. Sem ela o cron de renovacao do token toma 401.
-- -----------------------------------------------------------------------------
SELECT name, created_at, updated_at
FROM vault.secrets
WHERE name = 'cron_service_role_key';

-- -----------------------------------------------------------------------------
-- 8. Depois de rodar o SQL do cron (instagram-token-refresh-cron.sql)
--    Esperado: uma linha, schedule '0 9 * * *', active = true
-- -----------------------------------------------------------------------------
SELECT jobname, schedule, active
FROM cron.job
WHERE jobname = 'instagram-token-refresh';
