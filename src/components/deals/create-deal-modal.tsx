import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
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
import { useCreateDeal } from '@/hooks/use-deals'
import { usePipelines } from '@/hooks/use-pipelines'
import { usePipelineStages } from '@/hooks/use-pipeline-stages'

const schema = z.object({
  name: z.string().min(1, 'Nome do negocio e obrigatorio'),
  pipeline_id: z.string().uuid('Selecione um pipeline'),
  value: z.number().nonnegative().optional().or(z.nan().transform(() => undefined)),
})

type FormValues = z.infer<typeof schema>

interface CreateDealModalProps {
  open: boolean
  onClose: () => void
  leadId: string
  leadName?: string
  defaultPipelineId?: string
}

const CreateDealModal = ({ open, onClose, leadId, leadName, defaultPipelineId }: CreateDealModalProps) => {
  const createDeal = useCreateDeal()
  const { data: pipelines } = usePipelines()

  const initialPipelineId = defaultPipelineId ?? pipelines?.[0]?.id ?? ''

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: leadName ? `Negocio - ${leadName}` : 'Negocio',
      pipeline_id: initialPipelineId,
      value: undefined,
    },
  })

  const selectedPipelineId = watch('pipeline_id')
  const { data: stages } = usePipelineStages(selectedPipelineId)

  useEffect(() => {
    if (open) {
      reset({
        name: leadName ? `Negocio - ${leadName}` : 'Negocio',
        pipeline_id: initialPipelineId,
        value: undefined,
      })
    }
  }, [open, leadName, initialPipelineId, reset])

  const onSubmit = (data: FormValues) => {
    const firstStageId = stages?.[0]?.id
    createDeal.mutate(
      {
        lead_id: leadId,
        name: data.name,
        pipeline_id: data.pipeline_id,
        stage_id: firstStageId,
        value: data.value,
      },
      {
        onSuccess: () => {
          onClose()
          reset()
        },
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo negocio</DialogTitle>
          <DialogDescription>
            Criar negocio para {leadName || 'este contato'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="deal-name">Nome do negocio *</Label>
            <Input
              id="deal-name"
              placeholder="Ex: Orcamento de treinamento, Brindes fim de ano..."
              {...register('name')}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-2">
            <Label>Pipeline *</Label>
            <Select
              value={selectedPipelineId}
              onValueChange={(v) => setValue('pipeline_id', v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {pipelines?.filter((p) => p.is_active).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
                      {p.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.pipeline_id && <p className="text-xs text-destructive">{errors.pipeline_id.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="deal-value">Valor estimado</Label>
            <Input
              id="deal-value"
              type="number"
              min={0}
              step={0.01}
              placeholder="R$ 0,00"
              {...register('value', { valueAsNumber: true })}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={createDeal.isPending}>
              {createDeal.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Criar negocio
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export { CreateDealModal }
