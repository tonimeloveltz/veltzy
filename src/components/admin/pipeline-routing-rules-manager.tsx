import { useState } from 'react'
import { Plus, Trash2, Route, HelpCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useRoles } from '@/hooks/use-roles'
import { useWhatsAppInstances } from '@/hooks/use-whatsapp-instances'
import { useLeadSources } from '@/hooks/use-lead-sources'
import {
  useRoutingRules,
  useCreateRoutingRule,
  useUpdateRoutingRule,
  useDeleteRoutingRule,
} from '@/hooks/use-pipeline-routing-rules'
import type { RoutingMatchType } from '@/types/database'

const MATCH_TYPE_LABELS: Record<RoutingMatchType, string> = {
  ad_id: 'Campanha: ID do anúncio',
  campaign_id: 'Campanha: ID da campanha',
  utm_campaign: 'Campanha: UTM',
  instance: 'Número de WhatsApp',
  webhook_source: 'Webhook / Origem',
}

// Ordem de especificidade (a mais especifica vence quando mais de uma casa).
const MATCH_TYPE_ORDER: RoutingMatchType[] = ['ad_id', 'campaign_id', 'utm_campaign', 'instance', 'webhook_source']

interface PipelineRoutingRulesManagerProps {
  pipelineId: string | null
}

const PipelineRoutingRulesManager = ({ pipelineId }: PipelineRoutingRulesManagerProps) => {
  const { isAdmin } = useRoles()
  const { data: rules, isLoading } = useRoutingRules(pipelineId ?? undefined)
  const { data: instances } = useWhatsAppInstances()
  const { data: sources } = useLeadSources()
  const createRule = useCreateRoutingRule()
  const updateRule = useUpdateRoutingRule()
  const deleteRule = useDeleteRoutingRule()

  const [newType, setNewType] = useState<RoutingMatchType>('instance')
  const [newValue, setNewValue] = useState('')

  // Gating: so admin configura roteamento (mesmo padrao das instancias).
  if (!isAdmin) return null

  // Rotulo legivel do valor de uma regra (nome da instancia/origem quando resolvido).
  const renderValue = (type: RoutingMatchType, value: string) => {
    if (type === 'instance') {
      return instances?.find((i) => i.instance_name === value)?.display_name ?? value
    }
    if (type === 'webhook_source') {
      return sources?.find((s) => s.id === value)?.name ?? value
    }
    return value
  }

  const handleAdd = async () => {
    if (!pipelineId || !newValue.trim()) return
    try {
      await createRule.mutateAsync({ pipelineId, matchType: newType, matchValue: newValue.trim() })
      setNewValue('')
      toast.success('Regra criada!')
    } catch (err) {
      const code = (err as { code?: string })?.code
      if (code === '23505') {
        toast.error('Já existe uma regra para essa origem')
      } else {
        toast.error(err instanceof Error ? err.message : 'Erro ao criar regra')
      }
    }
  }

  const handleToggle = async (id: string, isActive: boolean) => {
    try {
      await updateRule.mutateAsync({ id, patch: { isActive } })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao atualizar regra')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Remover esta regra de roteamento?')) return
    try {
      await deleteRule.mutateAsync(id)
      toast.success('Regra removida!')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao remover regra')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Route className="h-4 w-4" />
          Origem &rarr; funil
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="Como funciona a precedência">
                <HelpCircle className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              Quando um negócio se encaixa em mais de uma regra, vence a mais específica: anúncio &gt; campanha &gt; UTM &gt; número &gt; webhook.
            </TooltipContent>
          </Tooltip>
        </CardTitle>
        <CardDescription>
          Cada negócio entra neste funil pela origem. Vale a regra mais específica; sem regra, vai para o funil padrão.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!pipelineId && (
          <p className="text-sm text-muted-foreground">Selecione um funil para configurar o roteamento.</p>
        )}

        {pipelineId && isLoading && (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg border border-border/30 p-3">
                <Skeleton className="h-4 w-4 rounded-full" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-7 rounded-full" />
              </div>
            ))}
          </div>
        )}

        {pipelineId && !isLoading && rules?.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nenhuma regra. Sem regra que case, o negócio segue para o funil padrão da empresa.
          </p>
        )}

        {pipelineId && rules?.map((rule) => (
          <div key={rule.id} className="flex items-center gap-3 rounded-lg border border-border/30 p-3">
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground shrink-0">
              {MATCH_TYPE_LABELS[rule.match_type]}
            </span>
            <span className="text-sm font-medium flex-1 truncate">{renderValue(rule.match_type, rule.match_value)}</span>
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                className="peer sr-only"
                checked={rule.is_active}
                onChange={() => handleToggle(rule.id, !rule.is_active)}
              />
              <div className="peer h-4 w-7 rounded-full bg-muted-foreground/40 after:absolute after:left-[2px] after:top-[2px] after:h-3 after:w-3 after:rounded-full after:bg-background after:transition-all peer-checked:bg-primary peer-checked:after:translate-x-3" />
            </label>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(rule.id)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}

        {pipelineId && (
          <div className="flex flex-col gap-2 pt-2 border-t sm:flex-row sm:items-center">
            <Select
              value={newType}
              onValueChange={(v) => { setNewType(v as RoutingMatchType); setNewValue('') }}
            >
              <SelectTrigger className="h-8 sm:w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MATCH_TYPE_ORDER.map((t) => (
                  <SelectItem key={t} value={t}>{MATCH_TYPE_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {newType === 'instance' ? (
              <Select value={newValue} onValueChange={setNewValue}>
                <SelectTrigger className="h-8 flex-1"><SelectValue placeholder="Escolha o número" /></SelectTrigger>
                <SelectContent>
                  {instances?.map((i) => (
                    <SelectItem key={i.instance_name} value={i.instance_name}>
                      {i.display_name || i.instance_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : newType === 'webhook_source' ? (
              <Select value={newValue} onValueChange={setNewValue}>
                <SelectTrigger className="h-8 flex-1"><SelectValue placeholder="Escolha a origem" /></SelectTrigger>
                <SelectContent>
                  {sources?.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                placeholder={newType === 'utm_campaign' ? 'Valor da UTM...' : 'ID da campanha/anúncio...'}
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                className="h-8 flex-1"
              />
            )}

            <Button size="sm" onClick={handleAdd} disabled={!newValue.trim() || createRule.isPending}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export { PipelineRoutingRulesManager }
