import { veltzy } from '@/lib/supabase'

export const getPipelineAccess = async (
  companyId: string,
  userId: string
): Promise<string[]> => {
  const { data, error } = await veltzy()
    .from('user_pipeline_access')
    .select('pipeline_id')
    .eq('company_id', companyId)
    .eq('user_id', userId)
  if (error) throw error
  return data.map((r) => r.pipeline_id)
}

export const setPipelineAccess = async (
  companyId: string,
  userId: string,
  pipelineIds: string[]
): Promise<void> => {
  // Delete all existing entries for this user
  const { error: deleteError } = await veltzy()
    .from('user_pipeline_access')
    .delete()
    .eq('company_id', companyId)
    .eq('user_id', userId)
  if (deleteError) throw deleteError

  // Insert new entries (if any — empty array = permissive/all access)
  if (pipelineIds.length > 0) {
    const { error: insertError } = await veltzy()
      .from('user_pipeline_access')
      .insert(
        pipelineIds.map((pipeline_id) => ({
          user_id: userId,
          pipeline_id,
          company_id: companyId,
        }))
      )
    if (insertError) throw insertError
  }
}
