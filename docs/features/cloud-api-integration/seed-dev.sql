-- =============================================================
-- SEED DE DEV — PROVISORIO. NAO E PARTE DO FLUXO DE PRODUCAO.
--
-- Em producao, veltzy.cloud_api_numbers e populada AUTOMATICAMENTE pelo
-- callback do Embedded Signup: quando o cliente conecta o numero, o callback
-- recebe phone_number_id + waba_id e insere a linha. NUNCA cadastrar numero
-- manualmente em producao.
--
-- Este arquivo existe so para destravar teste local/dev do cloud-api-inbound
-- antes do Embedded Signup estar pronto. Rodar no SQL Editor do Dashboard.
--
-- Substituir os placeholders <...> pelos valores do numero de teste da Meta.
-- =============================================================

INSERT INTO veltzy.cloud_api_numbers (
  company_id,
  phone_number_id,
  waba_id,
  display_number,
  instance_label,
  access_token,
  status
) VALUES (
  '<COMPANY_ID_DE_TESTE>',          -- empresa de teste (deve ter active_whatsapp_provider='cloud_api')
  '<PHONE_NUMBER_ID>',              -- value.metadata.phone_number_id do numero de teste
  '<WABA_ID>',                      -- WhatsApp Business Account id
  '<+55 11 99999-0000>',           -- display, opcional
  'cloud-api-teste',                -- instance_label (vira leads/messages.instance_name)
  NULL,                             -- access_token: NULL usa fallback META_SYSTEM_USER_TOKEN
  'active'
)
ON CONFLICT (phone_number_id) DO NOTHING;

-- Garantir que a empresa de teste esta no provider correto:
-- UPDATE public.companies SET active_whatsapp_provider = 'cloud_api'
-- WHERE id = '<COMPANY_ID_DE_TESTE>';
