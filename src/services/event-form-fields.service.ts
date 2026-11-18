import { veltzy } from '@/lib/supabase'
import type { FieldRow } from '@/lib/events/editor-form'
import type { EventFormField } from '@/types/events'

export const getEventFields = async (companyId: string, eventId: string): Promise<EventFormField[]> => {
  const { data, error } = await veltzy()
    .from('event_form_fields')
    .select('*')
    .eq('company_id', companyId)
    .eq('event_id', eventId)
    .is('deleted_at', null)
    .order('position')
  if (error) throw error
  return (data ?? []) as EventFormField[]
}

/**
 * Grava o formulario em lote: primeiro remove os que sairam (libera a chave
 * pre-definida e a vaga do limite de 30), depois um upsert com todos na ordem.
 * O DELETE de campo com resposta vira soft delete no trigger do Hub.
 */
export const saveEventFields = async (
  companyId: string,
  eventId: string,
  rows: FieldRow[],
  removedIds: string[],
): Promise<void> => {
  if (removedIds.length > 0) {
    const { error } = await veltzy()
      .from('event_form_fields')
      .delete()
      .eq('company_id', companyId)
      .eq('event_id', eventId)
      .in('id', removedIds)
    if (error) throw error
  }
  if (rows.length === 0) return
  const { error } = await veltzy()
    .from('event_form_fields')
    .upsert(rows, { onConflict: 'id' })
  if (error) throw error
}

/** Quantas inscricoes ja responderam o campo (count exact com head:true, imune ao max_rows). */
export const countFieldAnswers = async (companyId: string, eventId: string, fieldId: string): Promise<number> => {
  const { count, error } = await veltzy()
    .from('event_registrations')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('event_id', eventId)
    .contains('answers', [{ field_id: fieldId }])
  if (error) throw error
  return count ?? 0
}
