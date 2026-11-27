import { fromZonedInput } from '@/lib/events/zoned-time'
import type { EventStatus } from '@/types/events'

interface DateNoticeInput {
  status: EventStatus
  /** inicio salvo e inicio do formulario, como no input datetime-local (fuso do evento) */
  savedStartsAt: string
  newStartsAt: string
  timezone: string
  noticeEnabled: boolean
  now?: Date
}

/**
 * O Salvar vai enfileirar o aviso de data alterada? Espelha o trigger
 * events_on_starts_at_change: evento no ar, dia do inicio diferente (no fuso do
 * evento), inicio novo no futuro e aviso ligado. So a hora mudou: nao avisa.
 */
export const willNotifyDateChange = (i: DateNoticeInput): boolean => {
  if (i.status !== 'published' && i.status !== 'closed') return false
  if (!i.noticeEnabled || !i.savedStartsAt || !i.newStartsAt) return false
  if (i.savedStartsAt.slice(0, 10) === i.newStartsAt.slice(0, 10)) return false
  const starts = fromZonedInput(i.newStartsAt, i.timezone)
  return starts !== null && new Date(starts).getTime() > (i.now ?? new Date()).getTime()
}
