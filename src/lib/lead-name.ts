export interface NameFields {
  firstName: string
  lastName: string
  nameTouched: boolean
  firstNameMissing: boolean
}

/**
 * Payload de nome para updateLead a partir de campos editados no client.
 * first_name/last_name so entram quando o usuario mexeu neles e o Nome
 * obrigatorio nao ficou vazio. `name` nunca vai: o trigger sync_name_parts
 * (veltzy.leads) recompoe a partir de first/last.
 */
export const nameParts = (f: NameFields): { first_name?: string | null; last_name?: string | null } => {
  if (!f.nameTouched || f.firstNameMissing) return {}
  return { first_name: f.firstName.trim() || null, last_name: f.lastName.trim() || null }
}
