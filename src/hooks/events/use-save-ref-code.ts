import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth.store'
import { createRefCode, deleteRefCode } from '@/services/event-ref-codes.service'

type Vars = { kind: 'create'; label: string; code: string } | { kind: 'delete'; id: string }

/** Criar ou excluir codigo de divulgador. Inscricoes ja feitas guardam o codigo como texto. */
export const useSaveRefCode = (eventId: string) => {
  const companyId = useAuthStore((s) => s.company?.id)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: Vars) => {
      if (!companyId) throw new Error('Empresa não carregada')
      return v.kind === 'create' ? createRefCode(companyId, eventId, v.label, v.code) : deleteRefCode(companyId, v.id)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['event-ref-codes', eventId] }),
    onError: (err: Error) => toast.error(err.message.includes('event_ref_codes_unique')
      ? 'Este código já existe neste evento.' : 'Não foi possível salvar o código.'),
  })
}
