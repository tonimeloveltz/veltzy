import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { useProspectSignals } from '@/hooks/use-prospect-signals'
import { useReviewSignal, useDraftDm, useSendDm, useApproachSignal } from '@/hooks/use-prospect-signals'
import type { ProspectSignal, ProspectDecision } from '@/types/database'

// Dialog de aprovação: busca rascunho (Haiku via thin edge), admin edita, envia.
const ApproveDialog = ({ signal, open, onOpenChange }: { signal: ProspectSignal; open: boolean; onOpenChange: (v: boolean) => void }) => {
  const draft = useDraftDm()
  const send = useSendDm()
  const [text, setText] = useState('')
  const [loaded, setLoaded] = useState(false)
  const draftMutate = draft.mutate

  useEffect(() => {
    if (open && !loaded) {
      setLoaded(true)
      draftMutate(signal.id, { onSuccess: (d) => setText(d) })
    }
  }, [open, loaded, signal.id, draftMutate])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Aprovar e enviar DM</DialogTitle>
          <DialogDescription>Revise e edite o rascunho. A mensagem precisa conter o opt-out (SAIR); o envio revalida tudo e respeita o modo sombra.</DialogDescription>
        </DialogHeader>
        {draft.isPending ? (
          <Skeleton className="h-28 w-full" />
        ) : (
          <textarea
            className="w-full min-h-[8rem] rounded-md border bg-background p-3 text-sm"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            disabled={!text.trim() || send.isPending}
            onClick={() => send.mutate({ signalId: signal.id, messageText: text }, { onSuccess: () => onOpenChange(false) })}
          >
            Enviar DM
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const ReviewRow = ({ signal }: { signal: ProspectSignal }) => {
  const review = useReviewSignal()
  const [approving, setApproving] = useState(false)
  return (
    <div className="rounded-md border p-3">
      <p className="text-sm">{signal.snippet}</p>
      <div className="mt-1 text-xs text-muted-foreground">
        {signal.category ?? 'sem categoria'} · urgência {signal.urgency ?? '—'} · prob {signal.probability ?? 'n/d'}
        {signal.author_phone_resolved ? '' : ' · sem telefone'}
      </div>
      <div className="mt-2 flex gap-2">
        <Button size="sm" onClick={() => setApproving(true)}>Aprovar</Button>
        <Button size="sm" variant="outline" onClick={() => review.mutate({ signalId: signal.id, humanLabel: false })}>Rejeitar</Button>
      </div>
      <ApproveDialog signal={signal} open={approving} onOpenChange={setApproving} />
    </div>
  )
}

const AlertRow = ({ signal }: { signal: ProspectSignal }) => {
  const approach = useApproachSignal()
  const [phone, setPhone] = useState('')
  const needsPhone = !signal.author_phone_resolved
  return (
    <div className="rounded-md border p-3">
      <p className="text-sm">{signal.snippet}</p>
      <div className="mt-1 text-xs text-muted-foreground">
        {signal.category ?? 'sem categoria'} · oportunidade sem telefone DM-able
      </div>
      <div className="mt-2 flex items-center gap-2">
        {needsPhone && (
          <Input className="h-9 max-w-[200px]" placeholder="telefone (DDD+número)" value={phone} onChange={(e) => setPhone(e.target.value)} />
        )}
        <Button
          size="sm"
          disabled={approach.isPending || (needsPhone && !phone.trim())}
          onClick={() => approach.mutate({ signalId: signal.id, phone: needsPhone ? phone : undefined })}
        >
          Abordei
        </Button>
      </div>
    </div>
  )
}

export const SignalsQueue = ({ mode }: { mode: 'review' | 'alert' }) => {
  const filter = { decisions: [mode === 'review' ? 'review' : 'alert'] as ProspectDecision[], reviewedNull: true, statuses: ['pending'] }
  const { data: signals, isLoading } = useProspectSignals(filter)

  if (isLoading) return <Skeleton className="h-24 w-full" />
  if (!signals?.length) {
    return (
      <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
        {mode === 'review' ? 'Nenhum sinal na fila de revisão.' : 'Nenhum alerta pendente.'}
      </CardContent></Card>
    )
  }
  return (
    <div className="space-y-3">
      {signals.map((s) => (mode === 'review' ? <ReviewRow key={s.id} signal={s} /> : <AlertRow key={s.id} signal={s} />))}
    </div>
  )
}
