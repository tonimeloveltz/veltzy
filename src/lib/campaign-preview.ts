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

const VAR_RE = /\{\{\s*([a-zA-Z_0-9]+)\s*\}\}/g

const resolve = (name: string, mapping: Record<string, string> | null): string => {
  if (/^\d+$/.test(name)) {
    const m = mapping?.[name] ?? 'lead.first_name'
    return m.startsWith('lead.') ? (SAMPLE_LEAD[m.slice(5)] ?? '') : m
  }
  const field = FREE_VAR_FIELD[name.toLowerCase()]
  return field ? SAMPLE_LEAD[field] : ''
}

/** Texto com as variáveis trocadas pelo contato de exemplo (desconhecida some, como no envio). */
export const renderPreviewText = (text: string, mapping: Record<string, string> | null = null): string =>
  text.replace(VAR_RE, (_m, name: string) => resolve(name, mapping))

export interface FormattedRun {
  text: string
  bold: boolean
  italic: boolean
  strike: boolean
}

type Style = Omit<FormattedRun, 'text'>
const MARKERS: { char: string; style: keyof Style }[] = [
  { char: '*', style: 'bold' },
  { char: '_', style: 'italic' },
  { char: '~', style: 'strike' },
]

// Marcador colado no texto, sem espaço por dentro, sem letra/número por fora e sem o
// próprio marcador dobrado (por isso `**x**` fica literal, como no WhatsApp). Uma linha só.
const markerRe = (c: string) => {
  const m = c === '*' ? '\\*' : c // no modo /u, só o * pode (e precisa) ser escapado
  return new RegExp(`(^|[^\\p{L}\\p{N}${m}])${m}(?![\\s${m}])([^\\n${m}]*?[^\\s${m}])${m}(?![\\p{L}\\p{N}${m}])`, 'u')
}
const MARKER_RES = MARKERS.map((mk) => ({ ...mk, re: markerRe(mk.char) }))

/** Formatação do WhatsApp: *negrito*, _itálico_, ~tachado~ (aninháveis). */
export const parseWhatsAppFormatting = (
  text: string,
  style: Style = { bold: false, italic: false, strike: false },
): FormattedRun[] => {
  let best: { index: number; inner: string; length: number; style: keyof Style } | null = null
  for (const mk of MARKER_RES) {
    const m = mk.re.exec(text)
    if (!m) continue
    const index = m.index + m[1].length
    if (!best || index < best.index) best = { index, inner: m[2], length: m[0].length - m[1].length, style: mk.style }
  }
  if (!best) return text ? [{ text, ...style }] : []
  return [
    ...(best.index > 0 ? [{ text: text.slice(0, best.index), ...style }] : []),
    ...parseWhatsAppFormatting(best.inner, { ...style, [best.style]: true }),
    ...parseWhatsAppFormatting(text.slice(best.index + best.length), style),
  ]
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
