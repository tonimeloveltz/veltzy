-- Migration 061: Habilitar realtime na tabela deals
-- EXECUTAR VIA SQL EDITOR (banco compartilhado, nao usar CLI)
--
-- A migration 054 criou a tabela deals mas nao habilitou realtime.
-- Sem isso, subscriptions no frontend nao recebem eventos de deals.

ALTER PUBLICATION supabase_realtime ADD TABLE veltzy.deals;
