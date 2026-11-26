import { Controller, useFormContext, useWatch } from 'react-hook-form'
import { Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { EditorField } from '@/components/events/editor/editor-field'
import { EditorSection } from '@/components/events/editor/editor-section'
import { useViaCep } from '@/hooks/events/use-viacep'
import { formatCep } from '@/lib/events/cep'
import { FORMAT_LABEL } from '@/lib/events/event-list'
import { cn } from '@/lib/utils'
import type { EditorValues } from '@/lib/events/editor-form'
import type { EventFormat } from '@/types/events'

const FORMATS: EventFormat[] = ['presencial', 'online', 'hibrido']
type AddressKey = 'street' | 'district' | 'city' | 'state'
const CLEARED_ON_UNKNOWN_CEP = ['street', 'number', 'complement', 'district', 'city', 'state'] as const

export const LocationSection = () => {
  const { register, control, getValues, setValue, formState: { errors } } = useFormContext<EditorValues>()
  const format = useWatch({ control, name: 'format' })
  const viaCep = useViaCep()

  // ViaCEP so preenche campo vazio; CEP alterado e inexistente apaga o endereco;
  // erro de rede e silencioso (SPEC aba 1).
  // cepOnFocus: valor do campo no foco, para so apagar se o CEP mudou de fato.
  const lookupCep = async (cep: string, cepOnFocus: string) => {
    const digits = cep.replace(/\D/g, '')
    if (digits.length !== 8) return
    const changed = digits !== cepOnFocus.replace(/\D/g, '')
    const result = await viaCep.mutateAsync(cep)
    if (result.status === 'not_found') {
      if (!changed) return
      for (const key of CLEARED_ON_UNKNOWN_CEP) {
        if (getValues(key) !== '') setValue(key, '', { shouldDirty: true })
      }
      return
    }
    if (result.status !== 'found') return
    const addr = result.address
    for (const key of ['street', 'district', 'city', 'state'] as AddressKey[]) {
      if (getValues(key).trim() === '' && addr[key]) setValue(key, addr[key], { shouldDirty: true })
    }
  }

  const cepField = register('cep', {
    onBlur: (e: React.FocusEvent<HTMLInputElement>) => lookupCep(e.target.value, e.target.dataset.cepOnFocus ?? ''),
  })

  return (
    <EditorSection title="Formato e local">
      <Controller
        control={control}
        name="format"
        render={({ field }) => (
          <div role="radiogroup" aria-label="Formato" className="grid grid-cols-3 gap-2">
            {FORMATS.map((f) => (
              <button key={f} type="button" role="radio" aria-checked={field.value === f}
                onClick={() => field.onChange(f)}
                className={cn('rounded-md border px-3 py-2 text-sm transition-smooth',
                  field.value === f ? 'border-primary bg-primary/10 font-medium text-primary' : 'hover:bg-muted')}>
                {FORMAT_LABEL[f]}
              </button>
            ))}
          </div>
        )}
      />

      {format !== 'online' && (
        <div className="grid gap-4 sm:grid-cols-6">
          <EditorField label="Nome do local" htmlFor="venue_name" className="sm:col-span-6">
            <Input id="venue_name" placeholder="Ex.: Auditório Central" {...register('venue_name')} />
          </EditorField>
          <EditorField label="CEP" htmlFor="cep" optional error={errors.cep?.message} className="sm:col-span-2">
            <div className="relative">
              <Input id="cep" inputMode="numeric" maxLength={9} placeholder="00000-000"
                onFocus={(e) => { e.currentTarget.dataset.cepOnFocus = e.currentTarget.value }}
                {...cepField}
                onChange={(e) => { e.target.value = formatCep(e.target.value); return cepField.onChange(e) }} />
              {viaCep.isPending && <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
          </EditorField>
          <EditorField label="Rua" htmlFor="street" className="sm:col-span-4">
            <Input id="street" {...register('street')} />
          </EditorField>
          <EditorField label="Número" htmlFor="number" className="sm:col-span-2">
            <Input id="number" {...register('number')} />
          </EditorField>
          <EditorField label="Complemento" htmlFor="complement" optional className="sm:col-span-4">
            <Input id="complement" {...register('complement')} />
          </EditorField>
          <EditorField label="Bairro" htmlFor="district" className="sm:col-span-2">
            <Input id="district" {...register('district')} />
          </EditorField>
          <EditorField label="Cidade" htmlFor="city" className="sm:col-span-3">
            <Input id="city" {...register('city')} />
          </EditorField>
          <EditorField label="UF" htmlFor="state" error={errors.state?.message} className="sm:col-span-1">
            <Input id="state" maxLength={2} className="uppercase" {...register('state')} />
          </EditorField>
        </div>
      )}

      {format !== 'presencial' && (
        <EditorField label="Link da transmissão" htmlFor="online_url" error={errors.online_url?.message}
          hint="Enviado só para inscritos, na página da inscrição e nas mensagens. Não aparece na página pública.">
          <Input id="online_url" type="url" placeholder="https://" {...register('online_url')} />
        </EditorField>
      )}
    </EditorSection>
  )
}
