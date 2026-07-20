-- =============================================================
-- Migration 070: Anotacoes sobre o negocio (veltzy.deals.observations)
-- Aditiva. Nenhum dado existente e alterado.
--
-- RLS: nao ha nada a fazer aqui. As policies de veltzy.deals
-- (vz_deals_select/insert/update/delete, criadas em 054) sao por linha,
-- nao por coluna: um ADD COLUMN ja nasce coberto por elas. Mexer em RLS
-- nesta migration so criaria risco sem ganho.
-- =============================================================

ALTER TABLE veltzy.deals
  ADD COLUMN IF NOT EXISTS observations TEXT;

COMMENT ON COLUMN veltzy.deals.observations IS
  'Anotacoes livres sobre o negocio, escritas pelo vendedor. Nullable, sem default — mesmo tratamento de veltzy.leads.observations (que e sobre o contato, nao sobre a oportunidade).';
