import { Link } from 'react-router-dom'
import { CalendarDays } from 'lucide-react'
import { useDealRegistration } from '@/hooks/events/use-deal-registration'
import { registrationOrigin, STATUS_LABEL } from '@/lib/events/registration-view'

/** Bloco "Evento" na tela do negocio (D6): de qual evento veio, origem, UTMs e respostas. Nada se nao veio de evento. */
export const DealEventInfo = ({ dealId }: { dealId: string }) => {
  const { data: reg } = useDealRegistration(dealId)
  if (!reg || !reg.event) return null
  const utms = [['utm_source', reg.utm_source], ['utm_medium', reg.utm_medium], ['utm_campaign', reg.utm_campaign],
    ['utm_content', reg.utm_content], ['utm_term', reg.utm_term]].filter(([, v]) => v)
  return (
    <section className="space-y-2 rounded-md border bg-muted/30 p-3 text-sm">
      <div className="flex items-center gap-2">
        <CalendarDays className="h-4 w-4 text-primary" />
        <Link to={`/eventos/${reg.event.id}`} className="font-medium hover:underline">{reg.event.title}</Link>
        <span className="ml-auto text-xs text-muted-foreground">{STATUS_LABEL[reg.status]}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        Origem: {registrationOrigin(reg)}{reg.source === 'manual' ? ' · inscrição manual' : ''}
        {utms.length > 0 && ` · ${utms.map(([k, v]) => `${k}=${v}`).join(' · ')}`}
      </p>
      {reg.answers.length > 0 && (
        <dl className="grid gap-x-3 gap-y-1 text-xs sm:grid-cols-[auto_1fr]">
          {reg.answers.map((a) => (
            <div key={a.field_id} className="contents">
              <dt className="text-muted-foreground">{a.label_snapshot}</dt>
              <dd className="break-words">{a.display}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}
