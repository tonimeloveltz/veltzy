import { useFormContext, useWatch } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { EditorSection } from '@/components/events/editor/editor-section'
import type { EditorValues } from '@/lib/events/editor-form'

const PRIORITY_LABEL = { low: 'Baixa', medium: 'Média', high: 'Alta' } as const

/** Leitura das regras definidas nas opcoes dos campos (aba 2). */
export const QualificationRules = ({ onOpenForm }: { onOpenForm: () => void }) => {
  const { control } = useFormContext<EditorValues>()
  const fields = useWatch({ control, name: 'fields' })
  const rules = fields.flatMap((f) => (f.options ?? [])
    .filter((o) => o.tag || o.priority)
    .map((o) => ({ id: `${f.id}:${o.id}`, field: f.label, option: o.label, tag: o.tag, priority: o.priority })))

  return (
    <EditorSection title="Regras de qualificação" description="Definidas nas opções das perguntas, na aba Formulário.">
      {rules.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma opção aplica tag ou prioridade ainda.</p>
      ) : (
        <ul className="divide-y rounded-md border text-sm">
          {rules.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2">
              <span className="text-muted-foreground">{r.field}:</span>
              <span className="font-medium">{r.option}</span>
              <span className="text-muted-foreground">aplica</span>
              {r.tag && <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">{r.tag}</span>}
              {r.priority && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">Prioridade {PRIORITY_LABEL[r.priority]}</span>}
            </li>
          ))}
        </ul>
      )}
      <Button type="button" variant="link" className="h-auto p-0" onClick={onOpenForm}>Editar no formulário</Button>
    </EditorSection>
  )
}
