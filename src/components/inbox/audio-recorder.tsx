import { useState, useRef, useEffect, useCallback } from 'react'
import { Mic, X, Send, Loader2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useSendMessage } from '@/hooks/use-messages'
import { useAuthStore } from '@/stores/auth.store'
import { supabase } from '@/lib/supabase'

interface AudioRecorderProps {
  /** Inbox: sobe a gravação na pasta do lead e envia como mensagem. */
  leadId?: string
  onRecordingChange: (recording: boolean) => void
  /** Destino alternativo da gravação (ex.: anexo de campanha). Substitui o envio ao lead. */
  onSend?: (file: File) => Promise<void>
}

const MAX_DURATION = 5 * 60 // 5 minutos
const WARNING_THRESHOLD = 4 * 60 + 30 // 4:30

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const AudioRecorder = ({ leadId, onRecordingChange, onSend }: AudioRecorderProps) => {
  const [isRecording, setIsRecording] = useState(false)
  const [duration, setDuration] = useState(0)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined)
  const streamRef = useRef<MediaStream | null>(null)

  const sendMessage = useSendMessage()
  const companyId = useAuthStore((s) => s.company?.id)

  const cleanup = useCallback(() => {
    clearInterval(timerRef.current)
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    mediaRecorderRef.current = null
    chunksRef.current = []
  }, [])

  useEffect(() => {
    return () => {
      cleanup()
      if (audioUrl) URL.revokeObjectURL(audioUrl)
    }
  }, [cleanup, audioUrl])

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      mediaRecorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        setAudioBlob(blob)
        setAudioUrl(URL.createObjectURL(blob))
        streamRef.current?.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }

      recorder.start(250)
      setIsRecording(true)
      setDuration(0)
      setAudioBlob(null)
      setAudioUrl(null)
      onRecordingChange(true)

      timerRef.current = setInterval(() => {
        setDuration((d) => {
          const next = d + 1
          if (next === WARNING_THRESHOLD) {
            toast.warning('30 segundos restantes')
          }
          if (next >= MAX_DURATION) {
            mediaRecorderRef.current?.stop()
            clearInterval(timerRef.current)
            setIsRecording(false)
          }
          return next
        })
      }, 1000)
    } catch {
      toast.error('Permissao de microfone negada')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
    clearInterval(timerRef.current)
    setIsRecording(false)
  }

  const cancelRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
    cleanup()
    setIsRecording(false)
    setDuration(0)
    setAudioBlob(null)
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl)
      setAudioUrl(null)
    }
    onRecordingChange(false)
  }

  const sendToLead = async (blob: Blob) => {
    if (!companyId || !leadId) throw new Error('Conversa indisponivel')
    const path = `${companyId}/${leadId}/audio-${Date.now()}.webm`
    const { error: uploadError } = await supabase.storage
      .from('chat-attachments')
      .upload(path, blob)
    if (uploadError) throw uploadError

    const { data: { publicUrl } } = supabase.storage
      .from('chat-attachments')
      .getPublicUrl(path)

    await sendMessage.mutateAsync({
      leadId,
      content: '',
      messageType: 'audio',
      fileUrl: publicUrl,
      fileName: `audio-${Date.now()}.webm`,
      mimeType: 'audio/webm',
    })
  }

  const handleSend = async () => {
    if (!audioBlob) return

    setUploading(true)
    try {
      if (onSend) await onSend(new File([audioBlob], `audio-${Date.now()}.webm`, { type: 'audio/webm' }))
      else await sendToLead(audioBlob)

      setAudioBlob(null)
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl)
        setAudioUrl(null)
      }
      setDuration(0)
      onRecordingChange(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao enviar audio'
      toast.error(msg)
    } finally {
      setUploading(false)
    }
  }

  // Estado inicial: apenas botao de mic
  if (!isRecording && !audioBlob) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-foreground"
        onClick={startRecording}
        title="Gravar audio"
      >
        <Mic className="h-4 w-4" />
      </Button>
    )
  }

  // Gravando ou preview
  return (
    <div className="flex flex-1 items-center gap-2">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-destructive hover:text-destructive"
        onClick={cancelRecording}
        title="Cancelar"
      >
        <X className="h-4 w-4" />
      </Button>

      {isRecording ? (
        <>
          <div className="flex items-center gap-2 flex-1">
            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            <span className={cn(
              'text-sm font-mono tabular-nums',
              duration >= WARNING_THRESHOLD && 'text-destructive'
            )}>
              {formatTime(duration)}
            </span>
            {duration >= WARNING_THRESHOLD && (
              <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
            )}
          </div>
          <Button
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={stopRecording}
            title="Parar e pre-visualizar"
          >
            <Send className="h-4 w-4" />
          </Button>
        </>
      ) : audioBlob && audioUrl ? (
        <>
          <div className="flex-1">
            <audio controls src={audioUrl} className="h-8 w-full" />
          </div>
          <span className="text-xs text-muted-foreground tabular-nums">{formatTime(duration)}</span>
          <Button
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={handleSend}
            disabled={uploading}
            title="Enviar audio"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </>
      ) : null}
    </div>
  )
}

export { AudioRecorder }
