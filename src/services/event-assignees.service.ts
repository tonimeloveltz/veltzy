import { veltzy } from '@/lib/supabase'

/** Fila do rodizio na ordem do sorteio (position, user_id: a mesma do register_for_event). */
export const getEventAssignees = async (companyId: string, eventId: string): Promise<string[]> => {
  const { data, error } = await veltzy()
    .from('event_assignees')
    .select('user_id, position')
    .eq('company_id', companyId)
    .eq('event_id', eventId)
    .order('position')
    .order('user_id')
  if (error) throw error
  return ((data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id)
}

/** Regrava a fila inteira (sao poucas linhas). O rr_cursor do evento so o banco mexe. */
export const saveEventAssignees = async (companyId: string, eventId: string, userIds: string[]): Promise<void> => {
  const { error: delError } = await veltzy()
    .from('event_assignees')
    .delete()
    .eq('company_id', companyId)
    .eq('event_id', eventId)
  if (delError) throw delError
  if (userIds.length === 0) return
  const { error } = await veltzy()
    .from('event_assignees')
    .insert(userIds.map((user_id, position) => ({ company_id: companyId, event_id: eventId, user_id, position })))
  if (error) throw error
}
