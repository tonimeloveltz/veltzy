-- Instagram DM, Onda 1: conferencias SQL durante o teste no browser (CA-B*).
-- STAGING. SOMENTE LEITURA.
--
-- O SQL Editor do Supabase mostra so o resultado do ULTIMO comando: rodar um
-- bloco por vez, logo depois do passo do teste indicado no titulo.

-- -----------------------------------------------------------------------------
-- CA-B1 / CA-B2. Depois de conectar pela tela
--   Esperado: auth_flow = instagram_login, status = active, is_active = true,
--   dias_para_expirar perto de 60, webhook_subscribed_at preenchido,
--   last_error nulo, page_id nulo, instagram_account_id e
--   instagram_app_user_id preenchidos.
-- -----------------------------------------------------------------------------
SELECT
  c.name AS empresa,
  ic.instagram_username,
  ic.auth_flow,
  ic.status,
  ic.is_active,
  round(extract(epoch FROM ic.token_expires_at - now()) / 86400) AS dias_para_expirar,
  ic.webhook_subscribed_at,
  ic.last_error,
  ic.page_id,
  ic.instagram_account_id,
  ic.instagram_app_user_id
FROM veltzy.instagram_connections ic
JOIN public.companies c ON c.id = ic.company_id
ORDER BY ic.updated_at DESC;

-- -----------------------------------------------------------------------------
-- CA-B2. Token no Vault (nunca mostra o valor)
--   Esperado depois de conectar: segredo_existe = true e segredo_preenchido = true.
--   Depois de desconectar (CA-B13) ou remover o app (CA-B15): preenchido = false.
-- -----------------------------------------------------------------------------
SELECT
  ic.company_id,
  s.id IS NOT NULL AS segredo_existe,
  COALESCE(length(ds.decrypted_secret) > 0, false) AS segredo_preenchido
FROM veltzy.instagram_connections ic
LEFT JOIN vault.secrets s
  ON s.name = 'instagram_connections.access_token.' || ic.company_id::text
LEFT JOIN vault.decrypted_secrets ds
  ON ds.id = s.id;

-- -----------------------------------------------------------------------------
-- CA-B3. Depois da primeira DM da conta tester
--   Esperado: phone = ig_<id>, instagram_id preenchido, nome ou @, tem_foto
--   true (se a tester tem foto), origem = instagram, negocios >= 1.
-- -----------------------------------------------------------------------------
SELECT
  l.id,
  l.name,
  l.phone,
  l.instagram_id,
  l.instagram_handle,
  l.avatar_url IS NOT NULL AS tem_foto,
  ls.slug AS origem,
  (SELECT count(*) FROM veltzy.deals d WHERE d.lead_id = l.id) AS negocios,
  l.created_at
FROM veltzy.leads l
LEFT JOIN veltzy.lead_sources ls ON ls.id = l.source_id
WHERE l.instagram_id IS NOT NULL
ORDER BY l.created_at DESC
LIMIT 10;

-- -----------------------------------------------------------------------------
-- CA-B4 a CA-B7. Mensagens do Instagram, mais novas primeiro
--   Recebida:        sender_type = lead, tem_external_id = true
--   Foto/audio (B5): message_type image/audio, tem_arquivo = true
--   Enviada (B6):    sender_type = human, delivery_status sent, depois read
--   Dono pelo app (B7): sender_type = human; a enviada pelo Veltzy aparece 1 vez
-- -----------------------------------------------------------------------------
SELECT
  m.created_at,
  m.sender_type,
  m.message_type,
  left(m.content, 60) AS conteudo,
  m.external_id IS NOT NULL AS tem_external_id,
  m.delivery_status,
  m.delivery_error,
  m.file_url IS NOT NULL AS tem_arquivo
FROM veltzy.messages m
WHERE m.source = 'instagram'
ORDER BY m.created_at DESC
LIMIT 20;

-- -----------------------------------------------------------------------------
-- CA-B4 / CA-B7. Duplicatas por id da Meta
--   Esperado: nenhuma linha.
-- -----------------------------------------------------------------------------
SELECT external_id, count(*) AS vezes
FROM veltzy.messages
WHERE source = 'instagram'
  AND external_id IS NOT NULL
GROUP BY external_id
HAVING count(*) > 1;

-- -----------------------------------------------------------------------------
-- CA-B8. Nenhuma mensagem de WhatsApp para lead do Instagram
--   Esperado: nenhuma linha.
-- -----------------------------------------------------------------------------
SELECT m.id, m.created_at, m.sender_type, m.delivery_status, m.delivery_error
FROM veltzy.messages m
JOIN veltzy.leads l ON l.id = m.lead_id
WHERE l.phone LIKE 'ig\_%'
  AND m.source = 'whatsapp';

-- -----------------------------------------------------------------------------
-- CA-B13 / CA-B15. Depois de desconectar ou remover o app no Instagram
--   Desconectar pela tela: is_active = false, status = revoked, last_error nulo.
--   Remover o app no Instagram: is_active = false, status = revoked,
--   last_error = 'App removido pelo Instagram'.
-- -----------------------------------------------------------------------------
SELECT company_id, is_active, status, last_error, updated_at
FROM veltzy.instagram_connections
ORDER BY updated_at DESC;

-- -----------------------------------------------------------------------------
-- CA-B14. Antes e depois de invocar instagram-token-refresh
--   Esperado depois: token_refreshed_at e token_expires_at avancam, last_error nulo.
--   Obs.: a Meta so renova token com mais de 24h. Conexao feita hoje responde
--   checked = 0 e nada muda; repetir o teste amanha.
-- -----------------------------------------------------------------------------
SELECT company_id, token_refreshed_at, token_expires_at, status, last_error
FROM veltzy.instagram_connections
WHERE is_active;
