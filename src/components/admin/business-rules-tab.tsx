import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import {
  Loader2, RotateCcw, Shuffle, UserCheck, Bot, Star,
  Mic, Users, Bell, TrendingUp, ShieldCheck, CalendarClock, Pencil,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { useAuthStore } from '@/stores/auth.store'
import { veltzy } from '@/lib/supabase'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

interface BusinessRules {
  // existing fields
  fallback_role: string
  auto_reply_enabled: boolean
  fallback_lead_owner: string | null
  // new fields
  round_robin_enabled: boolean
  handover_enabled: boolean
  ai_reactivation_enabled: boolean
  ai_scoring_enabled: boolean
  ai_score_threshold: number
  audio_enabled: boolean
  lead_limit_enabled: boolean
  lead_limit_per_seller: number
  sla_alert_enabled: boolean
  sla_hours: number
  followup_alert_enabled: boolean
  followup_days: number
  require_deal_value: boolean
  min_score_to_advance: boolean
  min_score_value: number
}

const defaults: BusinessRules = {
  fallback_role: 'admin',
  auto_reply_enabled: false,
  fallback_lead_owner: null,
  round_robin_enabled: true,
  handover_enabled: true,
  ai_reactivation_enabled: true,
  ai_scoring_enabled: false,
  ai_score_threshold: 0,
  audio_enabled: true,
  lead_limit_enabled: false,
  lead_limit_per_seller: 50,
  sla_alert_enabled: false,
  sla_hours: 2,
  followup_alert_enabled: false,
  followup_days: 7,
  require_deal_value: false,
  min_score_to_advance: false,
  min_score_value: 0,
}

interface RuleConfig {
  key: keyof BusinessRules
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  extraKey?: keyof BusinessRules
  extraLabel?: string
  extraMin?: number
  extraMax?: number
  extraSuffix?: string
}

const rules: RuleConfig[] = [
  {
    key: 'round_robin_enabled',
    icon: Shuffle,
    title: 'Distribuicao Round-Robin',
    description: 'Distribui novos leads automaticamente entre vendedores disponiveis.',
  },
  {
    key: 'handover_enabled',
    icon: UserCheck,
    title: 'Handover para Humano',
    description: 'IA desativa automaticamente quando um vendedor humano responde.',
  },
  {
    key: 'ai_reactivation_enabled',
    icon: Bot,
    title: 'Reativacao Manual da IA',
    description: 'Vendedor pode reativar a IA apos um handover.',
  },
  {
    key: 'ai_scoring_enabled',
    icon: Star,
    title: 'Qualificacao por Score de IA',
    description: 'Leads recebem score automatico baseado nas interacoes.',
    extraKey: 'ai_score_threshold',
    extraLabel: 'Score minimo para avancar para Proposta',
    extraMin: 0,
    extraMax: 100,
  },
  {
    key: 'audio_enabled',
    icon: Mic,
    title: 'Envio de Audio no Chat',
    description: 'Vendedores podem enviar mensagens de audio.',
  },
  {
    key: 'lead_limit_enabled',
    icon: Users,
    title: 'Limite de Leads Ativos por Vendedor',
    description: 'Leads ativos sao aqueles em fases nao-finais (is_final = false). Ao atingir o limite, novos leads nao sao atribuidos ao vendedor automaticamente. O gestor realoca manualmente.',
    extraKey: 'lead_limit_per_seller',
    extraLabel: 'Maximo de leads ativos por vendedor',
    extraMin: 1,
    extraMax: 999,
  },
  {
    key: 'sla_alert_enabled',
    icon: Bell,
    title: 'Alerta de Primeiro Contato (SLA)',
    description: 'Apenas notifica o gestor. Nenhuma acao automatica e tomada.',
    extraKey: 'sla_hours',
    extraLabel: 'Alertar gestor apos X horas sem resposta a lead novo',
    extraMin: 1,
    extraMax: 72,
    extraSuffix: 'horas',
  },
  {
    key: 'followup_alert_enabled',
    icon: CalendarClock,
    title: 'Alerta de Follow-up',
    description: 'Notifica o proprio vendedor. Nao redistribui o lead.',
    extraKey: 'followup_days',
    extraLabel: 'Lembrar vendedor apos X dias sem contato com o lead',
    extraMin: 1,
    extraMax: 90,
    extraSuffix: 'dias',
  },
  {
    key: 'require_deal_value',
    icon: TrendingUp,
    title: 'Bloqueio de Avanco sem Valor',
    description: 'Impede que um lead avance de fase sem valor de negocio preenchido.',
  },
  {
    key: 'min_score_to_advance',
    icon: ShieldCheck,
    title: 'Score Minimo para Avancar de Fase',
    description: 'Lead so avanca para Proposta se o score de IA for igual ou superior ao minimo configurado.',
    extraKey: 'min_score_value',
    extraLabel: 'Score minimo',
    extraMin: 0,
    extraMax: 100,
  },
]

const Toggle = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={() => onChange(!checked)}
    className={cn(
      'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-smooth',
      checked ? 'bg-primary' : 'bg-muted-foreground/40'
    )}
  >
    <span
      className={cn(
        'pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform',
        checked ? 'translate-x-4' : 'translate-x-0'
      )}
    />
  </button>
)

