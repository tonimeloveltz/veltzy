/** Lead já cadastrado, só com os campos que a importação pode completar. */
export interface ExistingLead {
  id: string
  name: string | null
  email: string | null
}

/** Linha da planilha, só com os campos que a importação pode completar. */
export interface ImportRowData {
  name?: string
  last_name?: string
  email?: string
}

/** Campos gravados no lead. Com sobrenome usa first/last; sem, `name` (o trigger faz o split). */
export interface LeadUpdateFields {
  name?: string
  first_name?: string
  last_name?: string
  email?: string
}

export interface LeadUpdateSuggestion {
  leadId: string
  rowIndex: number
  phone: string
  currentName: string | null
  newName?: string
  newEmail?: string
  fields: LeadUpdateFields
}

/** Sem nome de verdade: nulo, vazio ou só dígitos/símbolos de telefone. */
export const isPlaceholderName = (name: string | null | undefined): boolean => {
  const trimmed = name?.trim() ?? ''
  if (!trimmed) return true
  return /^[\d\s+()\-.]+$/.test(trimmed)
}

const clean = (value: string | undefined): string | undefined => {
  const v = value?.trim().replace(/\s+/g, ' ')
  return v ? v : undefined
}

/** Sugestão de completar o lead existente com a linha da planilha, ou null se não há o que completar. */
export const buildLeadUpdateSuggestion = (
  existing: ExistingLead,
  row: ImportRowData,
  rowIndex: number,
  phone: string,
): LeadUpdateSuggestion | null => {
  const fields: LeadUpdateFields = {}
  const first = clean(row.name)
  const last = clean(row.last_name)
  const email = clean(row.email)
  let newName: string | undefined
  let newEmail: string | undefined

  if (isPlaceholderName(existing.name) && (first || last)) {
    if (last) {
      fields.first_name = first
      fields.last_name = last
    } else {
      fields.name = first
    }
    newName = [first, last].filter(Boolean).join(' ')
  }

  if (!existing.email?.trim() && email) {
    fields.email = email
    newEmail = email
  }

  if (!newName && !newEmail) return null
  return { leadId: existing.id, rowIndex, phone, currentName: existing.name, newName, newEmail, fields }
}
