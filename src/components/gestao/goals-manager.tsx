import { useState } from 'react'
import { Plus, Pencil, Trash2, Target } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useGoals, useCreateGoalWithMetrics, useUpdateGoal, useDeleteGoal } from '@/hooks/use-goals'
import { useTeamMembers } from '@/hooks/use-team'
import { useAuthStore } from '@/stores/auth.store'
import type { CreateGoalInput, MetricType, Goal } from '@/services/goals.service'

interface MetricRow {
  metric_type: MetricType
  target_value: string
  applies_to: 'team' | 'individual'
  profile_id: string | null
}

const CYCLE_LABELS: Record<string, string> = {
  monthly: 'Mensal',
  sprint: 'Sprint',
  custom: 'Customizado',
}

const METRIC_LABELS: Record<MetricType, string> = {
  revenue: 'Valor Fechado',
  deals_closed: 'Deals Fechados',
  leads_attended: 'Leads Atendidos',
  conversion_rate: 'Taxa de Conversao',
  avg_response_time: 'Tempo de Resposta',
}

const emptyMetric = (): MetricRow => ({
  metric_type: 'revenue',
  target_value: '',
  applies_to: 'team',
  profile_id: null,
})

export const GoalsManager = () => {
  const companyId = useAuthStore((s) => s.company?.id)
  const { data: goals, isLoading } = useGoals()
  const { data: members } = useTeamMembers()
  const createGoalWithMetrics = useCreateGoalWithMetrics()
  const updateGoal = useUpdateGoal()
  const deleteGoal = useDeleteGoal()

  const [open, setOpen] = useState(false)
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null)
  const [title, setTitle] = useState('')
  const [cycleType, setCycleType] = useState<'monthly' | 'sprint' | 'custom'>('monthly')
  const currentYear = new Date().getFullYear()
  const [selectedMonth, setSelectedMonth] = useState('')
  const [selectedYear, setSelectedYear] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [visibleToSellers, setVisibleToSellers] = useState(true)
  const [metrics, setMetrics] = useState<MetricRow[]>([emptyMetric()])

  const resetForm = () => {
    setTitle('')
    setCycleType('monthly')
    setSelectedMonth('')
    setSelectedYear('')
    setStartDate('')
    setEndDate('')
    setVisibleToSellers(true)
    setMetrics([emptyMetric()])
  }

  const handleOpen = (goal?: Goal) => {
    if (goal) {
      setEditingGoal(goal)
      setTitle(goal.title)
      setCycleType(goal.cycle_type)
      setVisibleToSellers(goal.visible_to_sellers)
      if (goal.cycle_type === 'monthly') {
        const d = new Date(goal.start_date + 'T12:00:00')
        setSelectedMonth(String(d.getMonth() + 1).padStart(2, '0'))
        setSelectedYear(String(d.getFullYear()))
        setStartDate('')
        setEndDate('')
      } else {
        setSelectedMonth('')
        setSelectedYear('')
        setStartDate(goal.start_date)
        setEndDate(goal.end_date)
      }
      setMetrics(
        goal.goal_metrics?.map((m) => ({
          metric_type: m.metric_type,
          target_value: String(m.target_value),
          applies_to: m.applies_to,
          profile_id: m.profile_id,
        })) ?? [emptyMetric()]
      )
    } else {
      setEditingGoal(null)
      resetForm()
    }
    setOpen(true)
  }

  const addMetric = () => setMetrics((prev) => [...prev, emptyMetric()])

  const updateMetric = (index: number, field: keyof MetricRow, value: string) => {
    setMetrics((prev) =>
      prev.map((m, i) =>
        i === index
          ? {
              ...m,
              [field]: value,
              ...(field === 'applies_to' && value === 'team' ? { profile_id: null } : {}),
            }
          : m
      )
    )
  }

  const removeMetric = (index: number) => {
    setMetrics((prev) => prev.filter((_, i) => i !== index))
  }

  const getDates = (): { start_date: string; end_date: string } => {
    if (cycleType === 'monthly' && selectedMonth && selectedYear) {
      const lastDay = new Date(Number(selectedYear), Number(selectedMonth), 0).getDate()
      return {
        start_date: `${selectedYear}-${selectedMonth}-01`,
        end_date: `${selectedYear}-${selectedMonth}-${String(lastDay).padStart(2, '0')}`,
      }
    }
    return { start_date: startDate, end_date: endDate }
  }

  const handleSave = async () => {
    const dates = getDates()
    const goalInput: CreateGoalInput = {
      title,
      cycle_type: cycleType,
      start_date: dates.start_date,
      end_date: dates.end_date,
      visible_to_sellers: visibleToSellers,
    }

    const validMetrics = metrics
      .filter((m) => m.target_value)
      .map((m) => ({
        metric_type: m.metric_type,
        target_value: Number(m.target_value),
        applies_to: m.applies_to,
        profile_id: m.applies_to === 'individual' ? m.profile_id : null,
      }))

    try {
      if (editingGoal) {
        await updateGoal.mutateAsync({ id: editingGoal.id, data: goalInput })
      } else {
        await createGoalWithMetrics.mutateAsync({ goalInput, metrics: validMetrics })
      }
      setOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar meta')
    }
  }

  const formatDate = (date: string) =>
    new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between pr-4">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-9 w-28" />
        </div>
        {[1, 2].map((i) => (
          <Card key={i}>
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-8 w-20" />
              </div>
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-4 w-64" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pr-4">
        <h2 className="text-lg font-semibold text-foreground">Metas Comerciais</h2>
        <Button onClick={() => handleOpen()} size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Nova Meta
        </Button>
      </div>

      {!goals?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Target className="h-10 w-10 mb-3 opacity-40" />
            <p className="text-sm">Nenhuma meta cadastrada</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {goals.map((goal) => (
            <Card key={goal.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">{goal.title}</CardTitle>
                    <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      {CYCLE_LABELS[goal.cycle_type] ?? goal.cycle_type}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
                        goal.is_active
                          ? 'bg-emerald-500/10 text-emerald-600'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {goal.is_active ? 'Ativa' : 'Inativa'}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => handleOpen(goal)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (confirm('Tem certeza que deseja excluir esta meta? Todas as metricas configuradas serao removidas.')) {
                          deleteGoal.mutate(goal.id)
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatDate(goal.start_date)} - {formatDate(goal.end_date)}
                </p>
              </CardHeader>
              <CardContent>
                {goal.goal_metrics?.length ? (
                  <div className="space-y-1">
                    {goal.goal_metrics.map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center gap-3 text-sm text-foreground"
                      >
                        <span className="font-medium">{METRIC_LABELS[m.metric_type]}</span>
                        <span className="text-muted-foreground">
                          Alvo: {m.target_value}
                          {m.metric_type === 'conversion_rate' ? '%' : ''}
                        </span>
                        <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                          {m.applies_to === 'team' ? 'Equipe' : 'Individual'}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Nenhuma metrica configurada</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modal Nova Meta */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingGoal ? 'Editar Meta' : 'Nova Meta'}</DialogTitle>
            <DialogDescription>Configure o titulo, periodo e metricas da meta.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Titulo</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Meta Abril 2026"
              />
            </div>

            <div>
              <Label>Tipo de ciclo</Label>
              <Select value={cycleType} onValueChange={(v) => setCycleType(v as typeof cycleType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Mensal</SelectItem>
                  <SelectItem value="sprint">Sprint</SelectItem>
                  <SelectItem value="custom">Periodo customizado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {cycleType === 'monthly' ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Mes</Label>
                  <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o mes" />
                    </SelectTrigger>
                    <SelectContent>
                      {[
                        'Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho',
                        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
                      ].map((label, idx) => (
                        <SelectItem key={idx} value={String(idx + 1).padStart(2, '0')}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Ano</Label>
                  <Select value={selectedYear} onValueChange={setSelectedYear}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o ano" />
                    </SelectTrigger>
                    <SelectContent>
                      {[currentYear, currentYear + 1, currentYear + 2].map((y) => (
                        <SelectItem key={y} value={String(y)}>
                          {y}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Inicio</Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Fim</Label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                role="switch"
                aria-checked={visibleToSellers}
                onClick={() => setVisibleToSellers(!visibleToSellers)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors ${
                  visibleToSellers ? 'bg-primary' : 'bg-muted-foreground/40'
                }`}
              >
                <span
                  className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform ${
                    visibleToSellers ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
              <Label className="cursor-pointer" onClick={() => setVisibleToSellers(!visibleToSellers)}>
                Visivel para vendedores
              </Label>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Metricas</Label>
                <Button variant="outline" size="sm" onClick={addMetric}>
                  <Plus className="h-3 w-3 mr-1" />
                  Adicionar Metrica
                </Button>
              </div>

              {metrics.map((m, i) => (
                <div key={i} className="flex items-end gap-2 rounded-md border border-border p-3">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">Tipo</Label>
                    <Select
                      value={m.metric_type}
                      onValueChange={(v) => updateMetric(i, 'metric_type', v)}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(METRIC_LABELS).map(([key, label]) => (
                          <SelectItem key={key} value={key}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="w-24 space-y-1">
                    <Label className="text-xs">Alvo</Label>
                    <Input
                      type="number"
                      className="h-9"
                      value={m.target_value}
                      onChange={(e) => updateMetric(i, 'target_value', e.target.value)}
                      placeholder="0"
                    />
                  </div>

                  <div className="w-32 space-y-1">
                    <Label className="text-xs">Escopo</Label>
                    <Select
                      value={m.applies_to}
                      onValueChange={(v) => updateMetric(i, 'applies_to', v)}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="team">Equipe toda</SelectItem>
                        <SelectItem value="individual">Individual</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {m.applies_to === 'individual' && (
                    <div className="w-40 space-y-1">
                      <Label className="text-xs">Vendedor</Label>
                      <Select
                        value={m.profile_id ?? ''}
                        onValueChange={(v) => updateMetric(i, 'profile_id', v)}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          {members?.map((member) => (
                            <SelectItem key={member.id} value={member.id}>
                              {member.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {metrics.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 px-2"
                      onClick={() => removeMetric(i)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={!title || createGoal.isPending || updateGoal.isPending}
            >
              {(createGoal.isPending || updateGoal.isPending) ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
