import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { PhoneInput } from '@/components/ui/phone-input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { FormFieldSpec } from '@/lib/events/registration-form'
import { formatCep } from '@/lib/events/cep'
import { formatDocumentBR } from '@/lib/events/document-br'
import { fetchViaCep } from '@/services/viacep.service'
import { UfSelect } from '@/components/events/public/uf-select'

type Rec = Record<string, string>

interface RegistrationFieldInputProps {
  field: FormFieldSpec
  value: unknown
  invalid: boolean
  onChange: (value: unknown) => void
}

const ADDRESS: Array<{ key: string; label: string; span: string }> = [
  { key: 'cep', label: 'CEP', span: 'col-span-2' }, { key: 'street', label: 'Rua', span: 'col-span-4' },
  { key: 'number', label: 'Número', span: 'col-span-2' }, { key: 'complement', label: 'Complemento', span: 'col-span-4' },
  { key: 'district', label: 'Bairro', span: 'col-span-3' }, { key: 'city', label: 'Cidade', span: 'col-span-3' },
]

const CLEARED_ON_UNKNOWN_CEP = ['street', 'number', 'complement', 'district', 'city', 'state'] as const
const digitsOf = (v: string) => v.replace(/\D/g, '')

/**
 * ViaCEP so preenche o que esta vazio; CEP alterado e inexistente apaga o endereco;
 * erro de rede e silencioso. cepOnFocus: valor do CEP no foco, para saber se mudou.
 */
const fillFromCep = async (rec: Rec, cepOnFocus: string, onChange: (v: unknown) => void) => {
  const digits = digitsOf(rec.cep ?? '')
  if (digits.length !== 8) return
  let addr: Awaited<ReturnType<typeof fetchViaCep>>
  try {
    addr = await fetchViaCep(digits)
  } catch {
    return
  }
  if (!addr) {
    if (digits === digitsOf(cepOnFocus)) return
    const next = { ...rec }
    for (const k of CLEARED_ON_UNKNOWN_CEP) next[k] = ''
    onChange(next)
    return
  }
  const next = { ...rec }
  for (const k of ['street', 'district', 'city', 'state'] as const) if (!next[k]?.trim() && addr[k]) next[k] = addr[k]
  onChange(next)
}

/** Controle de um campo nao fixo, por tipo. O valor tem o formato que o form-validate do servidor espera. */
export const RegistrationFieldInput = ({ field, value, invalid, onChange }: RegistrationFieldInputProps) => {
  const id = `f-${field.id}`
  const ph = field.placeholder ?? undefined
  const ring = invalid ? 'border-destructive' : undefined
  const str = typeof value === 'string' ? value : ''
  const rec = (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as Rec
  const list = Array.isArray(value) ? (value as string[]) : []

  switch (field.type) {
    case 'paragraph':
      return <Textarea id={id} rows={4} maxLength={2000} placeholder={ph} className={ring} value={str} onChange={(e) => onChange(e.target.value)} />
    case 'phone':
      return <PhoneInput id={id} placeholder={ph ?? '(00) 00000-0000'} className={ring} value={str} onChange={onChange} />
    case 'document':
      return <Input id={id} inputMode="numeric" placeholder={ph ?? 'CPF ou CNPJ'} className={ring} value={str}
        onChange={(e) => onChange(formatDocumentBR(e.target.value))} />
    case 'email':
      return <Input id={id} type="email" placeholder={ph} className={ring} value={str} onChange={(e) => onChange(e.target.value)} />
    case 'datetime':
      return <Input id={id} type="datetime-local" className={ring} value={str} onChange={(e) => onChange(e.target.value)} />
    case 'select':
      return (
        <select id={id} className={cn('flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm', ring)}
          value={str} onChange={(e) => onChange(e.target.value || undefined)}>
          <option value="">{ph ?? 'Selecione'}</option>
          {(field.options ?? []).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      )
    case 'radio':
    case 'checkbox':
      return (
        <div role={field.type === 'radio' ? 'radiogroup' : 'group'} aria-labelledby={`${id}-label`} className="space-y-2">
          {(field.options ?? []).map((o) => {
            const checked = field.type === 'radio' ? str === o.id : list.includes(o.id)
            const toggle = () => onChange(field.type === 'radio' ? o.id
              : checked ? list.filter((x) => x !== o.id) : [...list, o.id])
            return (
              <label key={o.id} className="flex cursor-pointer items-center gap-2 text-sm">
                {field.type === 'radio' ? (
                  <input type="radio" name={id} checked={checked} onChange={toggle} className="h-4 w-4 accent-current" />
                ) : <Checkbox checked={checked} onCheckedChange={toggle} />}
                {o.label}
              </label>
            )
          })}
        </div>
      )
    case 'city_state':
      return (
        <div className="grid grid-cols-[1fr_80px] gap-2">
          <Input aria-label="Cidade" placeholder="Cidade" className={ring} value={rec.city ?? ''} onChange={(e) => onChange({ ...rec, city: e.target.value })} />
          <UfSelect value={rec.state ?? ''} invalid={invalid} onChange={(uf) => onChange({ ...rec, state: uf })} />
        </div>
      )
    case 'address':
      return (
        <div className="grid grid-cols-6 gap-2">
          {ADDRESS.map((p) => (
            <Input key={p.key} aria-label={p.label} placeholder={p.label} className={cn(p.span, ring)} value={rec[p.key] ?? ''}
              maxLength={p.key === 'cep' ? 9 : 120} inputMode={p.key === 'cep' ? 'numeric' : undefined}
              onChange={(e) => onChange({ ...rec, [p.key]: p.key === 'cep' ? formatCep(e.target.value) : e.target.value })}
              onFocus={p.key === 'cep' ? (e) => { e.currentTarget.dataset.cepOnFocus = e.currentTarget.value } : undefined}
              onBlur={p.key === 'cep' ? (e) => fillFromCep(rec, e.currentTarget.dataset.cepOnFocus ?? '', onChange) : undefined} />
          ))}
          <UfSelect className="col-span-6 sm:col-span-2" value={rec.state ?? ''} invalid={invalid}
            onChange={(uf) => onChange({ ...rec, state: uf })} />
        </div>
      )
    case 'terms':
      return (
        <div className="space-y-2">
          <p className="max-h-32 overflow-y-auto whitespace-pre-line rounded-md border bg-muted/40 p-3 text-xs">{field.config?.text}</p>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox checked={value === true} onCheckedChange={(c) => onChange(c === true ? true : undefined)} /> Li e aceito
          </label>
        </div>
      )
    default:
      return <Input id={id} maxLength={255} placeholder={ph} className={ring} value={str} onChange={(e) => onChange(e.target.value)} />
  }
}
