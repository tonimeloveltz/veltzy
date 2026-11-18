import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth.store'
import { eventTagName, updateEvent } from '@/services/events.service'
import { saveEventFields } from '@/services/event-form-fields.service'
import { draftsToRows, valuesToEventPatch, type EditorValues } from '@/lib/events/editor-form'
import type { Event } from '@/types/events'

interface SaveInput {
  values: EditorValues
  original: Event
  savedFieldIds: string[]
}

const friendlyError = (err: unknown): string => {
  const msg = err instanceof Error ? err.message : ''
  if (msg.includes('events_slug_unique')) return 'Este link já está em uso por outro evento.'
  if (msg.includes('30 campos')) return 'O formulário passa de 30 campos.'
  return 'Não foi possível salvar o evento.'
}

/** Grava o evento e o formulario de inscricao em lote. */
export const useSaveEvent = () => {
  const companyId = useAuthStore((s) => s.company?.id)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ values, original, savedFieldIds }: SaveInput) => {
      if (!companyId) throw new Error('Empresa não carregada')
      await updateEvent(companyId, original.id, valuesToEventPatch(values, original, eventTagName))
      const current = new Set(values.fields.map((f) => f.id))
      const removed = savedFieldIds.filter((id) => !current.has(id))
      await saveEventFields(companyId, original.id, draftsToRows(values.fields, companyId, original.id), removed)
      return original.id
    },
    onSuccess: async (id) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['event', id] }),
        qc.invalidateQueries({ queryKey: ['event-fields', id] }),
      ])
      qc.invalidateQueries({ queryKey: ['events', companyId] })
    },
    onError: (err) => toast.error(friendlyError(err)),
  })
}
