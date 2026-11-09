import { useState, useRef, useEffect, useCallback } from 'react'
import Recorder from 'opus-recorder'
import encoderPath from 'opus-recorder/dist/encoderWorker.min.js?url'
import { toast } from 'sonner'

/**
 * Grava áudio já em OGG/Opus, o formato de mensagem de voz do WhatsApp.
 * O MediaRecorder do navegador gera webm (Chrome) ou mp4 (Safari), que o
 * WhatsApp aceita no envio mas o celular do contato não consegue baixar.
 */
export const VOICE_MIME_TYPE = 'audio/ogg'
export const VOICE_EXTENSION = 'ogg'

const MAX_DURATION = 5 * 60 // 5 minutos
export const WARNING_THRESHOLD = 4 * 60 + 30 // 4:30

const startErrorMessage = (err: unknown) => {
  const name = err instanceof DOMException ? err.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Permissão de microfone negada'
  if (name === 'NotFoundError') return 'Nenhum microfone encontrado'
  return 'Não foi possível iniciar a gravação'
}

export const useVoiceRecorder = () => {
  const [isRecording, setIsRecording] = useState(false)
  /** Entre parar e o encoder entregar o arquivo final. */
  const [isFinishing, setIsFinishing] = useState(false)
  const [duration, setDuration] = useState(0)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)

  const recorderRef = useRef<Recorder | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined)

  const discardRecorder = useCallback(() => {
    clearInterval(timerRef.current)
    const rec = recorderRef.current
    recorderRef.current = null
    if (rec) {
      rec.ondataavailable = null
      rec.close().catch(() => undefined)
    }
  }, [])

  useEffect(() => discardRecorder, [discardRecorder])

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl)
    }
  }, [audioUrl])

  const stop = useCallback(() => {
    clearInterval(timerRef.current)
    setIsRecording(false)
    const rec = recorderRef.current
    if (!rec) return
    setIsFinishing(true)
    rec.stop().catch(() => {
      setIsFinishing(false)
      toast.error('Não foi possível finalizar a gravação')
    })
  }, [])

  const start = useCallback(async (): Promise<boolean> => {
    if (!Recorder.isRecordingSupported()) {
      toast.error('Este navegador não permite gravar áudio')
      return false
    }

    const rec = new Recorder({
      encoderPath,
      encoderApplication: 2048, // perfil de voz
      encoderSampleRate: 48000,
      numberOfChannels: 1,
    })
    rec.ondataavailable = (data) => {
      const blob = new Blob([data], { type: VOICE_MIME_TYPE })
      setAudioBlob(blob)
      setAudioUrl(URL.createObjectURL(blob))
      setIsFinishing(false)
      recorderRef.current = null
    }

    try {
      await rec.start()
    } catch (err) {
      rec.close().catch(() => undefined)
      toast.error(startErrorMessage(err))
      return false
    }

    recorderRef.current = rec
    setAudioBlob(null)
    setAudioUrl(null)
    setDuration(0)
    setIsRecording(true)

    let elapsed = 0
    timerRef.current = setInterval(() => {
      elapsed += 1
      setDuration(elapsed)
      if (elapsed === WARNING_THRESHOLD) toast.warning('30 segundos restantes')
      if (elapsed >= MAX_DURATION) stop()
    }, 1000)
    return true
  }, [stop])

  /** Descarta gravação em andamento ou a prévia, voltando ao estado inicial. */
  const reset = useCallback(() => {
    discardRecorder()
    setIsRecording(false)
    setIsFinishing(false)
    setDuration(0)
    setAudioBlob(null)
    setAudioUrl(null)
  }, [discardRecorder])

  return { isRecording, isFinishing, duration, audioBlob, audioUrl, start, stop, reset }
}
