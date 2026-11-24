import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { EditorField } from '@/components/events/editor/editor-field'
import { FieldOptionsEditor } from '@/components/events/editor/form/field-options-editor'
import { useFieldAnswerCount } from '@/hooks/events/use-field-answer-count'
import {
  CONTACT_DESTINATIONS, hasDestination, hasOptions, hasPlaceholder, isRequiredLocked, TYPE_LABEL, type FieldDraft,
} from '@/lib/events/field-catalog'

export type FieldErrorKey = 'label' | 'help_text' | 'placeholder' | 'options' | 'terms_text' | 'destination_field'

interface FieldDrawerProps {
  eventId: string
  field: FieldDraft | null
  errors: Partial<Record<FieldErrorKey, string>>
  readOnly: boolean
  onChange: (patch: Partial<FieldDraft>) => void
  onClose: () => void
}

const destinationValue = (f: FieldDraft) => (f.destination === 'contact_field' ? f.destination_field ?? '' : 'answer_only')

export const FieldDrawer = ({ eventId, field, errors, readOnly, onChange, onClose }: FieldDrawerProps) => {
  const answers = useFieldAnswerCount(eventId, field?.id ?? null, !!field)
  const isFixed = field?.kind === 'fixed'

  return (
    <Sheet open={!!field} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-md">
        {field && (
          <>
            <div className="space-y-1 border-b p-4 pr-10">
              <SheetTitle>{isFixed ? field.label : TYPE_LABEL[field.type]}</SheetTitle>
              <SheetDescription>
                {isFixed ? 'Campo fixo: o rótulo e a posição não mudam.' : 'As mudanças entram no formulário ao salvar o evento.'}
              </SheetDescription>
            </div>
            <fieldset disabled={readOnly} className="space-y-4 p-4">
              {(answers.data ?? 0) > 0 && (
                <p className="rounded-md bg-accent px-3 py-2 text-xs text-accent-foreground">
                  {answers.data} {answers.data === 1 ? 'inscrição já respondeu' : 'inscrições já responderam'} este campo.
                  As respostas antigas ficam preservadas com o rótulo da época.
                </p>
              )}
              {!isFixed && (
                <>
                  <EditorField label="Rótulo" htmlFor="fd-label" error={errors.label}>
                    <Input id="fd-label" value={field.label} maxLength={120} onChange={(e) => onChange({ label: e.target.value })} />
                  </EditorField>
                  <EditorField label="Texto de ajuda" htmlFor="fd-help" optional error={errors.help_text}>
                    <Input id="fd-help" value={field.help_text} maxLength={300} onChange={(e) => onChange({ help_text: e.target.value })} />
                  </EditorField>
                  {hasPlaceholder(field.type) && (
                    <EditorField label="Placeholder" htmlFor="fd-ph" optional error={errors.placeholder}>
                      <Input id="fd-ph" value={field.placeholder} maxLength={120} onChange={(e) => onChange({ placeholder: e.target.value })} />
                    </EditorField>
                  )}
                </>
              )}
              {!isRequiredLocked(field) && (
                <div className="flex items-center gap-3">
                  <Switch id="fd-required" checked={field.required} onCheckedChange={(v) => onChange({ required: v })} />
                  <Label htmlFor="fd-required">Obrigatório</Label>
                </div>
              )}
              {field.type === 'terms' && (
                <EditorField label="Texto do termo" htmlFor="fd-terms" error={errors.terms_text}
                  hint='O participante precisa marcar "Li e aceito". Sempre obrigatório.'>
                  <Textarea id="fd-terms" rows={6} value={field.terms_text} onChange={(e) => onChange({ terms_text: e.target.value })} />
                </EditorField>
              )}
              {hasOptions(field.type) && (
                <EditorField label="Opções" error={undefined}>
                  <FieldOptionsEditor options={field.options ?? []} error={errors.options}
                    onChange={(options) => onChange({ options })} />
                </EditorField>
              )}
              {hasDestination(field.type) && !isFixed && (
                <EditorField label="Destino da resposta" error={errors.destination_field}
                  hint="Toda resposta também vai para as observações do negócio.">
                  <Select value={destinationValue(field)} onValueChange={(v) => onChange(v === 'answer_only'
                    ? { destination: 'answer_only', destination_field: null }
                    : { destination: 'contact_field', destination_field: v as FieldDraft['destination_field'] })}>
                    <SelectTrigger aria-label="Destino da resposta"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="answer_only">Só resposta</SelectItem>
                      {CONTACT_DESTINATIONS.map((d) => (
                        <SelectItem key={d.value} value={d.value}>Campo do contato: {d.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </EditorField>
              )}
            </fieldset>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
