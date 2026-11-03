import { useState } from 'react'
import { Check, Loader2, RefreshCw, Sparkles, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useGenerateVariants } from '@/hooks/use-campaign-variants'
import {
  DEFAULT_VERSIONS, MAX_VERSIONS, MIN_VERSIONS, validateVariant, variantProblem, type VariantDraft,
} from '@/lib/campaign-variants'

interface CampaignVariantsEditorProps {
  /** Mensagem original escrita pelo usuário (conta como uma versão). */
  original: string
  value: VariantDraft[]
  onChange: (next: VariantDraft[]) => void
  /** Opt-in de IA da empresa (features.ai_msg_enabled). */
  aiEnabled: boolean
}

const TEXTAREA_CLASS =
  'flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

export const CampaignVariantsEditor = ({ original, value, onChange, aiEnabled }: CampaignVariantsEditorProps) => {
  const [total, setTotal] = useState(DEFAULT_VERSIONS)
  const [regenerating, setRegenerating] = useState<number | null>(null)
  const generate = useGenerateVariants()
  const canGenerate = aiEnabled && original.trim() !== '' && !generate.isPending

  const handleGenerate = async () => {
    const res = await generate.mutateAsync({ message: original.trim(), count: total - 1 }).catch(() => null)
    if (res) onChange(res.variants.map((text) => ({ text, status: 'pending' })))
  }

  const update = (i: number, patch: Partial<VariantDraft>) =>
    onChange(value.map((d, j) => (j === i ? { ...d, ...patch } : d)))

  const handleRegenerate = async (i: number) => {
    setRegenerating(i)
    const avoid = [original, ...value.map((d) => d.text)]
    const res = await generate.mutateAsync({ message: original.trim(), count: 1, avoid }).catch(() => null)
    setRegenerating(null)
    if (res?.variants[0]) update(i, { text: res.variants[0], status: 'pending' })
  }

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Quantas versões</Label>
          <Select value={String(total)} onValueChange={(v) => setTotal(Number(v))}>
            <SelectTrigger className="h-8 w-24"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Array.from({ length: MAX_VERSIONS - MIN_VERSIONS + 1 }, (_, k) => k + MIN_VERSIONS).map((n) => (
                <SelectItem key={n} value={String(n)}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={handleGenerate} disabled={!canGenerate}>
          {generate.isPending && regenerating === null
            ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
          {value.length ? 'Gerar de novo' : 'Gerar variações com IA'}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {aiEnabled
          ? 'Sua mensagem conta como uma versão. Cada contato recebe uma das versões, sorteadas de forma equilibrada.'
          : 'A geração com IA não está ativa para a sua empresa.'}
      </p>

      {value.length > 0 && (
        <div className="space-y-2">
          <div className="rounded-md bg-muted/40 p-2 text-sm">
            <p className="mb-1 text-xs font-medium text-muted-foreground">Sua mensagem</p>
            <p className="whitespace-pre-wrap">{original}</p>
          </div>
          {value.map((d, i) => {
            const others = [original, ...value.filter((_, j) => j !== i).map((x) => x.text)]
            const problem = variantProblem(validateVariant(original, d.text, others))
            const approved = d.status === 'approved'
            return (
              <div key={i} className={cn('space-y-1.5 rounded-md border p-2', approved && 'border-primary/60')}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Versão {i + 2}</span>
                  {approved && <span className="flex items-center gap-1 text-xs text-primary"><Check className="h-3 w-3" />Aprovada</span>}
                </div>
                <textarea
                  aria-label={`Versão ${i + 2}`}
                  value={d.text}
                  onChange={(e) => update(i, { text: e.target.value, status: 'pending' })}
                  rows={3}
                  className={TEXTAREA_CLASS}
                />
                {problem && <p className="text-xs text-destructive">{problem}</p>}
                <div className="flex flex-wrap gap-1.5">
                  <Button type="button" size="sm" variant={approved ? 'secondary' : 'default'}
                    disabled={approved || !!problem} onClick={() => update(i, { status: 'approved' })}>
                    Aprovar
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => onChange(value.filter((_, j) => j !== i))}>
                    <Trash2 className="mr-1 h-3.5 w-3.5" />Descartar
                  </Button>
                  <Button type="button" size="sm" variant="ghost" disabled={!aiEnabled || generate.isPending}
                    onClick={() => handleRegenerate(i)}>
                    {regenerating === i
                      ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                      : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
                    Gerar outra
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
