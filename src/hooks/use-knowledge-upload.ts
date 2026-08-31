import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth.store'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

interface UploadState {
  isUploading: boolean
  isProcessing: boolean
  progress: 'idle' | 'uploading' | 'processing' | 'done' | 'error'
  error: string | null
}

export const useKnowledgeUpload = (agentProfileId: string | undefined) => {
  const companyId = useAuthStore((s) => s.company?.id)
  const queryClient = useQueryClient()
  const [state, setState] = useState<UploadState>({
    isUploading: false,
    isProcessing: false,
    progress: 'idle',
    error: null,
  })

  const upload = useCallback(async (file: File) => {
    if (!companyId || !agentProfileId) {
      toast.error('Dados insuficientes para upload')
      return
    }

    setState({ isUploading: true, isProcessing: false, progress: 'uploading', error: null })

    try {
      const safeName = sanitizeFileName(file.name)

      // 1. Upload para Storage (nome sanitizado, original no metadata)
      const path = `${companyId}/${agentProfileId}/${safeName}`
      const { error: uploadError } = await supabase.storage
        .from('agent-knowledge')
        .upload(path, file, {
          upsert: true,
          metadata: { originalName: file.name },
        })

      if (uploadError) throw new Error(`Upload falhou: ${uploadError.message}`)

      // 2. Disparar processamento. A Edge Function baixa pelo path (dentro do
      // bucket agent-knowledge), entao nao ha signed URL nem URL externa.
      setState((s) => ({ ...s, isUploading: false, isProcessing: true, progress: 'processing' }))

      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token

      const response = await fetch(`${SUPABASE_URL}/functions/v1/sdr-knowledge-ingest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          agentProfileId,
          fileName: safeName,
          filePath: path,
          fileMimeType: file.type,
        }),
      })

      const result = await response.json()

      if (!result.ok) {
        throw new Error(result.error ?? 'Processamento falhou')
      }

      setState({ isUploading: false, isProcessing: false, progress: 'done', error: null })
      queryClient.invalidateQueries({ queryKey: ['knowledge-files', agentProfileId] })
      queryClient.invalidateQueries({ queryKey: ['agent-profile'] })
      toast.success(`${result.chunksCreated} trechos processados de "${file.name}"`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido'
      setState({ isUploading: false, isProcessing: false, progress: 'error', error: message })
      toast.error(message)
    }
  }, [companyId, agentProfileId, queryClient])

  const reset = useCallback(() => {
    setState({ isUploading: false, isProcessing: false, progress: 'idle', error: null })
  }, [])

  return { ...state, upload, reset }
}

function sanitizeFileName(name: string): string {
  const dotIdx = name.lastIndexOf('.')
  const ext = dotIdx >= 0 ? name.slice(dotIdx) : ''
  const base = dotIdx >= 0 ? name.slice(0, dotIdx) : name

  const sanitized = base
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/\s+/g, '_')           // espacos -> _
    .replace(/[^a-zA-Z0-9._-]/g, '') // remove caracteres nao-alfanumericos

  return (sanitized || 'documento') + ext.toLowerCase()
}
