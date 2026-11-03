-- ============================================================================
-- 076_feature_mkt_ativo_enabled.sql
-- Frente mkt-ativo (Fase 1) · item 1d — flag de feature por-empresa.
-- SPEC: SPEC-mkt-ativo-fase1.md §1d/§4
--
-- Decisao (Toni/Copiloto): criar `mkt_ativo_enabled` LIMPA. A flag
-- `campaign_whatsapp_enabled` presente no default do staging e DRIFT ORFAO
-- (nenhum codigo le, sem migration de origem) — NAO reusar, NAO limpar aqui
-- (limpeza envolve o Central = debito do Toni).
--
-- ADITIVO e resiliente ao drift:
--  1) SET DEFAULT preserva EXATAMENTE o default atual (seja qual for no
--     repo/staging/Central) e concatena so a chave nova — nao reescreve o
--     jsonb, nao toca nas outras chaves (nem nas orfas).
--  2) Linhas existentes recebem a chave via merge (||), sem sobrescrever nada.
--  O gate (edge) SEMPRE trata ausente=false (features->>'mkt_ativo_enabled'),
--  entao nao depende do default ter a chave — esta migration e por higiene.
-- ============================================================================

-- 1) Default: preserva o atual + adiciona a chave (idempotente: so se faltar).
DO $$
DECLARE
  cur_default text;
BEGIN
  SELECT pg_get_expr(d.adbin, d.adrelid) INTO cur_default
  FROM pg_attrdef d
  JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
  WHERE a.attrelid = 'public.companies'::regclass AND a.attname = 'features';

  IF cur_default IS NULL THEN
    -- sem default previo: define um minimo com a chave
    ALTER TABLE public.companies
      ALTER COLUMN features SET DEFAULT '{"mkt_ativo_enabled": false}'::jsonb;
  ELSIF position('mkt_ativo_enabled' in cur_default) = 0 THEN
    -- concatena a chave ao default existente, preservando tudo (inclusive orfas)
    EXECUTE format(
      'ALTER TABLE public.companies ALTER COLUMN features SET DEFAULT (%s || ''{"mkt_ativo_enabled": false}''::jsonb)',
      cur_default
    );
  END IF;
END $$;

-- 2) Linhas existentes: adiciona a chave sem tocar nas demais (merge aditivo).
UPDATE public.companies
SET features = features || '{"mkt_ativo_enabled": false}'::jsonb
WHERE NOT (features ? 'mkt_ativo_enabled');
