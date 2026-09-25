import { veltzy as db } from '@/lib/supabase'
import type { LeadContactEvent } from '@/types/database'

/**
 * Camada de dados da cadencia de contato (veltzy.lead_contact_events).
 *
 * SEM FUNCAO DE UPDATE, e nao deve passar a ter: a tabela nao tem policy nem
 * GRANT de UPDATE. Um .update() aqui nao devolveria erro de permissao -- a RLS
 * simplesmente nao casa linha nenhuma e a chamada "passa" afetando zero linhas.
 * Falha silenciosa. Corrigir um registro e deleteContactEvent + createContactEvent.
 *
 * Toda query filtra company_id no codigo alem da RLS: a RLS e a ultima linha de
 * defesa, nao a unica.
 *
 * Nenhuma funcao deste arquivo toca veltzy.leads.
 */

export interface CreateContactEventPayload {
  leadId: string
  /** public.profiles.id do vendedor que registrou (NAO auth.uid()). */
  registeredBy: string | null
}

export const getContactEvents = async (
  companyId: string,
  leadId: string,
): Promise<LeadContactEvent[]> => {
  // A ordem casa com idx_lead_contact_events_lead (lead_id, contacted_at DESC),
  // mas e otimizacao, nao contrato: buildCadenceTimeline reordena por conta
  // propria para achar o primeiro contato.
  const { data, error } = await db()
    .from('lead_contact_events')
    .select('*')
    .eq('lead_id', leadId)
    .eq('company_id', companyId)
    .order('contacted_at', { ascending: false })
  if (error) throw error
  return data
}

export const createContactEvent = async (
  companyId: string,
  payload: CreateContactEventPayload,
): Promise<LeadContactEvent> => {
  // contacted_at NAO vai no insert: o DEFAULT NOW() do banco resolve, para que
  // o instante seja o do servidor e nao o relogio do vendedor.
  const { data, error } = await db()
    .from('lead_contact_events')
    .insert({
      company_id: companyId,
      lead_id: payload.leadId,
      registered_by: payload.registeredBy,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export const deleteContactEvent = async (
  companyId: string,
  eventId: string,
): Promise<void> => {
  const { error } = await db()
    .from('lead_contact_events')
    .delete()
    .eq('id', eventId)
    .eq('company_id', companyId)
  if (error) throw error
}
