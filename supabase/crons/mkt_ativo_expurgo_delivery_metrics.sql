-- Expurgo LGPD (90d) das métricas de entrega do mkt-ativo.
-- Aplicado À PARTE (pós-migration 082), NÃO via `supabase db push` — igual aos demais crons
-- do mkt-ativo. pg_cron vive no Central (compartilhado); se o scheduling travar por permissão,
-- aplicar junto aos outros crons (ação sensível, sob ordem do Toni em produção).
--
-- Após 90 dias do último receipt, zera o metadado comportamental do titular:
-- delivered/read volta a 'sent' e limpa o timestamp. (Minimização/retenção — ver PRD LGPD.)

SELECT cron.schedule(
  'mkt_ativo_expurgo_delivery_metrics',
  '17 4 * * *',  -- diário 04:17 UTC
  $$UPDATE veltzy.messages
       SET delivery_status = 'sent', delivery_updated_at = NULL
     WHERE delivery_updated_at < now() - interval '90 days'
       AND delivery_status IN ('delivered','read')$$
);
