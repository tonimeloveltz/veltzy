import { veltzy as db } from '@/lib/supabase'
import type { ConsentPurpose, GrantConsentInput, LeadConsent } from '@/types/lead-consent'

/**
 * Consentimento VALIDO = revogado_em IS NULL para (company, lead, finalidade).
 * Retorna o mais recente valido, ou null. RLS isola por company; filtramos
 * company_id tambem no codigo (defesa em profundidade).
 */
export const getValidConsent = async (
  companyId: string,
  leadId: string,
  finalidade: ConsentPurpose,
): Promise<LeadConsent | null> => {
  const { data, error } = await db()
    .from('lead_consents')
    .select('*')
    .eq('company_id', companyId)
    .eq('lead_id', leadId)
    .eq('finalidade', finalidade)
    .is('revogado_em', null)
    .order('consentido_em', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return (data as LeadConsent) ?? null
}

/** Registra um opt-in (linha nova). consentido_em/created_at usam DEFAULT now(). */
export const grantConsent = async (
  companyId: string,
  input: GrantConsentInput,
): Promise<LeadConsent> => {
  const { data, error } = await db()
    .from('lead_consents')
    .insert({
      company_id: companyId,
      lead_id: input.leadId,
      finalidade: input.finalidade,
      termo_versao: input.termoVersao,
      texto_aceito: input.textoAceito ?? null,
      origem: input.origem,
      canal: input.canal ?? 'whatsapp',
    })
    .select()
    .single()
  if (error) {
    // Indice unico parcial (company_id, lead_id, finalidade) WHERE revogado_em IS
    // NULL: 2 opt-ins ATIVOS colidem. Traduz pra msg amigavel (corrida de abas).
    if ((error as { code?: string }).code === '23505') {
      throw new Error('Este contato ja tem opt-in ativo para essa finalidade.')
    }
    throw error
  }
  return data as LeadConsent
}

/** Revoga: carimba revogado_em. NUNCA deleta (preserva historico p/ prova, LGPD). */
export const revokeConsent = async (companyId: string, id: string): Promise<void> => {
  const { error } = await db()
    .from('lead_consents')
    .update({ revogado_em: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('id', id)
  if (error) throw error
}
