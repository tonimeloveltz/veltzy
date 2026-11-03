-- =============================================================
-- Migration 046: Adicionar 'evolution' ao CHECK constraint
-- O CHECK original nao incluia 'evolution' como valor valido
-- =============================================================

ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_active_whatsapp_provider_check;

ALTER TABLE public.companies
  ADD CONSTRAINT companies_active_whatsapp_provider_check
  CHECK (active_whatsapp_provider = ANY (ARRAY['zapi', 'wuzapi', 'revolution', 'meta', 'evolution']));
