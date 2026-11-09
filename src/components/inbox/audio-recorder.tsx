import { useState } from 'react'
import { Mic, X, Send, Square, Loader2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useSendMessage } from '@/hooks/use-messages'
import { useVoiceRecorder, VOICE_EXTENSION, VOICE_MIME_TYPE, WARNING_THRESHOLD } from '@/hooks/use-voice-recorder'
import { useAuthStore } from '@/stores/auth.store'
import { supabase } from '@/lib/supabase'

interface AudioRecorderProps {
  /** Inbox: sobe a gravação na pasta do lead e envia como mensagem. */
  leadId?: string
  onRecordingChange: (recording: boolean) => void
  /** Destino alternativo da gravação (ex.: anexo de campanha). Substitui o envio ao lead. */
  onSend?: (file: File) => Promise<void>
}

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const AudioRecorder = ({ leadId, onRecordingChange, onSend }: AudioRecorderProps) => {
  const { isRecording, isFinishing, duration, audioBlob, audioUrl, start, stop, reset } = useVoiceRecorder()
  const [uploading, setUploading] = useState(false)

  const sendMessage = useSendMessage()
  const companyId = useAuthStore((s) => s.company?.id)

  const startRecording = async () => {
    if (await start()) onRecordingChange(true)
  }

  const cancelRecording = () => {
    reset()
    onRecordingChange(false)
  }

  const sendToLead = async (blob: Blob, fileName: string) => {
    if (!companyId || !leadId) throw new Error('Conversa indisponível')
    const path = `${companyId}/${leadId}/${fileName}`
    const { error: uploadError } = await supabase.storage
      .from('chat-attachments')
      .upload(path, blob, { contentType: VOICE_MIME_TYPE })
    if (uploadError) throw uploadError

    const { data: { publicUrl } } = supabase.storage
      .from('chat-attachments')
      .getPublicUrl(path)

    await sendMessage.mutateAsync({
      leadId,
      content: '',
      messageType: 'audio',
      fileUrl: publicUrl,
      fileName,
      mimeType: VOICE_MIME_TYPE,
    })
  }

  const handleSend = async () => {
    if (!audioBlob) return

    setUploading(true)
    try {
      const fileName = `audio-${Date.now()}.${VOICE_EXTENSION}`
      if (onSend) await onSend(new File([audioBlob], fileName, { type: VOICE_MIME_TYPE }))
      else await sendToLead(audioBlob, fileName)

      reset()
      onRecordingChange(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao enviar áudio'
      toast.error(msg)
    } finally {
      setUploading(false)
    }
  }

  // Estado inicial: apenas botao de mic
  if (!isRecording && !isFinishing && !audioBlob) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-foreground"
        onClick={startRecording}
        title="Gravar áudio"
      >
        <Mic className="h-4 w-4" />
      </Button>
    )
  }

  // Gravando, finalizando (aguardando o arquivo) ou preview
  return (
    <div className="flex flex-1 items-center gap-2">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-destructive hover:text-destructive"
        onClick={cancelRecording}
        title="Descartar"
      >
        <X className="h-4 w-4" />
      </Button>

      {isRecording ? (
        <>
          <div className="flex items-center gap-2 flex-1">
            <span className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
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
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={stop}
            title="Parar e ouvir antes de enviar"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
          </Button>
        </>
      ) : audioBlob && audioUrl ? (
        <>
          <div className="flex-1">
            <audio controls src={audioUrl} className="h-8 w-full" />
          </div>
          <span className="text-xs text-muted-foreground tabular-nums">{formatTime(duration)}</span>
          <Button
            type="button"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={handleSend}
            disabled={uploading}
            title="Enviar áudio"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </>
      ) : (
        <div className="flex flex-1 items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Finalizando gravação…
        </div>
      )}
    </div>
  )
}

export { AudioRecorder }
