import type { UpdateLeadInput } from '@/types/database'

/** Campos editaveis do painel do contato (inbox), exceto observacoes (auto-save proprio). */
export type ContactPanelField =
  | 'first_name'
  | 'last_name'
  | 'email'
  | 'company_name'
  | 'instagram_handle'
  | 'linkedin_url'
  | 'source_id'
  | 'assigned_to'
  | 'tags'

export interface ContactPanelValues {
  firstName: string
  lastName: string
  email: string
  companyName: string
  instagramHandle: string
  linkedinUrl: string
  sourceId: string
  assignedTo: string
  tags: string[]
}

/**
 * Payload do updateLead a partir do painel do contato: SO os campos que o
 * usuario tocou. O lead do painel pode vir da RPC get_conversation_list, que nao
 * traz todas as colunas (company_name, instagram_handle, linkedin_url,
 * first_name, last_name); mandar o objeto inteiro gravava null por cima do que
 * estava no banco.
 *
 * Nome: first/last vao juntos se qualquer um foi tocado, e nada vai se o Nome
 * obrigatorio ficou vazio. `name` nunca vai: o trigger sync_name_parts recompoe.
 */
export const buildContactPanelPayload = (
  v: ContactPanelValues,
  touched: ReadonlySet<ContactPanelField>,
  firstNameMissing: boolean,
): UpdateLeadInput => {
  const out: UpdateLeadInput = {}
  if ((touched.has('first_name') || touched.has('last_name')) && !firstNameMissing) {
    out.first_name = v.firstName.trim() || null
    out.last_name = v.lastName.trim() || null
  }
  if (touched.has('email')) out.email = v.email || null
  if (touched.has('company_name')) out.company_name = v.companyName || null
  if (touched.has('instagram_handle')) out.instagram_handle = v.instagramHandle || null
  if (touched.has('linkedin_url')) out.linkedin_url = v.linkedinUrl || null
  if (touched.has('source_id')) out.source_id = v.sourceId || null
  if (touched.has('assigned_to')) out.assigned_to = v.assignedTo || null
  if (touched.has('tags')) out.tags = v.tags
  return out
}
