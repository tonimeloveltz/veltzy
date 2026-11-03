-- 072_waha_provider_check.sql
-- WAHA como 3o provider de WhatsApp (multi-provider simultaneo).
-- V1: adiciona 'waha' ao CHECK de companies.active_whatsapp_provider.
--
-- Nota: com o multi-provider (V2), active_whatsapp_provider DEIXA de ser o
-- roteador (o provider passa a ser derivado por-lead), mas continua sendo um
-- valor valido/compat (fallback para leads antigos). Este CHECK so amplia o
-- dominio; nao remove valores existentes.
--
-- Constraint name confirmado nas migrations 046/068. Mantem os valores mortos
-- ('wuzapi','revolution','meta') como nas anteriores (limpeza fica p/ migration
-- separada, fora do escopo WAHA).

ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_active_whatsapp_provider_check;
ALTER TABLE public.companies
  ADD CONSTRAINT companies_active_whatsapp_provider_check
  CHECK (active_whatsapp_provider = ANY (
    ARRAY['zapi', 'wuzapi', 'revolution', 'meta', 'evolution', 'cloud_api', 'waha']
  ));
