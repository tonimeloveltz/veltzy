import { supabasePublic as supabase, veltzy } from '@/lib/supabase'
import type { CompanyMetadata } from '@/types/database'

export type OnboardingMark = 'skipped_at' | 'completed_at'

/** Mesmo merge do banco, usado tambem como fallback local quando a gravacao falha. */
export const mergeOnboardingMark = (metadata: CompanyMetadata | null, mark: OnboardingMark): CompanyMetadata => {
  const current = metadata ?? {}
  return {
    ...current,
    onboarding: { ...current.onboarding, [mark]: new Date().toISOString() },
  }
}

/** Grava skipped_at/completed_at em companies.metadata.onboarding sem apagar outras chaves. */
export const markOnboarding = async (companyId: string, mark: OnboardingMark): Promise<CompanyMetadata> => {
  // Le o metadata fresco do banco, nao o do store.
  const { data: current, error: readError } = await supabase
    .from('companies')
    .select('metadata')
    .eq('id', companyId)
    .single()
  if (readError) throw readError

  const next = mergeOnboardingMark((current?.metadata as CompanyMetadata | null) ?? null, mark)

  // RLS que barra o update devolve 0 linhas sem erro: conferir a contagem.
  const { data, error } = await supabase
    .from('companies')
    .update({ metadata: next })
    .eq('id', companyId)
    .select('metadata')
  if (error) throw error
  if (!data || data.length !== 1) throw new Error('Nao foi possivel salvar o progresso da configuracao.')
  return next
}

export interface OnboardingTestLead {
  id: string
  name: string | null
  phone: string
}

/** Lead mais antigo da empresa criado depois de `since` (teste de mensagem real do wizard). */
export const getFirstLeadSince = async (companyId: string, since: string): Promise<OnboardingTestLead | null> => {
  const { data, error } = await veltzy()
    .from('leads')
    .select('id, name, phone')
    .eq('company_id', companyId)
    .gte('created_at', since)
    .order('created_at', { ascending: true })
    .limit(1)
  if (error) throw error
  return (data?.[0] as OnboardingTestLead | undefined) ?? null
}
