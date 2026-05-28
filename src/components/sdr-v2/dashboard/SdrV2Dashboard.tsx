import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useSdrV2Metrics, useSdrV2Conversations } from '@/hooks/use-sdr-v2-metrics'
import { usePipelines } from '@/hooks/use-pipelines'
import { USD_TO_BRL } from '@/types/sdr-v2'
import {
  MessageSquare, Target, ArrowUpRight,
  DollarSign, Zap, Hash, Clock,
} from 'lucide-react'

const PERIOD_OPTIONS = [
  { value: '1', label: 'Hoje' },
  { value: '7', label: '7 dias' },
  { value: '30', label: '30 dias' },
  { value: '90', label: '90 dias' },
]

const STATUS_LABELS: Record<string, string> = {
  active: 'Ativa',
  escalated: 'Escalada',
  completed: 'Concluida',
  abandoned: 'Abandonada',
  failed: 'Falha',
}

export const SdrV2Dashboard = () => {
  const [periodDays, setPeriodDays] = useState(30)
  const [pipelineId, setPipelineId] = useState<string | undefined>()
  const { data: pipelines } = usePipelines()
  const { data: metrics, isLoading: metricsLoading } = useSdrV2Metrics(pipelineId, periodDays)
  const { data: conversations, isLoading: convsLoading } = useSdrV2Conversations(pipelineId, periodDays)

  return (
    <div className="space-y-6">
      {/* Header + Filters */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">SDR IA</h2>
          <p className="text-sm text-muted-foreground">Metricas do agente SDR IA</p>
        </div>
        <div className="flex gap-2">
          <Select value={pipelineId ?? 'all'} onValueChange={(v) => setPipelineId(v === 'all' ? undefined : v)}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Todos os pipelines" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os pipelines</SelectItem>
              {pipelines?.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(periodDays)} onValueChange={(v) => setPeriodDays(Number(v))}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI Cards */}
      {metricsLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : metrics ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard icon={MessageSquare} label="Conversas iniciadas" value={String(metrics.conversations_started)} />
          <KpiCard icon={Clock} label="Conversas ativas" value={String(metrics.conversations_active)} />
          <KpiCard icon={Target} label="Taxa de qualificacao" value={`${(metrics.qualification_rate * 100).toFixed(0)}%`} />
          <KpiCard icon={ArrowUpRight} label="Escaladas p/ humano" value={String(metrics.escalation_count)} />
          <KpiCard icon={DollarSign} label="Custo total" value={formatBRL(metrics.total_cost_brl)} />
          <KpiCard icon={DollarSign} label="Custo medio/conversa" value={formatBRL(metrics.avg_cost_per_conversation_brl)} />
          <KpiCard icon={Zap} label="Tokens consumidos" value={formatNumber(metrics.total_tokens)} />
          <KpiCard icon={Hash} label="Tool calls" value={String(metrics.total_tool_calls)} />
        </div>
      ) : null}

      {/* Conversations table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Conversas recentes</CardTitle>
        </CardHeader>
        <CardContent>
          {convsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
            </div>
          ) : !conversations || conversations.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma conversa no periodo selecionado.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="pb-2 font-medium">Lead</th>
                    <th className="pb-2 font-medium">Pipeline</th>
                    <th className="pb-2 font-medium">Status</th>
                    <th className="pb-2 font-medium text-right">Iteracoes</th>
                    <th className="pb-2 font-medium text-right">Tokens</th>
                    <th className="pb-2 font-medium text-right">Custo</th>
                    <th className="pb-2 font-medium text-right">Ultima atividade</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {conversations.map((conv) => (
                    <tr key={conv.id} className="hover:bg-muted/50">
                      <td className="py-2">
                        <div className="font-medium">{conv.lead_name ?? 'Sem nome'}</div>
                        <div className="text-xs text-muted-foreground">{conv.lead_phone}</div>
                      </td>
                      <td className="py-2 text-muted-foreground">{conv.pipeline_name ?? '-'}</td>
                      <td className="py-2">
                        <StatusBadge status={conv.status} />
                      </td>
                      <td className="py-2 text-right">{conv.total_iterations}</td>
                      <td className="py-2 text-right">{formatNumber(conv.total_tokens_used)}</td>
                      <td className="py-2 text-right">{formatBRL(conv.total_cost_usd * USD_TO_BRL)}</td>
                      <td className="py-2 text-right text-xs text-muted-foreground">
                        {formatRelativeTime(conv.last_activity_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// --- Subcomponents ---

const KpiCard = ({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) => (
  <Card>
    <CardContent className="flex items-center gap-3 pt-4">
      <div className="rounded-md bg-primary/10 p-2">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-bold">{value}</p>
      </div>
    </CardContent>
  </Card>
)

const StatusBadge = ({ status }: { status: string }) => {
  const colors: Record<string, string> = {
    active: 'bg-green-500/10 text-green-700 dark:text-green-400',
    escalated: 'bg-orange-500/10 text-orange-700 dark:text-orange-400',
    completed: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
    abandoned: 'bg-muted text-muted-foreground',
    failed: 'bg-destructive/10 text-destructive',
  }
  return (
    <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium ${colors[status] ?? 'bg-muted'}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

function formatBRL(value: number): string {
  return `R$ ${value.toFixed(2).replace('.', ',')}`
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `${minutes}min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}
