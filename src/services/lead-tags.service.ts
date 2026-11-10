import { veltzy as db } from '@/lib/supabase'
import type { LeadTag } from '@/types/database'

export const getLeadTags = async (companyId: string): Promise<LeadTag[]> => {
  const { data, error } = await db()
    .from('lead_tags')
    .select('*')
    .eq('company_id', companyId)
    .order('name')
  if (error) throw error
  return data
}

const getLeadTagByName = async (companyId: string, name: string): Promise<LeadTag | null> => {
  const { data, error } = await db()
    .from('lead_tags')
    .select('*')
    .eq('company_id', companyId)
    .ilike('name', name.replace(/[\\%_]/g, (c) => `\\${c}`))
    .maybeSingle()
  if (error) throw error
  return data
}

/**
 * Cadastra a tag com a cor escolhida. Se outra pessoa ja cadastrou o mesmo nome
 * (indice unico em lower(name)), NAO sobrescreve: devolve a cor que ja existe.
 */
export const createLeadTag = async (
  companyId: string,
  input: { name: string; color: string; createdBy: string | null }
): Promise<LeadTag> => {
  const { data, error } = await db()
    .from('lead_tags')
    .insert({ company_id: companyId, name: input.name, color: input.color, created_by: input.createdBy })
    .select()
    .single()
  if (!error) return data
  if (error.code === '23505') {
    const existing = await getLeadTagByName(companyId, input.name)
    if (existing) return existing
  }
  throw error
}
