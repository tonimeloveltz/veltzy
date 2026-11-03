-- Garante que service_role tem acesso completo à tabela oauth_integrations
-- Necessário para edge functions (zapi-webhook, check-whatsapp-health, process-message-queue)
-- que acessam a tabela sem JWT de usuário

GRANT ALL ON public.oauth_integrations TO service_role;
GRANT ALL ON public.oauth_integrations TO authenticated;
