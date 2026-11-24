import { useState } from 'react'
import { useFormContext, useWatch, type FieldError } from 'react-hook-form'
import { FieldPalette } from '@/components/events/editor/form/field-palette'
import { FormPreview } from '@/components/events/editor/form/form-preview'
import { FieldDrawer, type FieldErrorKey } from '@/components/events/editor/form/field-drawer'
import { DeleteFieldDialog } from '@/components/events/editor/form/delete-field-dialog'
import { MAX_FIELDS, newFieldDraft, type CatalogEntry, type FieldDraft } from '@/lib/events/field-catalog'
import type { EditorValues } from '@/lib/events/editor-form'

interface FormTabProps {
  eventId: string
  companyName: string
  readOnly: boolean
}

type FieldErrors = Partial<Record<FieldErrorKey, FieldError>> | undefined
const ERROR_KEYS: FieldErrorKey[] = ['label', 'help_text', 'placeholder', 'options', 'terms_text', 'destination_field']

// Erro numa opcao vem como array em `options` (sem message no topo).
const messages = (e: FieldErrors): Partial<Record<FieldErrorKey, string>> =>
  Object.fromEntries(ERROR_KEYS.flatMap((k) => {
    const err = e?.[k]
    if (!err) return []
    return [[k, err.message ?? (k === 'options' ? 'Preencha todas as opções' : 'Campo inválido')]]
  }))

/** Aba 2: chips a esquerda, preview no meio, drawer de edicao a direita. */
export const FormTab = ({ eventId, companyName, readOnly }: FormTabProps) => {
  const { control, setValue, formState } = useFormContext<EditorValues>()
  const fields = useWatch({ control, name: 'fields' })
  const organizer = useWatch({ control, name: 'organizer_name' })
  const privacyUrl = useWatch({ control, name: 'privacy_policy_url' })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const fixed = fields.filter((f) => f.kind === 'fixed')
  const others = fields.filter((f) => f.kind !== 'fixed')
  const fieldErrors = (formState.errors.fields ?? []) as FieldErrors[]
  const errorIds = new Set(fields.flatMap((f, i) => (fieldErrors[i] ? [f.id] : [])))
  const editingIndex = fields.findIndex((f) => f.id === editingId)

  // Fixos sempre no topo: a posicao no banco vem da ordem deste array.
  const commit = (nextOthers: FieldDraft[], nextFixed = fixed) =>
    setValue('fields', [...nextFixed, ...nextOthers], { shouldDirty: true, shouldValidate: formState.isSubmitted })

  const add = (entry: CatalogEntry) => {
    if (fields.length >= MAX_FIELDS) return
    const draft = newFieldDraft(entry)
    commit([...others, draft])
    setEditingId(draft.id)
  }

  const patch = (id: string, p: Partial<FieldDraft>) => {
    const apply = (f: FieldDraft) => (f.id === id ? { ...f, ...p } : f)
    commit(others.map(apply), fixed.map(apply))
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
      <div className="lg:sticky lg:top-4 lg:self-start">
        <FieldPalette fields={fields} onAdd={add} />
      </div>
      <FormPreview
        fixed={fixed}
        others={others}
        errorIds={errorIds}
        readOnly={readOnly}
        organizer={organizer.trim() || companyName}
        privacyUrl={privacyUrl}
        onReorder={(next) => commit(next)}
        onEdit={setEditingId}
        onDelete={setDeletingId}
      />
      <FieldDrawer
        eventId={eventId}
        field={editingIndex >= 0 ? fields[editingIndex] : null}
        errors={messages(fieldErrors[editingIndex])}
        readOnly={readOnly}
        onChange={(p) => editingId && patch(editingId, p)}
        onClose={() => setEditingId(null)}
      />
      <DeleteFieldDialog
        eventId={eventId}
        field={fields.find((f) => f.id === deletingId) ?? null}
        onConfirm={() => { commit(others.filter((f) => f.id !== deletingId)); setDeletingId(null) }}
        onCancel={() => setDeletingId(null)}
      />
    </div>
  )
}
