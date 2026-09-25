-- ============================================================================
-- 077_message_queue_metadata.sql
-- mkt-ativo · Corte A (HSM Cloud API). SPEC: SPEC-mkt-ativo-corteA-cloudapi.md §Perna Veltzy.1
--
-- Item da fila passa a carregar a INTENÇÃO de template HSM: message_type='template'
-- (discriminador; message_type e TEXT livre, sem CHECK — nao precisa alterar constraint)
-- + coluna `metadata jsonb` com { template_name, language, params } resolvidos por-recipient.
-- Aditiva e retrocompatível: itens de texto (source automation/manual/campaign nao-oficial)
-- seguem com metadata NULL.
-- ============================================================================

ALTER TABLE veltzy.message_queue
  ADD COLUMN IF NOT EXISTS metadata JSONB;

COMMENT ON COLUMN veltzy.message_queue.metadata IS
  'Payload extra do item. Para message_type=''template'' (Cloud API HSM): {template_name, language, params:[<valores resolvidos {{n}}>]}. NULL para itens de texto.';
