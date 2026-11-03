-- =============================================================
-- Migration 070: veltzy.messages.is_history (Coexistence / Onda 3)
-- Aditiva. Nenhum dado existente é alterado (todas as mensagens
-- atuais nascem is_history=false, ou seja, mensagens ativas).
-- Spec: docs/features/whatsapp-coexistence/SPEC.md (§0.1 item 2, V1.2, D-V2)
--
-- APLICAÇÃO: passo manual do Toni (staging -> Central pelo Dashboard).
-- NUNCA `db push`. Esta migration PRECEDE a V1 (history/echoes).
-- =============================================================

-- 1. Flag de mensagem histórica (dump de até 180 dias do onboarding coexistence).
--    Quando true: a mensagem foi importada do history do WhatsApp Business app,
--    NÃO deve disparar SDR/automação/auto-reply/notificação (V1.2) e a UI
--    limita a exibição por padrão para não poluir as conversas ativas (D-V2).
ALTER TABLE veltzy.messages
  ADD COLUMN IF NOT EXISTS is_history BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN veltzy.messages.is_history IS
  'true = mensagem importada do dump history (coexistence, até 180d). Não dispara side-effects (SDR/automação/auto-reply) e a UI limita a exibição por padrão. false = mensagem ativa normal.';

-- 2. Índice parcial para a consulta quente do inbox (conversa ativa de um lead).
--    A listagem padrão exibe apenas mensagens ativas; o índice parcial cobre
--    esse caminho sem inchar com as históricas.
CREATE INDEX IF NOT EXISTS idx_messages_lead_active
  ON veltzy.messages (lead_id, created_at)
  WHERE is_history = false;
