-- =============================================================================
-- 052_sdr_v2_functions.sql
-- SDR AI v2 - Wave 1: Funcoes e triggers
-- =============================================================================

-- Busca semantica na knowledge base
CREATE OR REPLACE FUNCTION veltzy.search_knowledge_chunks(
  p_agent_profile_id uuid,
  p_query_embedding vector(1536),
  p_top_k integer DEFAULT 5,
  p_min_score float DEFAULT 0.7
)
RETURNS TABLE (
  id uuid,
  content text,
  similarity float,
  source_file_name text,
  metadata jsonb
)
LANGUAGE sql SECURITY DEFINER SET search_path = veltzy, public
AS $$
  SELECT
    akc.id,
    akc.content,
    1 - (akc.embedding <=> p_query_embedding) AS similarity,
    akc.source_file_name,
    akc.metadata
  FROM veltzy.agent_knowledge_chunks akc
  INNER JOIN veltzy.agent_profiles ap ON ap.id = akc.agent_profile_id
  WHERE akc.agent_profile_id = p_agent_profile_id
    AND akc.knowledge_base_version = ap.knowledge_base_version
    AND 1 - (akc.embedding <=> p_query_embedding) >= p_min_score
  ORDER BY akc.embedding <=> p_query_embedding
  LIMIT p_top_k;
$$;

-- Triggers updated_at (reutiliza handle_updated_at existente em public e veltzy)
CREATE TRIGGER trg_agent_profiles_updated_at
  BEFORE UPDATE ON veltzy.agent_profiles
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON veltzy.payments
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
