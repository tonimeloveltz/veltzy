// CSV dos inscritos (aba 6): ";" e BOM para o Excel brasileiro abrir com acento. Puro, testado.

import Papa from 'papaparse'
import { formatPhoneBR } from '@/lib/phone'
import { STATUS_LABEL, type RegistrationRow } from '@/lib/events/registration-view'

const BOM = '﻿'

const dateTime = (iso: string | null, timeZone: string) =>
  iso ? new Intl.DateTimeFormat('pt-BR', { timeZone, dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso)) : ''

/** Colunas de resposta: uma por campo (field_id), na ordem dada, depois as que so existem em respostas antigas. */
const answerColumns = (rows: RegistrationRow[], fieldOrder: string[]) => {
  const labels = new Map<string, string>()
  for (const r of rows) for (const a of r.answers) if (!labels.has(a.field_id)) labels.set(a.field_id, a.label_snapshot)
  const ordered = fieldOrder.filter((id) => labels.has(id))
  const rest = [...labels.keys()].filter((id) => !fieldOrder.includes(id))
  return [...ordered, ...rest].map((id) => ({ id, label: labels.get(id)! }))
}

export const registrationsToCsv = (rows: RegistrationRow[], opts: { timeZone: string; fieldOrder: string[] }): string => {
  const cols = answerColumns(rows, opts.fieldOrder)
  const fields = [
    'Nome', 'Sobrenome', 'E-mail', 'WhatsApp', 'Status', 'Check-in', 'Inscrito em', 'Origem', 'Ref',
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'Aceitou comunicações',
    ...cols.map((c) => c.label),
  ]
  const data = rows.map((r) => [
    r.first_name, r.last_name ?? '', r.email ?? '', formatPhoneBR(r.whatsapp), STATUS_LABEL[r.status],
    dateTime(r.checked_in_at, opts.timeZone), dateTime(r.created_at, opts.timeZone),
    r.ref_code ? 'divulgador' : r.utm_source ? 'utm' : 'direto', r.ref_code ?? '',
    r.utm_source ?? '', r.utm_medium ?? '', r.utm_campaign ?? '', r.utm_content ?? '', r.utm_term ?? '',
    r.consent_marketing ? 'sim' : 'não',
    ...cols.map((c) => r.answers.find((a) => a.field_id === c.id)?.display ?? ''),
  ])
  return BOM + Papa.unparse({ fields, data }, { delimiter: ';', newline: '\r\n' })
}

export const downloadCsv = (csv: string, filename: string) => {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
