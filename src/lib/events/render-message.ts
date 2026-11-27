// Copia exata de supabase/functions/_shared/events/render.ts (OPT_OUT_FOOTER, renderEventMessage,
// formatEventDate, formatEventTime, formatEventLocation). O envio usa a do servidor; esta e so a
// previa do editor. Mudou la, muda aqui e no teste espelhado.

export const OPT_OUT_FOOTER = '\n\nPara não receber mais mensagens, responda SAIR.'

export interface EventMessageVars {
  primeiro_nome: string
  evento: string
  data: string
  hora: string
  local: string
  link_inscricao: string
  link_confirmar: string
  link_online: string
  /** so no aviso de data alterada */
  data_anterior: string
  hora_anterior: string
}

export function renderEventMessage(template: string, vars: Partial<EventMessageVars>): string {
  const lines = template.split('\n').filter((line) =>
    !(line.includes('{{link_online}}') && !(vars.link_online ?? '').trim()))
  const body = lines.join('\n').replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_m, key: string) => {
    const v = (vars as Record<string, string | undefined>)[key]
    return v ?? ''
  })
  return body.trimEnd() + OPT_OUT_FOOTER
}

const part = (parts: Intl.DateTimeFormatPart[], type: string) =>
  parts.find((p) => p.type === type)?.value ?? ''

export function formatEventDate(iso: string | null, timeZone: string): string {
  if (!iso) return ''
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone, weekday: 'short', day: 'numeric', month: 'short',
  }).formatToParts(new Date(iso))
  const clean = (s: string) => s.replace('.', '').toLowerCase()
  return `${clean(part(parts, 'weekday'))}, ${part(parts, 'day')} de ${clean(part(parts, 'month'))}`
}

export function formatEventTime(iso: string | null, timeZone: string): string {
  if (!iso) return ''
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso))
  return `${part(parts, 'hour')}:${part(parts, 'minute')}`
}

export interface EventLocationInput {
  format: 'presencial' | 'online' | 'hibrido'
  venue_name: string | null
  street: string | null
  number: string | null
  district: string | null
  city: string | null
  state: string | null
}

export function formatEventLocation(e: EventLocationInput): string {
  if (e.format === 'online') return 'Online'
  const streetLine = [e.street, e.number].filter(Boolean).join(', ')
  const cityLine = [e.city, e.state].filter(Boolean).join('/')
  return [e.venue_name, streetLine, e.district, cityLine].filter((s) => s && s.trim()).join(' - ')
}

export const MESSAGE_VARIABLES: Array<{ key: keyof EventMessageVars; label: string }> = [
  { key: 'primeiro_nome', label: 'Primeiro nome' },
  { key: 'evento', label: 'Evento' },
  { key: 'data', label: 'Data' },
  { key: 'hora', label: 'Hora' },
  { key: 'local', label: 'Local' },
  { key: 'link_inscricao', label: 'Link da inscrição' },
  { key: 'link_confirmar', label: 'Link para confirmar' },
  { key: 'link_online', label: 'Link da transmissão' },
]

/** Botoes extras so do card do aviso de data alterada. */
export const DATE_CHANGE_VARIABLES: Array<{ key: keyof EventMessageVars; label: string }> = [
  { key: 'data_anterior', label: 'Data anterior' },
  { key: 'hora_anterior', label: 'Hora anterior' },
]
