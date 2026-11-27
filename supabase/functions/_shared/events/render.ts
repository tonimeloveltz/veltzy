// Renderizacao das mensagens de evento (logica pura, testada).
// Datas SEMPRE no fuso do evento, nunca no do servidor (que roda em UTC).

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

/**
 * Troca `{{var}}` pelos valores. A linha em que `{{link_online}}` ficar vazio sai
 * inteira (evento presencial nao mostra "Link: "). Variavel desconhecida vira vazio.
 * O rodape de descadastro e sempre acrescentado.
 */
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

/** "sáb, 28 de nov" no fuso do evento. */
export function formatEventDate(iso: string | null, timeZone: string): string {
  if (!iso) return ''
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone, weekday: 'short', day: 'numeric', month: 'short',
  }).formatToParts(new Date(iso))
  const clean = (s: string) => s.replace('.', '').toLowerCase()
  return `${clean(part(parts, 'weekday'))}, ${part(parts, 'day')} de ${clean(part(parts, 'month'))}`
}

/** Os dois instantes caem no mesmo dia do calendario no fuso do evento. Nulo nunca e o mesmo dia. */
export function isSameEventDay(a: string | null, b: string | null, timeZone: string): boolean {
  if (!a || !b) return false
  const day = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(iso))
  return day(a) === day(b)
}

/** "09:00" no fuso do evento. */
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

/** `{{local}}`: "Online" no formato online; senao local + endereco, sem pedacos vazios. */
export function formatEventLocation(e: EventLocationInput): string {
  if (e.format === 'online') return 'Online'
  const streetLine = [e.street, e.number].filter(Boolean).join(', ')
  const cityLine = [e.city, e.state].filter(Boolean).join('/')
  return [e.venue_name, streetLine, e.district, cityLine].filter((s) => s && s.trim()).join(' - ')
}
