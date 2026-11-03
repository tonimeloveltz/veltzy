-- Remove coluna is_internal da tabela messages
-- O valor 'internal' do enum sender_type nao pode ser removido (PostgreSQL nao suporta DROP VALUE)
-- Apenas parar de usar o valor no codigo
ALTER TABLE veltzy.messages DROP COLUMN IF EXISTS is_internal;
