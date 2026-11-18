import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm, useWatch, type FieldErrors, type Path, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { useSaveEvent } from '@/hooks/events/use-save-event'
import { usePublishEvent } from '@/hooks/events/use-publish-event'
import { useBeforeUnload } from '@/hooks/events/use-before-unload'
import { editorSchema, eventToValues, type EditorValues } from '@/lib/events/editor-form'
import {
  checklistItems, publishMissing, type ChecklistItem, type EditorTab,
} from '@/lib/events/publish-checklist'
import type { Event, EventFormField } from '@/types/events'

const CHECKLIST_NAMES = [
  'title', 'slug', 'format', 'starts_at', 'ends_at', 'venue_name', 'city', 'online_url', 'privacy_policy_url',
] as const

/** Estado do editor: formulario, checklist, salvar/publicar e protecao contra saida. */
export const useEventEditor = (event: Event, fields: EventFormField[]) => {
  const navigate = useNavigate()
  const save = useSaveEvent()
  const publish = usePublishEvent()
  const [tab, setTab] = useState<EditorTab>('overview')
  const [pendingTo, setPendingTo] = useState<string | null>(null)

  const defaults = useMemo(() => eventToValues(event, fields), [event, fields])
  const form = useForm<EditorValues>({
    // O schema infere `type` como string; o formulario usa os tipos do catalogo.
    resolver: zodResolver(editorSchema) as unknown as Resolver<EditorValues>,
    defaultValues: defaults,
  })
  // Dado novo do servidor (depois de salvar ou publicar) vira a nova base do "nao salvo".
  useEffect(() => { form.reset(defaults) }, [defaults, form])

  const isDirty = form.formState.isDirty
  useBeforeUnload(isDirty)

  const [title, slug, format, starts_at, ends_at, venue_name, city, online_url, privacy_policy_url] =
    useWatch({ control: form.control, name: CHECKLIST_NAMES })
  const items = checklistItems(format)
  const missing = publishMissing({
    title, slug, format, starts_at, ends_at, venue_name, city, online_url, privacy_policy_url,
    pipeline_id: event.pipeline_id, entry_stage_id: event.entry_stage_id,
  })

  const goTo = (item: ChecklistItem) => {
    setTab(item.tab)
    if (item.focus) setTimeout(() => form.setFocus(item.focus as Path<EditorValues>), 60)
  }

  const onInvalid = (errors: FieldErrors<EditorValues>) => {
    toast.error('Corrija os campos destacados antes de salvar.')
    setTab(Object.keys(errors).some((k) => k !== 'fields') ? 'overview' : 'form')
  }

  const persist = (values: EditorValues) =>
    save.mutateAsync({ values, original: event, savedFieldIds: fields.map((f) => f.id) })

  const onSave = form.handleSubmit(async (values) => {
    try {
      await persist(values)
      toast.success('Alterações salvas.')
    } catch { /* toast no hook */ }
  }, onInvalid)

  const onPublish = form.handleSubmit(async (values) => {
    if (missing.length > 0) {
      toast.error('Ainda falta preencher o que está marcado em "Pronto para publicar".')
      goTo(items.find((i) => missing.includes(i.key)) ?? items[0])
      return
    }
    try {
      if (form.formState.isDirty) await persist(values)
      await publish.mutateAsync({ id: event.id, action: 'publish' })
    } catch { /* toast no hook */ }
  }, onInvalid)

  const onUnpublish = () => publish.mutate({ id: event.id, action: 'unpublish' })

  const requestNavigate = (to: string) => (isDirty ? setPendingTo(to) : navigate(to))
  const confirmLeave = () => {
    const to = pendingTo
    setPendingTo(null)
    form.reset(defaults)
    if (to) navigate(to)
  }

  return {
    form, tab, setTab, isDirty, title, items, missing, goTo,
    onSave, onPublish, onUnpublish, saving: save.isPending, publishing: publish.isPending,
    leave: { open: pendingTo !== null, request: requestNavigate, confirm: confirmLeave, cancel: () => setPendingTo(null) },
  }
}
