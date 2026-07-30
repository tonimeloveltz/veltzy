// Consentimento versionado do titular (lead) por finalidade. Molde LGPD:
// revogar NAO apaga a linha, so carimba revogado_em (preserva historico/prova).
// Espelha veltzy.lead_consents.

export type ConsentPurpose = 'marketing_whatsapp'

export type ConsentOrigin = 'formulario' | 'campanha' | 'importacao' | 'manual'

export interface LeadConsent {
  id: string
  company_id: string
  lead_id: string
  finalidade: string
  termo_versao: string
  texto_aceito: string | null
  origem: ConsentOrigin
  canal: string
  consentido_em: string
  revogado_em: string | null
  created_at: string
  updated_at: string
}

export interface GrantConsentInput {
  leadId: string
  finalidade: ConsentPurpose
  termoVersao: string
  textoAceito?: string
  origem: ConsentOrigin
  canal?: string
}
