import { useState, useRef, useEffect, useCallback } from 'react'
import { Mic2, Play, Pause, Sparkles, ImageOff } from 'lucide-react'

interface AudioBubbleProps {
  fileUrl: string
  transcription: string | null
}

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

const AudioBubble = ({ fileUrl, transcription }: AudioBubbleProps) => {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [loadError, setLoadError] = useState(false)

  const toggle = useCallback(() => {
    const el = audioRef.current
    if (!el) return
    if (playing) {
      el.pause()
    } else {
      el.play()
    }
  }, [playing])

  useEffect(() => {
    const el = audioRef.current
    if (!el) return

    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onEnded = () => { setPlaying(false); setCurrentTime(0) }
    const onTime = () => setCurrentTime(el.currentTime)
    const onMeta = () => setDuration(el.duration || 0)
    const onError = () => setLoadError(true)

    el.addEventListener('play', onPlay)
    el.addEventListener('pause', onPause)
    el.addEventListener('ended', onEnded)
    el.addEventListener('timeupdate', onTime)
    el.addEventListener('loadedmetadata', onMeta)
    el.addEventListener('durationchange', onMeta)
    el.addEventListener('error', onError)

    return () => {
      el.removeEventListener('play', onPlay)
      el.removeEventListener('pause', onPause)
      el.removeEventListener('ended', onEnded)
      el.removeEventListener('timeupdate', onTime)
      el.removeEventListener('loadedmetadata', onMeta)
      el.removeEventListener('durationchange', onMeta)
      el.removeEventListener('error', onError)
    }
  }, [])

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  if (loadError) {
    return (
      <div className="flex items-center gap-2 rounded-2xl bg-secondary p-3 text-xs text-muted-foreground">
        <ImageOff className="h-4 w-4 shrink-0" />
        <span>Audio indisponivel</span>
      </div>
    )
  }

  const handleBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = audioRef.current
    if (!el || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    el.currentTime = ratio * duration
  }

  return (
    <div className="rounded-2xl bg-secondary p-3 shadow-sm">
      <audio ref={audioRef} src={fileUrl} preload="metadata" />

      <div className="flex items-center gap-3">
        <Mic2 className="h-4 w-4 shrink-0 text-primary" />

        <button
          onClick={toggle}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-all duration-150 hover:bg-primary/90"
        >
          {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 ml-0.5" />}
        </button>

        <div className="flex flex-1 items-center gap-2 min-w-0">
          <div
            className="relative h-1 flex-1 cursor-pointer rounded-full bg-muted"
            onClick={handleBarClick}
          >
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-primary transition-all duration-100"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground tabular-nums shrink-0">
            {formatTime(playing || currentTime > 0 ? currentTime : duration)}
          </span>
        </div>
      </div>

      {transcription && (
        <div className="mt-2 border-t border-border/30 pt-2">
          <p className="text-sm italic text-muted-foreground">
            <Sparkles className="mr-1 inline-block h-3 w-3 text-primary/60" />
            {transcription}
          </p>
        </div>
      )}

      {!transcription && (
        <div className="mt-2 border-t border-border/30 pt-2">
          <p className="text-xs italic text-muted-foreground/50">Transcricao indisponivel</p>
        </div>
      )}
    </div>
  )
}

export { AudioBubble }
