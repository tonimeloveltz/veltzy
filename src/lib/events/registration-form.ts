// Estado e mensagens do formulario de inscricao (manual no admin e pagina publica, bloco e).

import type { EventPublicField } from '@/types/events'
import type { EventFormField } from '@/types/events'

export type FormFieldSpec = Pick<EventPublicField, 'id' | 'kind' | 'key' | 'type' | 'label' | 'help_text' | 'placeholder' | 'required' | 'config' | 'options'>

export interface RegistrationValues {
  first_name: string
  last_name: string
  email: string
  whatsapp: string
  answers: Record<string, unknown>
}

export const emptyRegistration = (): RegistrationValues =>
  ({ first_name: '', last_name: '', email: '', whatsapp: '', answers: {} })

/** Campo do admin no formato que o formulario usa (o publico ja chega assim da event-public). */
export const toFieldSpec = (f: EventFormField): FormFieldSpec => ({
  id: f.id, kind: f.kind, key: f.key, type: f.type, label: f.label, help_text: f.help_text,
  placeholder: f.placeholder, required: f.required,
  config: f.type === 'terms' ? { text: typeof f.config?.text === 'string' ? f.config.text : null } : null,
  options: f.options?.map((o) => ({ id: o.id, label: o.label })) ?? null,
})

/** Respostas so dos campos nao fixos e preenchidos (o servidor valida tudo de novo). */
export const answersPayload = (fields: FormFieldSpec[], v: RegistrationValues) =>
  fields.filter((f) => f.kind !== 'fixed' && v.answers[f.id] !== undefined)
    .map((f) => ({ field_id: f.id, value: v.answers[f.id] }))

export const FIELD_ERROR_TEXT: Record<string, string> = {
  required: 'Obrigatório.',
  invalid_email: 'E-mail inválido.',
  invalid_phone: 'Telefone inválido. Use DDD + número.',
  not_mobile: 'Use um celular com WhatsApp (DDD + 9 dígitos).',
  invalid_document: 'CPF ou CNPJ inválido.',
  invalid_option: 'Escolha uma das opções.',
  invalid_type: 'Valor inválido.',
  too_long: 'Texto longo demais.',
  invalid_date: 'Data inválida.',
}

export const errorText = (code: string | undefined) => (code ? FIELD_ERROR_TEXT[code] ?? 'Valor inválido.' : undefined)
