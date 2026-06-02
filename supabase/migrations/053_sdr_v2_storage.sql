-- =============================================================================
-- 053_sdr_v2_storage.sql
-- SDR AI v2 - Wave 1: Storage bucket para knowledge base
-- =============================================================================

-- Bucket para docs do agent (PDF, DOCX, TXT, MD)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'agent-knowledge',
  'agent-knowledge',
  false,
  10485760, -- 10MB
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Policy: empresa so ve seus proprios arquivos (path: {company_id}/{agent_profile_id}/{filename})
CREATE POLICY "agent_knowledge_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'agent-knowledge'
    AND (storage.foldername(name))[1] = (veltzy.get_current_company_id())::text
  );

CREATE POLICY "agent_knowledge_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'agent-knowledge'
    AND (storage.foldername(name))[1] = (veltzy.get_current_company_id())::text
  );

CREATE POLICY "agent_knowledge_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'agent-knowledge'
    AND (storage.foldername(name))[1] = (veltzy.get_current_company_id())::text
  );