const BusinessRulesTab = () => {
  const companyId = useAuthStore((s) => s.company?.id)
  const queryClient = useQueryClient()
  const [state, setState] = useState<BusinessRules>(defaults)
  const [expandedRule, setExpandedRule] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['business-rules', companyId],
    queryFn: async () => {
      const { data } = await veltzy()
        .from('system_settings')
        .select('value')
        .eq('company_id', companyId!)
        .eq('key', 'business_rules')
        .maybeSingle()
      return { ...defaults, ...(data?.value as Partial<BusinessRules> ?? {}) }
    },
    enabled: !!companyId,
  })

  useEffect(() => {
    if (data) setState(data)
  }, [data])

  const saveMutation = useMutation({
    mutationFn: async (values: BusinessRules) => {
      const { error } = await veltzy()
        .from('system_settings')
        .upsert(
          { company_id: companyId!, key: 'business_rules', value: values as unknown as Record<string, unknown> },
          { onConflict: 'company_id,key' }
        )
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['business-rules'] })
      toast.success('Regras salvas!')
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar')
    },
  })

  const update = (key: keyof BusinessRules, value: unknown) => {
    setState((prev) => ({ ...prev, [key]: value }))
  }

  const handleReset = () => {
    setState({ ...defaults, fallback_role: state.fallback_role, fallback_lead_owner: state.fallback_lead_owner })
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Regras de Negocio</CardTitle>
          <CardDescription>Configure o comportamento do sistema comercial</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {rules.map((rule) => {
            const enabled = state[rule.key] as boolean
            const expanded = expandedRule === rule.key && rule.extraKey
            const Icon = rule.icon

            return (
              <div
                key={rule.key}
                className={cn(
                  'rounded-lg border border-border p-4 transition-smooth',
                  !enabled && 'opacity-50'
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{rule.title}</p>
                    <p className="text-xs text-muted-foreground">{rule.description}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {rule.extraKey && (
                      <button
                        onClick={() => setExpandedRule(expanded ? null : String(rule.key))}
                        className="rounded p-1.5 text-muted-foreground hover:text-accent-foreground hover:bg-accent transition-smooth"
                        title="Configurar"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <Toggle checked={enabled} onChange={(v) => update(rule.key, v)} />
                  </div>
                </div>

                {expanded && rule.extraKey && (
                  <div className="mt-3 ml-12 flex items-center gap-3">
                    <label className="text-xs text-muted-foreground whitespace-nowrap">
                      {rule.extraLabel}
                    </label>
                    <Input
                      type="number"
                      className="h-8 w-24 text-xs"
                      min={rule.extraMin}
                      max={rule.extraMax}
                      value={state[rule.extraKey] as number}
                      onChange={(e) => update(rule.extraKey!, Number(e.target.value))}
                    />
                    {rule.extraSuffix && (
                      <span className="text-xs text-muted-foreground">{rule.extraSuffix}</span>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3 mt-4">
            <p className="text-xs text-yellow-600 dark:text-yellow-400">
              Alteracoes nas regras afetam o fluxo de toda a equipe.
            </p>
          </div>

          <div className="flex items-center justify-between pt-2">
            <Button variant="outline" onClick={handleReset}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Restaurar Padrao
            </Button>
            <Button onClick={() => saveMutation.mutate(state)} disabled={saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar Regras
            </Button>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground px-1">
        A configuracao de Resposta Automatica esta disponivel em Gestao &gt; Auto-Reply.
      </p>
    </div>
  )
}

export { BusinessRulesTab }
