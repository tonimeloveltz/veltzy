import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth.store'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { AutoReplyConfig } from '@/types/database'

const DAYS = [
  { value: 1, label: 'Seg' },
  { value: 2, label: 'Ter' },
  { value: 3, label: 'Qua' },
  { value: 4, label: 'Qui' },
  { value: 5, label: 'Sex' },
  { value: 6, label: 'Sab' },
  { value: 0, label: 'Dom' },
]

const defaultConfig: AutoReplyConfig = {
  enabled: false,
  message: 'Obrigado pelo contato! No momento estamos fora do horario de atendimento. Retornaremos em breve.',
  schedule: { start: '08:00', end: '18:00', days: [1, 2, 3, 4, 5], timezone: 'America/Sao_Paulo' },
}

const AutoReplySettings = () => {
  const companyId = useAuthStore((s) => s.company?.id)
  const queryClient = useQueryClient()

  const { data: config, isLoading } = useQuery({
    queryKey: ['auto-reply-config', companyId],
    queryFn: async () => {
      const { data } = await supabase.schema('veltzy')
        .from('system_settings')
        .select('value')
        .eq('company_id', companyId!)
        .eq('key', 'auto_reply_config')
        .maybeSingle()
      return (data?.value as AutoReplyConfig) ?? defaultConfig
    },
    enabled: !!companyId,
  })

  const { register, handleSubmit, watch, setValue, reset } = useForm<AutoReplyConfig>({
    defaultValues: defaultConfig,
  })

  useEffect(() => {
    if (config) reset(config)
  }, [config, reset])

  const enabled = watch('enabled')
  const selectedDays = watch('schedule.days') ?? []

  const saveMutation = useMutation({
    mutationFn: async (values: AutoReplyConfig) => {
      const { error } = await supabase.schema('veltzy')
        .from('system_settings')
        .upsert(
          { company_id: companyId!, key: 'auto_reply_config', value: values as unknown as Record<string, unknown> },
          { onConflict: 'company_id,key' }
        )
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auto-reply-config'] })
      toast.success('Auto-reply salvo!')
    },
  })

  const toggleDay = (day: number) => {
    if (!enabled) return
    const current = selectedDays
    const next = current.includes(day) ? current.filter((d) => d !== day) : [...current, day]
    setValue('schedule.days', next)
  }

  if (isLoading) return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>

  return (
    <Card>
      <CardHeader>
        <CardTitle>Auto-Reply</CardTitle>
        <CardDescription>Mensagem automatica quando leads entram fora do horario comercial</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit((v) => saveMutation.mutate(v))} className="space-y-4">
          <div className="flex items-center gap-3">
            <label className="relative inline-flex cursor-pointer items-center">
              <input type="checkbox" className="peer sr-only" {...register('enabled')} />
              <div className="peer h-5 w-9 rounded-full bg-muted-foreground/40 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-background after:transition-all peer-checked:bg-primary peer-checked:after:translate-x-full" />
            </label>
            <span className="text-sm">{enabled ? 'Ativo' : 'Desativado'}</span>
          </div>

          <div className="space-y-2">
            <Label>Mensagem</Label>
            <textarea
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm input-clean disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!enabled}
              {...register('message')}
            />
          </div>

          <Label className="block pt-2 font-semibold">Definir horario comercial</Label>

          <div className="space-y-2">
            <Label>Dias da semana</Label>
            <div className="flex gap-1.5">
              {DAYS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  disabled={!enabled}
                  onClick={() => toggleDay(d.value)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-smooth disabled:cursor-not-allowed disabled:opacity-50 ${
                    selectedDays.includes(d.value)
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Inicio</Label>
              <Input type="time" disabled={!enabled} {...register('schedule.start')} />
            </div>
            <div className="space-y-2">
              <Label>Fim</Label>
              <Input type="time" disabled={!enabled} {...register('schedule.end')} />
            </div>
          </div>

          <Button type="submit" disabled={saveMutation.isPending}>
            {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

export { AutoReplySettings }
