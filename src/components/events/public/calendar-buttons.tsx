import { CalendarPlus, Download } from 'lucide-react'
import { buildIcs, googleCalendarUrl, type CalendarEvent } from '@/lib/events/calendar'

/** Google Agenda e arquivo .ics gerado no navegador. */
export const CalendarButtons = ({ ev, filename }: { ev: CalendarEvent; filename: string }) => {
  const download = () => {
    const url = URL.createObjectURL(new Blob([buildIcs(ev)], { type: 'text/calendar;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }
  return (
    <div className="flex flex-wrap gap-2">
      <a href={googleCalendarUrl(ev)} target="_blank" rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted">
        <CalendarPlus className="h-4 w-4" /> Adicionar ao Google Agenda
      </a>
      <button type="button" onClick={download} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted">
        <Download className="h-4 w-4" /> Baixar arquivo de agenda (.ics)
      </button>
    </div>
  )
}
