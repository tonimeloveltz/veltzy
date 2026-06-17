import { useEffect, useMemo, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, ChevronsUpDown, Search, Plus, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { leadDisplayName } from '@/lib/phone'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { NewContactModal } from '@/components/contacts/new-contact-modal'
import { useContacts } from '@/hooks/use-contacts'
import { useCreateDeal } from '@/hooks/use-deals'
import { useAccessiblePipelines } from '@/hooks/use-pipeline-access'
import { usePipelineStages } from '@/hooks/use-pipeline-stages'
import { useTeamMembers } from '@/hooks/use-team'
import type { CreateDealInput, DealStatus, Lead } from '@/types/database'

const NO_OWNER = 'none'

const schema = z.object({
  lead_id: z.string().uuid('Selecione um contato'),
  name: z.string().min(1, 'Nome do negocio obrigatorio'),
  pipeline_id: z.string().uuid('Selecione um pipeline'),
  stage_id: z.string().uuid('Selecione uma etapa'),
  value: z.number().nonnegative().optional().or(z.nan().transform(() => undefined)),
  assigned_to: z.string().optional(),
  closed_date: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

interface SelectedContact {
  id: string
  name: string | null
  phone: string
}

interface NewDealModalProps {
  open: boolean
  onClose: () => void
  /** Pre-seleciona o pipeline ao abrir (ex: pipeline do board). Editavel. */
  defaultPipelineId?: string
  /** Pre-seleciona a etapa ao abrir (ex: coluna do board). Editavel. */
  defaultStageId?: string
  /** Trava o contato (inbox/card): contato ja conhecido, esconde o seletor. */
  lockedLeadId?: string
  lockedLeadName?: string | null
}

const NewDealModal = ({ open, onClose, defaultPipelineId, defaultStageId, lockedLeadId, lockedLeadName }: NewDealModalProps) => {
  const createDeal = useCreateDeal()
  const { data: contacts } = useContacts()
  const { data: pipelines } = useAccessiblePipelines()
  const { data: members } = useTeamMembers()

  const [todayStr] = useState(() => new Date().toISOString().slice(0, 10))
  const [pickerOpen, setPickerOpen] = useState(false)
  const [contactSearch, setContactSearch] = useState('')
  const [newContactOpen, setNewContactOpen] = useState(false)
  const [selectedContact, setSelectedContact] = useState<SelectedContact | null>(null)

  const { register, handleSubmit, control, reset, watch, setValue, setError, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { lead_id: '', name: '', value: 0, assigned_to: NO_OWNER },
  })

  const selectedPipelineId = watch('pipeline_id')
  const selectedStageId = watch('stage_id')
  const { data: stages } = usePipelineStages(selectedPipelineId || null)

  const selectedStage = stages?.find((s) => s.id === selectedStageId)
  const isFinalStage = !!selectedStage?.is_final
  const isWonStage = isFinalStage && selectedStage?.is_positive === true

  // Reset ao abrir, com pipeline default/primeiro acessivel.
  useEffect(() => {
    if (open) {
      const resolvedPipelineId = defaultPipelineId
        ?? pipelines?.find((p) => p.is_default)?.id ?? pipelines?.[0]?.id ?? ''
      setSelectedContact(lockedLeadId ? { id: lockedLeadId, name: lockedLeadName ?? null, phone: '' } : null)
      setContactSearch('')
      reset({
        lead_id: lockedLeadId ?? '',
        name: lockedLeadId && lockedLeadName ? `Negocio - ${lockedLeadName}` : '',
        pipeline_id: resolvedPipelineId,
        stage_id: defaultStageId ?? '',
        value: 0, assigned_to: NO_OWNER, closed_date: todayStr,
      })
    }
  }, [open, pipelines, reset, todayStr, defaultPipelineId, defaultStageId, lockedLeadId, lockedLeadName])

  // Quando pipeline muda, seleciona a primeira etapa.
  useEffect(() => {
    if (stages && stages.length > 0) {
      const exists = stages.some((s) => s.id === selectedStageId)
      if (!exists) setValue('stage_id', stages[0].id)
    }
  }, [stages, selectedStageId, setValue])

  const filteredContacts = useMemo(() => {
    const q = contactSearch.trim().toLowerCase()
    const list = contacts ?? []
    if (!q) return list.slice(0, 50)
    return list
      .filter((c) => `${c.name ?? ''} ${c.phone ?? ''} ${c.email ?? ''}`.toLowerCase().includes(q))
      .slice(0, 50)
  }, [contacts, contactSearch])

  const selectContact = (c: SelectedContact) => {
    setSelectedContact(c)
    setValue('lead_id', c.id, { shouldValidate: true })
    // Pre-preenche nome do negocio (editavel) para dar identidade sem friccao.
    setValue('name', `Negocio - ${leadDisplayName(c.name, c.phone ?? '')}`)
  }

  const handleContactCreated = (lead: Lead) => {
    selectContact({ id: lead.id, name: lead.name, phone: lead.phone })
    setNewContactOpen(false)
    setPickerOpen(false)
  }

  const onSubmit = async (values: FormValues) => {
    const stage = stages?.find((s) => s.id === values.stage_id)
    let status: DealStatus = 'open'
    let closed_at: string | null = null
    if (stage?.is_final) {
      status = stage.is_positive ? 'won' : 'lost'
      const date = values.closed_date || todayStr
      if (date > todayStr) {
        setError('closed_date', { message: 'A data de fechamento nao pode ser futura' })
        return
      }
      // Meio-dia local evita rollover de fuso nos relatorios.
      closed_at = new Date(`${date}T12:00:00`).toISOString()
    }

    const input: CreateDealInput = {
      lead_id: values.lead_id,
      name: values.name,
      pipeline_id: values.pipeline_id,
      stage_id: values.stage_id,
      value: values.value || 0,
      assigned_to: values.assigned_to === NO_OWNER ? null : values.assigned_to,
      status,
      closed_at,
    }

    try {
      await createDeal.mutateAsync(input)
      reset()
      onClose()
    } catch {
      // Erro (ex: constraint 065 -> "Este contato ja tem um negocio ativo neste
      // pipeline") ja exibido via toast no onError do useCreateDeal. Modal segue aberto.
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo Negocio</DialogTitle>
          <DialogDescription>Crie uma oportunidade para um contato.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Contato */}
          <div className="space-y-2">
            <Label>Contato *</Label>
            {lockedLeadId ? (
              <div className="flex h-10 items-center rounded-md border border-input bg-muted/30 px-3 text-sm">
                <span className="truncate">{leadDisplayName(lockedLeadName ?? null, '') || 'Contato'}</span>
              </div>
            ) : (
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" role="combobox" className="w-full justify-between font-normal">
                  <span className={cn('truncate', !selectedContact && 'text-muted-foreground')}>
                    {selectedContact ? leadDisplayName(selectedContact.name, selectedContact.phone ?? '') : 'Selecione um contato'}
                  </span>
                  <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                <div className="flex items-center gap-2 border-b border-border/40 px-3 py-2">
                  <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                  <input
                    value={contactSearch}
                    onChange={(e) => setContactSearch(e.target.value)}
                    placeholder="Buscar contato..."
                    className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  />
                </div>
                <div className="max-h-56 overflow-y-auto py-1">
                  {filteredContacts.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => { selectContact(c); setPickerOpen(false) }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50"
                    >
                      <Check className={cn('h-4 w-4 shrink-0', selectedContact?.id === c.id ? 'opacity-100' : 'opacity-0')} />
                      <span className="min-w-0 flex-1 truncate">{leadDisplayName(c.name, c.phone ?? '')}</span>
                      <span className="text-[11px] text-muted-foreground shrink-0">{c.phone}</span>
                    </button>
                  ))}
                  {filteredContacts.length === 0 && (
                    <p className="px-3 py-4 text-center text-xs text-muted-foreground">Nenhum contato encontrado</p>
                  )}
                </div>
                <div className="border-t border-border/40 p-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start gap-2"
                    onClick={() => { setPickerOpen(false); setNewContactOpen(true) }}
                  >
                    <Plus className="h-4 w-4" />
                    Criar novo contato
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
            )}
            {errors.lead_id && <p className="text-xs text-destructive">{errors.lead_id.message}</p>}
          </div>

          {/* Nome do negocio */}
          <div className="space-y-2">
            <Label>Nome do negocio *</Label>
            <Input placeholder="Ex: Plano anual - Clinica Silva" {...register('name')} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          {/* Pipeline + Etapa */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Pipeline *</Label>
              <Controller
                control={control}
                name="pipeline_id"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {pipelines?.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.pipeline_id && <p className="text-xs text-destructive">{errors.pipeline_id.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Etapa *</Label>
              <Controller
                control={control}
                name="stage_id"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {stages?.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.stage_id && <p className="text-xs text-destructive">{errors.stage_id.message}</p>}
            </div>
          </div>

          {/* Valor + Responsavel */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Valor (R$)</Label>
              <Input type="number" step="0.01" placeholder="0,00" {...register('value', { valueAsNumber: true })} />
            </div>
            <div className="space-y-2">
              <Label>Responsavel</Label>
              <Controller
                control={control}
                name="assigned_to"
                render={({ field }) => (
                  <Select value={field.value ?? NO_OWNER} onValueChange={field.onChange}>
                    <SelectTrigger><SelectValue placeholder="Sem responsavel" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_OWNER}>Sem responsavel</SelectItem>
                      {members?.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          {/* Data de fechamento (so etapa final) */}
          {isFinalStage && (
            <div className="space-y-2">
              <Label htmlFor="deal-closed-date">
                Data do fechamento {isWonStage ? '(ganho)' : '(perdido)'}
              </Label>
              <Input id="deal-closed-date" type="date" max={todayStr} {...register('closed_date')} />
              <p className="text-xs text-muted-foreground">
                Para lancar um fechamento passado, ajuste a data real.
              </p>
              {errors.closed_date && <p className="text-xs text-destructive">{errors.closed_date.message}</p>}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={createDeal.isPending}>
              {createDeal.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Criar Negocio
            </Button>
          </div>
        </form>
      </DialogContent>

      <NewContactModal
        open={newContactOpen}
        onClose={() => setNewContactOpen(false)}
        onCreated={handleContactCreated}
      />
    </Dialog>
  )
}

export { NewDealModal }
