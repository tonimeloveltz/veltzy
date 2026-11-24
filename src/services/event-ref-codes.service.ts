import { veltzy } from '@/lib/supabase'
import type { EventRefCode } from '@/types/events'

export const getRefCodes = async (companyId: string, eventId: string): Promise<EventRefCode[]> => {
  const { data, error } = await veltzy()
    .from('event_ref_codes')
    .select('*')
    .eq('company_id', companyId)
    .eq('event_id', eventId)
    .order('created_at')
  if (error) throw error
  return (data ?? []) as EventRefCode[]
}

export const createRefCode = async (companyId: string, eventId: string, label: string, code: string): Promise<void> => {
  const { error } = await veltzy()
    .from('event_ref_codes')
    .insert({ company_id: companyId, event_id: eventId, label: label.trim(), code })
  if (error) throw error
}

export const deleteRefCode = async (companyId: string, id: string): Promise<void> => {
  const { error } = await veltzy().from('event_ref_codes').delete().eq('company_id', companyId).eq('id', id)
  if (error) throw error
}
