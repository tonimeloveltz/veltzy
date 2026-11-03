-- Indice parcial para lookup por instance_id no webhook da Z-API
-- Necessario porque zapi-webhook busca por metadata->>'instance_id' em cada request
CREATE INDEX IF NOT EXISTS idx_oauth_integrations_zapi_instance
ON public.oauth_integrations ((metadata->>'instance_id'))
WHERE provider = 'zapi';
