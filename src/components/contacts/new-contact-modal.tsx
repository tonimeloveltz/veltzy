import { useEffect, useMemo } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { LeadTagsInput } from '@/components/pipeline/lead-tags-input'
import { useCreateContact } from '@/hooks/use-contacts'
import { usePipelines, useDefaultPipeline } from '@/hooks/use-pipelines'
import { useLeadSources } from '@/hooks/use-lead-sources'
import { useTeamMembers } from '@/hooks/use-team'
import type { CreateLeadInput, Lead } from '@/types/database'

const NO_OWNER = 'none'

const schema = z.object({
  name: z.string().min(1, 'Nome obrigatorio'),
  // leads.phone e NOT NULL + UNIQUE(company_id, phone): telefone e obrigatorio.
  phone: z.string().min(8, 'Telefone invalido'),
  email: z.string().email('Email invalido').optional().or(z.literal('')),
  company_name: z.string().optional(),
  source_id: z.string().uuid().optional(),
  assigned_to: z.string().optional(),
  tags: z.array(z.string()),
})

type FormValues = z.infer<typeof schema>

interface NewContactModalProps {
  open: boolean
  onClose: () => void
  /** Disparado com o contato recem-criado (ex: auto-selecionar no Novo Negocio). */
  onCreated?: (lead: Lead) => void
}

const NewContactModal = ({ open, onClose, onCreated }: NewContactModalProps) => {
  const createContact = useCreateContact()
  const { data: pipelines } = usePipelines()
  const { data: defaultPipeline } = useDefaultPipeline()
  const { data: sources } = useLeadSources()
  const { data: members } = useTeamMembers()

  // Origem default para criacao manual: source de sistema slug 'manual'.
  const manualSource = useMemo(
    () => sources?.find((s) => s.slug === 'manual'),
    [sources],
  )

  // pipeline_id e NOT NULL (ate a Fase 4): usa o pipeline default, ou o primeiro.
  const resolvedPipelineId = defaultPipeline?.id
    ?? pipelines?.find((p) => p.is_default)?.id
    ?? pipelines?.[0]?.id
    ?? ''

  const { register, handleSubmit, control, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', phone: '', tags: [], assigned_to: NO_OWNER, source_id: undefined },
  })

  useEffect(() => {
    if (open) {
      reset({
        name: '', phone: '', email: '', company_name: '',
        source_id: manualSource?.id, assigned_to: NO_OWNER, tags: [],
      })
    }
  }, [open, manualSource?.id, reset])

  const onSubmit = async (values: FormValues) => {
    const input: CreateLeadInput = {
      name: values.name,
      phone: values.phone,
      email: values.email || undefined,
      company_name: values.company_name || undefined,
      source_id: values.source_id || undefined,
      assigned_to: values.assigned_to === NO_OWNER ? undefined : values.assigned_to,
      tags: values.tags,
      pipeline_id: resolvedPipelineId,
      // stage_id e exigido pelo tipo, mas createLead nao grava negocio em leads
      // (coluna nullable). Contato puro nasce sem stage/negocio.
      stage_id: '',
    }
    const lead = await createContact.mutateAsync(input)
    onCreated?.(lead)
    reset()
    onClose()
  }

  const noPipeline = !resolvedPipelineId

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo Contato</DialogTitle>
          <DialogDescription>Cadastre uma pessoa. O negocio e criado separadamente.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {noPipeline && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
              Nenhum pipeline disponivel para vincular o contato. Crie um pipeline primeiro.
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input placeholder="Nome do contato" {...register('name')} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Telefone *</Label>
              <Input placeholder="(11) 99999-9999" {...register('phone')} />
              {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Email</Label>
            <Input type="email" placeholder="email@exemplo.com" {...register('email')} />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>

          <div className="space-y-2">
            <Label>Empresa</Label>
            <Input placeholder="Ex: Clinica Silva, Escritorio Martins..." {...register('company_name')} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Origem</Label>
              <Controller
                control={control}
                name="source_id"
                render={({ field }) => (
                  <Select value={field.value ?? ''} onValueChange={(v) => field.onChange(v || undefined)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {sources?.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-2">
              <Label>Responsavel</Label>
              <Controller
                control={control}
                name="assigned_to"
                render={({ field }) => (
                  <Select value={field.value ?? NO_OWNER} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sem responsavel" />
                    </SelectTrigger>
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

          <div className="space-y-2">
            <Label>Tags</Label>
            <Controller
              control={control}
              name="tags"
              render={({ field }) => (
                <LeadTagsInput value={field.value} onChange={field.onChange} />
              )}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={createContact.isPending || noPipeline}>
              {createContact.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Criar Contato
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export { NewContactModal }
