import type { ReactNode } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { FieldDraft } from '@/lib/events/field-catalog'

// Controle de cada tipo como aparece no formulario, so para o preview (nao interativo).

const Box = ({ round, checked }: { round?: boolean; checked?: boolean }) => (
  <span className={cn('h-4 w-4 shrink-0 border border-input bg-background', round ? 'rounded-full' : 'rounded-sm',
    checked && 'border-primary bg-primary')} />
)

const Choices = ({ field }: { field: FieldDraft }) => (
  <div className="space-y-2">
    {(field.options ?? []).map((o) => (
      <div key={o.id} className="flex items-center gap-2 text-sm">
        <Box round={field.type === 'radio'} />
        <span className={cn(!o.label && 'italic text-muted-foreground')}>{o.label || 'Opção sem nome'}</span>
      </div>
    ))}
  </div>
)

const control = (field: FieldDraft): ReactNode => {
  const ph = field.placeholder || undefined
  switch (field.type) {
    case 'paragraph': return <Textarea rows={3} placeholder={ph} />
    case 'select': return (
      <div className="flex h-10 items-center rounded-md border border-input bg-background px-3 text-sm text-muted-foreground">
        {ph ?? 'Selecione'}
      </div>
    )
    case 'radio':
    case 'checkbox': return <Choices field={field} />
    case 'city_state': return (
      <div className="grid grid-cols-[1fr_80px] gap-2"><Input placeholder="Cidade" /><Input placeholder="UF" /></div>
    )
    case 'address': return (
      <div className="grid grid-cols-3 gap-2">
        <Input placeholder="CEP" /><Input placeholder="Rua" className="col-span-2" />
        <Input placeholder="Número" /><Input placeholder="Bairro" className="col-span-2" />
      </div>
    )
    case 'datetime': return <Input type="datetime-local" />
    case 'terms': return (
      <div className="space-y-2">
        <p className="max-h-28 overflow-y-auto whitespace-pre-line rounded-md border bg-background p-3 text-xs text-muted-foreground">
          {field.terms_text || 'Texto do termo de responsabilidade.'}
        </p>
        <div className="flex items-center gap-2 text-sm"><Box /> Li e aceito</div>
      </div>
    )
    case 'phone': return <Input placeholder={ph ?? '(00) 00000-0000'} />
    case 'document': return <Input placeholder={ph ?? 'CPF ou CNPJ'} />
    default: return <Input placeholder={ph} />
  }
}

interface FieldInputPreviewProps {
  field: FieldDraft
}

export const FieldInputPreview = ({ field }: FieldInputPreviewProps) => (
  // inert: os controles do preview nao recebem foco nem clique (React 18 nao tipa o atributo).
  <div className="space-y-1.5 select-none" ref={(el) => el?.setAttribute('inert', '')}>
    <p className="text-sm font-medium">
      {field.label || 'Sem rótulo'}
      {(field.required || field.type === 'terms') && <span className="text-destructive"> *</span>}
    </p>
    {control(field)}
    {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
  </div>
)
