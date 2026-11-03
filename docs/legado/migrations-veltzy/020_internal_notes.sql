-- Adiciona 'internal' ao enum SenderType e coluna is_internal
-- Verificar se sender_type é um tipo enum ou text com check constraint

-- Adicionar valor 'internal' ao enum sender_type_enum
ALTER TYPE veltzy.sender_type_enum ADD VALUE IF NOT EXISTS 'internal';

-- Adicionar coluna is_internal para facilitar filtragem
ALTER TABLE veltzy.messages ADD COLUMN IF NOT EXISTS is_internal BOOLEAN DEFAULT FALSE;

-- Index para filtrar notas internas rapidamente
CREATE INDEX IF NOT EXISTS idx_messages_is_internal
  ON veltzy.messages (lead_id, is_internal)
  WHERE is_internal = TRUE;
