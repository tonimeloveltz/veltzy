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
import { PhoneInput } from '@/components/ui/phone-input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { LeadTagsInput } from '@/components/pipeline/lead-tags-input'
import { useCreateContact, type ContactRow } from '@/hooks/use-contacts'
import { useUpdateLead } from '@/hooks/use-leads'
import { usePipelines, useDefaultPipeline } from '@/hooks/use-pipelines'
import { useLeadSources } from '@/hooks/use-lead-sources'
import { useTeamMembers } from '@/hooks/use-team'
import { isValidPhoneBR, PHONE_ERROR_MSG } from '@/lib/phone'
import type { CreateLeadInput, UpdateLeadInput, Lead } from '@/types/database'

const NO_OWNER = 'none'

const schema = z.object({
  name: z.string().min(1, 'Nome obrigatorio'),
  // leads.phone e NOT NULL + UNIQUE(company_id, phone): telefone e obrigatorio.
  phone: z
    .string()
    .min(1, 'Telefone obrigatorio')
    .refine(isValidPhoneBR, PHONE_ERROR_MSG),
  email: z.string().email('Email invalido').optional().or(z.literal('')),
  company_name: z.string().optional(),
  source_id: z.string().uuid().optional(),
  assigned_to: z.string().optional(),
  tags: z.array(z.string()),
  observations: z.string().optional(),
  // String livre opcional: nao usar z.string().url() para nao travar quem digita
  // o handle/link sem https.
  instagram_handle: z.string().optional(),
  linkedin_url: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

interface NewContactModalProps {
  open: boolean
  onClose: () => void
  /** Disparado com o contato recem-criado (ex: auto-selecionar no Novo Negocio). */
  onCreated?: (lead: Lead) => void
  /** Quando presente, o modal abre em modo edicao daquele contato. */
  contact?: ContactRow | null
}

const NewContactModal = ({ open, onClose, onCreated, contact }: NewContactModalProps) => {
  const isEdit = !!contact
  const createContact = useCreateContact()
  const updateLead = useUpdateLead()
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
    if (!open) return
    if (contact) {
      // Modo edicao: pre-preenche a partir do contato. Selects nulos caem no
      // mesmo default do create (source manual / "none") para nao quebrar o
      // Select com valor nulo. phone mantem o 55 do banco (PhoneInput exibe
      // mascarado e o updateLead normaliza de novo no submit).
      reset({
        name: contact.name ?? '',
        phone: contact.phone,
        email: contact.email ?? '',
        company_name: contact.company_name ?? '',
        source_id: contact.source_id ?? manualSource?.id,
        assigned_to: contact.assigned_to ?? NO_OWNER,
        tags: contact.tags ?? [],
        observations: contact.observations ?? '',
        instagram_handle: contact.instagram_handle ?? '',
        linkedin_url: contact.linkedin_url ?? '',
      })
    } else {
      reset({
        name: '', phone: '', email: '', company_name: '',
        source_id: manualSource?.id, assigned_to: NO_OWNER, tags: [],
        observations: '', instagram_handle: '', linkedin_url: '',
      })
    }
  }, [open, contact, manualSource?.id, reset])

  const onSubmit = async (values: FormValues) => {
    if (contact) {
      // Modo edicao: atualiza so dados de pessoa. Nao envia pipeline_id nem
      // stage_id (negocio se edita via deals).
      const data: UpdateLeadInput = {
        name: values.name || null,
        phone: values.phone,
        email: values.email || null,
        company_name: values.company_name || null,
        source_id: values.source_id || null,
        assigned_to: values.assigned_to === NO_OWNER ? null : values.assigned_to,
        tags: values.tags,
        observations: values.observations || null,
        instagram_handle: values.instagram_handle || null,
        linkedin_url: values.linkedin_url || null,
      }
      await updateLead.mutateAsync({ leadId: contact.id, data })
      onClose()
      return
    }

    const input: CreateLeadInput = {
      name: values.name,
      phone: values.phone,
      email: values.email || undefined,
      company_name: values.company_name || undefined,
      source_id: values.source_id || undefined,
      assigned_to: values.assigned_to === NO_OWNER ? undefined : values.assigned_to,
      tags: values.tags,
      observations: values.observations || undefined,
      instagram_handle: values.instagram_handle || undefined,
      linkedin_url: values.linkedin_url || undefined,
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

  // noPipeline so bloqueia o create (edit nao cria negocio nem depende de pipeline).
  const noPipeline = !isEdit && !resolvedPipelineId

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar Contato' : 'Novo Contato'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Atualize os dados deste contato.'
              : 'Cadastre uma pessoa. O negocio e criado separadamente.'}
          </DialogDescription>
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
              <Controller
                control={control}
                name="phone"
                render={({ field }) => (
                  <PhoneInput
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    placeholder="(11) 99999-9999"
                  />
                )}
              />
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

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Instagram</Label>
              <Input placeholder="@usuario" {...register('instagram_handle')} />
            </div>
            <div className="space-y-2">
              <Label>LinkedIn</Label>
              <Input placeholder="linkedin.com/in/usuario" {...register('linkedin_url')} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Observacoes</Label>
            <textarea
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 input-clean"
              placeholder="Anotacoes sobre o contato..."
              {...register('observations')}
            />
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
            <Button type="submit" disabled={createContact.isPending || updateLead.isPending || noPipeline}>
              {(createContact.isPending || updateLead.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? 'Salvar' : 'Criar Contato'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export { NewContactModal }
