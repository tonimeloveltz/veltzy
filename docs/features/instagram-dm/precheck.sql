-- Pre-checagem da Onda 1 do Instagram DM (somente leitura).
-- Rodar no staging e em producao ANTES de aplicar
-- hub/supabase/migrations/20260914120000_instagram_dm_onda1.sql.
-- Se "contas_duplicadas_ativas" > 0 o indice unico da migration falha.

SELECT
  count(*)                                              AS conexoes,
  count(*) FILTER (WHERE is_active)                     AS ativas,
  count(*) FILTER (WHERE instagram_account_id = '')     AS sem_account_id,
  (
    SELECT count(*)
    FROM (
      SELECT instagram_account_id
      FROM veltzy.instagram_connections
      WHERE is_active AND instagram_account_id <> ''
      GROUP BY instagram_account_id
      HAVING count(*) > 1
    ) d
  )                                                     AS contas_duplicadas_ativas
FROM veltzy.instagram_connections;
