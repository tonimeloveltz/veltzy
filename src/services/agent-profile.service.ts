import { veltzy, supabase } from '@/lib/supabase'
import type { AgentProfile } from '@/types/sdr-v2'

// --- CRUD ---

export async function getAgentProfile(pipelineId: string): Promise<AgentProfile | null> {
  const { data, error } = await veltzy()
    .from('agent_profiles')
    .select('*')
    .eq('pipeline_id', pipelineId)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function getAgentProfileById(id: string): Promise<AgentProfile | null> {
  const { data, error } = await veltzy()
    .from('agent_profiles')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function createAgentProfile(
  data: Omit<AgentProfile, 'id' | 'created_at' | 'updated_at' | 'knowledge_base_status' | 'knowledge_base_version'>,
): Promise<AgentProfile> {
  const { data: created, error } = await veltzy()
    .from('agent_profiles')
    .insert(data)
    .select('*')
    .single()

  if (error) throw error
  return created
}

export async function updateAgentProfile(
  id: string,
  data: Partial<Omit<AgentProfile, 'id' | 'pipeline_id' | 'company_id' | 'created_at' | 'updated_at'>>,
): Promise<AgentProfile> {
  const { data: updated, error } = await veltzy()
    .from('agent_profiles')
    .update(data)
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw error
  return updated
}

export async function deleteAgentProfile(id: string): Promise<void> {
  const { error } = await veltzy()
    .from('agent_profiles')
    .delete()
    .eq('id', id)

  if (error) throw error
}

export async function toggleAgentProfileActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await veltzy()
    .from('agent_profiles')
    .update({ is_active: isActive })
    .eq('id', id)

  if (error) throw error
}

// --- Knowledge files ---

export interface KnowledgeFile {
  name: string
  storageKey: string
  url: string
  size: number
  created_at: string
}

export async function getKnowledgeFiles(companyId: string, agentProfileId: string): Promise<KnowledgeFile[]> {
  const path = `${companyId}/${agentProfileId}`
  const { data, error } = await supabase.storage
    .from('agent-knowledge')
    .list(path, { sortBy: { column: 'created_at', order: 'desc' } })

  if (error) throw error
  if (!data) return []

  return data
    .filter((f) => f.name !== '.emptyFolderPlaceholder')
    .map((f) => ({
      name: f.metadata?.originalName ?? f.name,
      storageKey: f.name,
      url: supabase.storage.from('agent-knowledge').getPublicUrl(`${path}/${f.name}`).data.publicUrl,
      size: f.metadata?.size ?? 0,
      created_at: f.created_at ?? '',
    }))
}

export async function deleteKnowledgeFile(companyId: string, agentProfileId: string, storageKey: string): Promise<void> {
  const path = `${companyId}/${agentProfileId}/${storageKey}`
  const { error } = await supabase.storage
    .from('agent-knowledge')
    .remove([path])

  if (error) throw error

  // Deletar chunks do arquivo (source_file_name usa o storageKey sanitizado)
  const { error: chunksError } = await veltzy()
    .from('agent_knowledge_chunks')
    .delete()
    .eq('agent_profile_id', agentProfileId)
    .eq('source_file_name', storageKey)

  if (chunksError) throw chunksError
}
