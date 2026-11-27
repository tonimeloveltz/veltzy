import { useFormContext, useWatch } from 'react-hook-form'
import { EditorSection } from '@/components/events/editor/editor-section'
import { MessageCard } from '@/components/events/editor/pipeline/message-card'
import { DATE_CHANGE_VARIABLES, formatEventDate, formatEventLocation, formatEventTime } from '@/lib/events/render-message'
import { eventPublicUrl } from '@/lib/events/event-list'
import { fromZonedInput } from '@/lib/events/zoned-time'
import type { EditorValues, MESSAGE_KINDS } from '@/lib/events/editor-form'

const CARDS: Array<{ kind: (typeof MESSAGE_KINDS)[number]; title: string; when: string }> = [
  { kind: 'confirmation', title: 'Confirmação da inscrição', when: 'Logo depois da inscrição.' },
  { kind: 'reminder_d1', title: 'Lembrete um dia antes', when: 'Um dia antes do início, com o link para confirmar presença.' },
  { kind: 'date_change', title: 'Aviso de mudança de data',
    when: 'Se o dia do início mudar depois de publicado, para quem está inscrito. Sai 10 minutos depois de salvar; mudar só o horário não avisa.' },
  { kind: 'post_present', title: 'Pós-evento: presentes', when: 'Depois do fim, para quem fez check-in e aceitou receber comunicações.' },
  { kind: 'post_absent', title: 'Pós-evento: ausentes', when: 'Depois do fim, para quem não fez check-in e aceitou receber comunicações.' },
  { kind: 'cancel_notice', title: 'Aviso de cancelamento', when: 'Se o evento for cancelado, para quem estava inscrito.' },
]

export const MessagesSection = ({ timezone, savedStartsAt }: { timezone: string; savedStartsAt: string | null }) => {
  const { control } = useFormContext<EditorValues>()
  const v = useWatch({ control }) as EditorValues
  const starts = fromZonedInput(v.starts_at, timezone)
  const link = `${eventPublicUrl(v.slug)}/i/exemplo`
  const sample = {
    primeiro_nome: 'Ana',
    evento: v.title,
    data: formatEventDate(starts, timezone),
    hora: formatEventTime(starts, timezone),
    local: formatEventLocation({ format: v.format, venue_name: v.venue_name || null, street: v.street || null,
      number: v.number || null, district: v.district || null, city: v.city || null, state: v.state || null }),
    link_inscricao: link,
    link_confirmar: `${link}?confirmar=1`,
    link_online: v.format === 'presencial' ? '' : v.online_url,
    data_anterior: formatEventDate(savedStartsAt, timezone),
    hora_anterior: formatEventTime(savedStartsAt, timezone),
  }

  return (
    <EditorSection title="Mensagens no WhatsApp"
      description="Envio em ritmo seguro, até 20 mensagens por minuto por sessão, para proteger o número. Toda mensagem termina com a opção de responder SAIR.">
      <div className="space-y-3">
        {CARDS.map((c) => (
          <MessageCard key={c.kind} {...c} sample={sample}
            extraVariables={c.kind === 'date_change' ? DATE_CHANGE_VARIABLES : undefined} />
        ))}
      </div>
    </EditorSection>
  )
}
