// Validacao das respostas do formulario de evento (logica pura, testada).
// Roda no event-register ANTES do register_for_event, que repete so o minimo
// (obrigatorio e opcao existente). Os campos fixos (nome, sobrenome, e-mail,
// WhatsApp) vem no envelope e sao validados na propria Edge Function.

import { isValidPhoneBR } from '../phone.ts'

export interface ValidatableField {
  id: string
  kind: 'fixed' | 'predefined' | 'custom'
  type: string
  required: boolean
  options: Array<{ id: string }> | null
}

export interface AnswerInput {
  field_id: string
  value?: unknown
}

export type FieldErrorCode =
  | 'required'
  | 'invalid_type'
  | 'invalid_option'
  | 'too_long'
  | 'invalid_email'
  | 'invalid_phone'
  | 'invalid_document'
  | 'invalid_date'

const MAX_TEXT = 255
const MAX_PARAGRAPH = 2000
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export const isValidEmail = (value: string): boolean => value.length <= 254 && EMAIL_RE.test(value)

const allSameDigit = (d: string) => /^(\d)\1+$/.test(d)

export function isValidCPF(value: string): boolean {
  const d = value.replace(/\D/g, '')
  if (d.length !== 11 || allSameDigit(d)) return false
  const digit = (len: number) => {
    let sum = 0
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i)
    const r = (sum * 10) % 11
    return r === 10 ? 0 : r
  }
  return digit(9) === Number(d[9]) && digit(10) === Number(d[10])
}

export function isValidCNPJ(value: string): boolean {
  const d = value.replace(/\D/g, '')
  if (d.length !== 14 || allSameDigit(d)) return false
  const digit = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    let sum = 0
    for (let i = 0; i < len; i++) sum += Number(d[i]) * weights[i]
    const r = sum % 11
    return r < 2 ? 0 : 11 - r
  }
  return digit(12) === Number(d[12]) && digit(13) === Number(d[13])
}

const isEmptyValue = (v: unknown): boolean =>
  v === undefined || v === null || v === false ||
  (typeof v === 'string' && v.trim() === '') ||
  (Array.isArray(v) && v.length === 0) ||
  (typeof v === 'object' && !Array.isArray(v) &&
    Object.values(v as Record<string, unknown>).every((x) => typeof x !== 'string' || x.trim() === ''))

const isStringRecord = (v: unknown): v is Record<string, string> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) &&
  Object.values(v).every((x) => typeof x === 'string' && x.length <= MAX_TEXT)

function validateOne(field: ValidatableField, value: unknown): FieldErrorCode | null {
  const optionIds = new Set((field.options ?? []).map((o) => o.id))
  switch (field.type) {
    case 'text':
    case 'paragraph': {
      if (typeof value !== 'string') return 'invalid_type'
      return value.length > (field.type === 'paragraph' ? MAX_PARAGRAPH : MAX_TEXT) ? 'too_long' : null
    }
    case 'email':
      if (typeof value !== 'string') return 'invalid_type'
      return isValidEmail(value.trim().toLowerCase()) ? null : 'invalid_email'
    case 'phone':
      if (typeof value !== 'string') return 'invalid_type'
      return isValidPhoneBR(value) ? null : 'invalid_phone'
    case 'document': {
      if (typeof value !== 'string') return 'invalid_type'
      const digits = value.replace(/\D/g, '')
      const ok = digits.length === 11 ? isValidCPF(digits) : digits.length === 14 ? isValidCNPJ(digits) : false
      return ok ? null : 'invalid_document'
    }
    case 'select':
    case 'radio': {
      const v = Array.isArray(value) ? (value.length === 1 ? value[0] : null) : value
      if (Array.isArray(value) && value.length > 1) return 'invalid_option'
      if (typeof v !== 'string') return 'invalid_type'
      return optionIds.has(v) ? null : 'invalid_option'
    }
    case 'checkbox': {
      if (!Array.isArray(value) || !value.every((x) => typeof x === 'string')) return 'invalid_type'
      return value.every((x) => optionIds.has(x as string)) ? null : 'invalid_option'
    }
    case 'city_state': {
      if (!isStringRecord(value)) return 'invalid_type'
      const state = (value.state ?? '').trim()
      if (state !== '' && !/^[A-Za-z]{2}$/.test(state)) return 'invalid_type'
      return null
    }
    case 'address':
      return isStringRecord(value) ? null : 'invalid_type'
    case 'datetime':
      if (typeof value !== 'string') return 'invalid_type'
      return Number.isNaN(Date.parse(value)) ? 'invalid_date' : null
    case 'terms':
      return value === true ? null : 'required'
    default:
      return 'invalid_type'
  }
}

/** Devolve `{ [fieldId]: codigo }`; objeto vazio = tudo valido. Campos fixos sao ignorados. */
export function validateAnswers(
  fields: ValidatableField[],
  answers: AnswerInput[],
): Record<string, FieldErrorCode> {
  const errors: Record<string, FieldErrorCode> = {}
  const byField = new Map<string, unknown>()
  for (const a of answers) {
    if (a && typeof a.field_id === 'string' && !byField.has(a.field_id)) byField.set(a.field_id, a.value)
  }
  for (const field of fields) {
    if (field.kind === 'fixed') continue
    const value = byField.get(field.id)
    if (isEmptyValue(value)) {
      if (field.required || field.type === 'terms') errors[field.id] = 'required'
      continue
    }
    const code = validateOne(field, value)
    if (code) errors[field.id] = code
  }
  return errors
}
