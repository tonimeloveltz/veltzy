// Prévia da campanha (mockup de celular): variáveis viram um contato de exemplo fixo.
// Espelha supabase/functions/_shared/blast-render.ts (nomeadas no texto livre, {{n}} via
// variable_mapping no template).
import { formatPhoneBR } from '@/lib/phone'

export const SAMPLE_LEAD: Record<string, string> = {
  first_name: 'Maria',
  last_name: 'Silva',
  name: 'Maria Silva',
  company_name: 'Empresa Exemplo',
  phone: formatPhoneBR('11987654321'),
}

const FREE_VAR_FIELD: Record<string, string> = {
  nome: 'first_name',
  sobrenome: 'last_name',
  nome_completo: 'name',
  telefone: 'phone',
  empresa: 'company_name',
}

/** Variáveis do texto livre, na ordem dos chips do compositor. */
export const FREE_VARIABLES = [
  { key: 'nome', label: 'Nome' },
  { key: 'sobrenome', label: 'Sobrenome' },
  { key: 'nome_completo', label: 'Nome completo' },
  { key: 'telefone', label: 'Telefone' },
  { key: 'empresa', label: 'Empresa' },
] as const

export interface PreviewSegment {
  text: string
  /** Trecho que veio de variável (destacado na bolha). */
  isVar: boolean
}

const VAR_RE = /\{\{\s*([a-zA-Z_0-9]+)\s*\}\}/g

const resolve = (name: string, mapping: Record<string, string> | null): string => {
  if (/^\d+$/.test(name)) {
    const m = mapping?.[name] ?? 'lead.first_name'
    return m.startsWith('lead.') ? (SAMPLE_LEAD[m.slice(5)] ?? '') : m
  }
  const field = FREE_VAR_FIELD[name.toLowerCase()]
  return field ? SAMPLE_LEAD[field] : ''
}

/** Texto com as variáveis trocadas pelo contato de exemplo, em segmentos. */
export const renderPreviewSegments = (text: string, mapping: Record<string, string> | null = null): PreviewSegment[] => {
  const out: PreviewSegment[] = []
  let last = 0
  for (const m of text.matchAll(VAR_RE)) {
    const at = m.index ?? 0
    if (at > last) out.push({ text: text.slice(last, at), isVar: false })
    const value = resolve(m[1], mapping)
    if (value) out.push({ text: value, isVar: true })
    last = at + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last), isVar: false })
  return out
}

/** "PDF · 1,2 MB" (tamanho só quando conhecido). */
export const documentMeta = (name: string, size?: number): string => {
  const dot = name.lastIndexOf('.')
  const ext = dot > 0 ? name.slice(dot + 1).toUpperCase() : 'ARQUIVO'
  if (!size) return ext
  const mb = size / (1024 * 1024)
  const sizeLabel = mb >= 1
    ? `${mb.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`
    : `${Math.max(1, Math.round(size / 1024))} KB`
  return `${ext} · ${sizeLabel}`
}
