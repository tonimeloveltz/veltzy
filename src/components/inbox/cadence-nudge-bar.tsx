import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CalendarPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cadenceQueryKey, useCreateContactEvent } from '@/hooks/use-lead-cadence'
import { getContactEvents } from '@/services/lead-contact-events.service'
import { hasContactToday } from '@/lib/contact-cadence'
import { isDismissedToday, markDismissedToday } from '@/lib/cadence-dismissal'
import { useAuthStore } from '@/stores/auth.store'
import { useInboxStore } from '@/stores/inbox.store'

interface CadenceNudgeBarProps {
  leadId: string
}

/**
 * Lembrete de registrar contato depois do envio humano. So lembra: o envio
 * nunca registra contato sozinho, o registro e sempre o clique em "Registrar".
 *
 * Um aviso por lead por dia, garantido por duas condicoes:
 * - ja existe contato registrado hoje (banco, vale em qualquer dispositivo);
 * - o aviso foi dispensado hoje (localStorage, vale neste navegador).
 */
const CadenceNudgeBar = ({ leadId }: CadenceNudgeBarProps) => {
  const queryClient = useQueryClient()
  const companyId = useAuthStore((s) => s.company?.id)
  const nudgeLeadId = useInboxStore((s) => s.cadenceNudgeLeadId)
  const clearCadenceNudge = useInboxStore((s) => s.clearCadenceNudge)
  const createContactEvent = useCreateContactEvent()
  const [visible, setVisible] = useState(false)

  // O store so publica "houve envio para o lead X". Quem decide se a faixa
  // aparece e este componente, porque a decisao e assincrona (precisa da
  // cadencia do lead) e o hook de mensagens nao pode carregar isso.
  useEffect(() => {
    if (nudgeLeadId !== leadId || !companyId) return

    let cancelled = false
    const decide = async () => {
      // 1. Dispensado hoje neste navegador? Barra antes de qualquer ida a rede.
      if (isDismissedToday(leadId)) return
      // 2. Ja existe contato registrado hoje? Reaproveita o cache se estiver
      //    fresco (mesmo staleTime de useLeadCadence); as mutations de cadencia
      //    invalidam esta chave, entao o cache nunca esconde um registro feito
      //    neste navegador.
      const events = await queryClient.fetchQuery({
        queryKey: cadenceQueryKey(companyId, leadId),
        queryFn: () => getContactEvents(companyId, leadId),
        staleTime: 30 * 1000,
      })
      if (cancelled || hasContactToday(events)) return
      setVisible(true)
    }

    decide()
      .catch(() => {
        // Falha ao ler a cadencia: sem aviso. E lembrete; nao vale toast de erro
        // em cima de uma mensagem que foi enviada com sucesso.
      })
      .finally(() => {
        // SEMPRE limpa, tenha a faixa aparecido ou nao. Sem isso, o proximo
        // envio para o MESMO lead nao muda o valor no store, o efeito nao roda
        // de novo, e o aviso nunca mais aparece naquela sessao.
        if (!cancelled) clearCadenceNudge()
      })

    return () => { cancelled = true }
  }, [nudgeLeadId, leadId, companyId, queryClient, clearCadenceNudge])

  // A faixa pertence a conversa que estava aberta: carrega-la para outro lead
  // seria pedir registro do contato errado. Reset durante o render, e nao num
  // useEffect: e o padrao do React para ajustar estado quando a prop muda, e
  // evita um render intermediario com a faixa do lead anterior na tela.
  const [renderedLeadId, setRenderedLeadId] = useState(leadId)
  if (renderedLeadId !== leadId) {
    setRenderedLeadId(leadId)
    setVisible(false)
  }

  if (!leadId || !visible) return null

  const handleRegister = () => {
    // Nao grava dispensa no localStorage: o evento de hoje ja barra o aviso via
    // hasContactToday, em qualquer navegador. Dois mecanismos dizendo a mesma
    // coisa e onde nascem divergencias.
    createContactEvent.mutate({ leadId })
    setVisible(false)
  }

  const handleDismiss = () => {
    markDismissedToday(leadId)
    setVisible(false)
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-t bg-primary/5 px-4 py-2 text-sm text-foreground">
      <CalendarPlus className="h-4 w-4 shrink-0 text-primary" />
      <span className="flex-1 min-w-0">
        Primeira mensagem do dia para este contato. Registrar um contato?
      </span>
      <div className="flex items-center gap-1 shrink-0">
        <Button size="sm" variant="ghost" className="h-7" onClick={handleDismiss}>
          Agora não
        </Button>
        <Button size="sm" className="h-7" onClick={handleRegister}>
          Registrar
        </Button>
      </div>
    </div>
  )
}

export { CadenceNudgeBar }
