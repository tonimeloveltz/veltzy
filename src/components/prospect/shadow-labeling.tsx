import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useProspectSignals, useReviewSignal } from '@/hooks/use-prospect-signals'
import type { ProspectDecision } from '@/types/database'

// Modo sombra: a Iris classifica mas NÃO envia. Aqui o humano rotula é/não-é pra
// medir precisão (Jev vs humano). Rotular via RPC prospect_review_signal (trigger-safe).
export const ShadowLabeling = () => {
  const { data: signals, isLoading } = useProspectSignals({
    shadow: true,
    decisions: ['auto_dm', 'review', 'alert'] as ProspectDecision[],
  })
  const review = useReviewSignal()

  if (isLoading) return <Skeleton className="h-24 w-full" />
  if (!signals?.length) {
    return <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Nenhum sinal em sombra.</CardContent></Card>
  }

  const labeled = signals.filter((s) => s.human_label !== null)
  const agree = labeled.filter((s) => s.human_label === s.is_opportunity).length
  const agreePct = labeled.length ? Math.round((agree / labeled.length) * 100) : null

  return (
    <div className="space-y-3">
      {agreePct !== null && (
        <Card><CardContent className="py-3 text-sm">
          Concordância Jev × humano: <strong>{agreePct}%</strong> ({agree}/{labeled.length} rotulados)
        </CardContent></Card>
      )}
      {signals.map((s) => (
        <div key={s.id} className="rounded-md border p-3">
          <p className="text-sm">{s.snippet}</p>
          <div className="mt-1 text-xs text-muted-foreground">
            Jev: {s.is_opportunity ? 'oportunidade' : 'não'} · prob {s.probability ?? 'n/d'}
            {s.human_label !== null && ` · humano: ${s.human_label ? 'é' : 'não é'}`}
          </div>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant={s.human_label === true ? 'default' : 'outline'}
              onClick={() => review.mutate({ signalId: s.id, humanLabel: true })}>É oportunidade</Button>
            <Button size="sm" variant={s.human_label === false ? 'default' : 'outline'}
              onClick={() => review.mutate({ signalId: s.id, humanLabel: false })}>Não é</Button>
          </div>
        </div>
      ))}
    </div>
  )
}
