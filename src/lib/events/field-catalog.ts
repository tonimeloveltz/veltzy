// Catalogo dos campos do formulario de inscricao (aba 2) e o rascunho editavel de cada campo.

import type {
  ContactDestinationField, EventFieldOption, FieldDestination, FieldKey, FieldKind, FieldType,
} from '@/types/events'

export const MAX_FIELDS = 30
export const MAX_OPTIONS = 30
export const MIN_OPTIONS = 2

/** Campo como o editor guarda (espelha event_form_fields sem as colunas de controle). */
export interface FieldDraft {
  id: string
  kind: FieldKind
  key: FieldKey | null
  type: FieldType
  label: string
  help_text: string
  placeholder: string
  required: boolean
  options: EventFieldOption[] | null
  terms_text: string
  destination: FieldDestination
  destination_field: ContactDestinationField | null
}

export interface CatalogEntry {
  type: FieldType
  label: string
  key: FieldKey | null
  required?: boolean
  destination_field?: ContactDestinationField
}

export const PREDEFINED_FIELDS: CatalogEntry[] = [
  { key: 'company', type: 'text', label: 'Empresa', destination_field: 'company_name' },
  { key: 'job_title', type: 'text', label: 'Cargo' },
  { key: 'phone', type: 'phone', label: 'Telefone' },
  { key: 'document', type: 'document', label: 'CPF/CNPJ' },
  { key: 'city_state', type: 'city_state', label: 'Cidade/Estado' },
  { key: 'address', type: 'address', label: 'Endereço' },
  { key: 'datetime', type: 'datetime', label: 'Data/Hora' },
  { key: 'terms', type: 'terms', label: 'Termo de Responsabilidade', required: true },
]

export const CUSTOM_FIELDS: CatalogEntry[] = [
  { key: null, type: 'select', label: 'Lista' },
  { key: null, type: 'radio', label: 'Múltipla escolha' },
  { key: null, type: 'checkbox', label: 'Vários valores' },
  { key: null, type: 'text', label: 'Texto' },
  { key: null, type: 'paragraph', label: 'Parágrafo' },
]

export const CONTACT_DESTINATIONS: Array<{ value: ContactDestinationField; label: string }> = [
  { value: 'company_name', label: 'Empresa' },
  { value: 'instagram_handle', label: 'Instagram' },
  { value: 'linkedin_url', label: 'LinkedIn' },
]

export const TYPE_LABEL: Record<FieldType, string> = {
  text: 'Texto', paragraph: 'Parágrafo', select: 'Lista', radio: 'Múltipla escolha', checkbox: 'Vários valores',
  email: 'E-mail', phone: 'Telefone', document: 'CPF/CNPJ', city_state: 'Cidade/Estado', address: 'Endereço',
  datetime: 'Data/Hora', terms: 'Termo',
}

export const hasOptions = (type: FieldType) => type === 'select' || type === 'radio' || type === 'checkbox'
export const hasPlaceholder = (type: FieldType) =>
  type === 'text' || type === 'paragraph' || type === 'email' || type === 'phone' || type === 'document'
/** Fase 1: so texto vai para campo do contato; "Campo do negocio" nao aparece (SPEC aba 2). */
export const hasDestination = (type: FieldType) => type === 'text'

/** Fixos com obrigatoriedade editavel (PRD 9.2): Sobrenome e E-mail. Nome e WhatsApp travados. */
export const isRequiredLocked = (f: Pick<FieldDraft, 'kind' | 'key' | 'type'>) =>
  f.type === 'terms' || (f.kind === 'fixed' && (f.key === 'first_name' || f.key === 'whatsapp'))

export const newOption = (label = ''): EventFieldOption => ({ id: crypto.randomUUID(), label, tag: null, priority: null })

export const newFieldDraft = (entry: CatalogEntry): FieldDraft => ({
  id: crypto.randomUUID(),
  kind: entry.key ? 'predefined' : 'custom',
  key: entry.key,
  type: entry.type,
  label: entry.key ? entry.label : `Nova pergunta (${entry.label.toLowerCase()})`,
  help_text: '',
  placeholder: '',
  required: entry.required ?? false,
  options: hasOptions(entry.type) ? [newOption('Opção 1'), newOption('Opção 2')] : null,
  terms_text: '',
  destination: entry.destination_field ? 'contact_field' : 'answer_only',
  destination_field: entry.destination_field ?? null,
})

/** Chaves pre-definidas ja usadas (chip desabilitado). */
export const usedKeys = (fields: FieldDraft[]): Set<FieldKey> =>
  new Set(fields.flatMap((f) => (f.key ? [f.key] : [])))
