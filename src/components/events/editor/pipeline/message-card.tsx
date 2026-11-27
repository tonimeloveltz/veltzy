import { useRef } from 'react'
import { useFormContext, useWatch } from 'react-hook-form'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { MESSAGE_VARIABLES, renderEventMessage, type EventMessageVars } from '@/lib/events/render-message'
import type { EditorValues, MESSAGE_KINDS } from '@/lib/events/editor-form'

type Kind = (typeof MESSAGE_KINDS)[number]

interface MessageCardProps {
  kind: Kind
  title: string
  when: string
  sample: Partial<EventMessageVars>
  /** botoes de variavel so deste card */
  extraVariables?: Array<{ key: keyof EventMessageVars; label: string }>
}

export const MessageCard = ({ kind, title, when, sample, extraVariables = [] }: MessageCardProps) => {
  const { control, setValue, formState: { errors } } = useFormContext<EditorValues>()
  const msg = useWatch({ control, name: `messages.${kind}` })
  const area = useRef<HTMLTextAreaElement>(null)
  const error = errors.messages?.[kind]?.text?.message

  const setText = (text: string) => setValue(`messages.${kind}.text`, text, { shouldDirty: true, shouldValidate: !!error })

  const insert = (key: string) => {
    const el = area.current
    const token = `{{${key}}}`
    const start = el?.selectionStart ?? msg.text.length
    const end = el?.selectionEnd ?? msg.text.length
    setText(msg.text.slice(0, start) + token + msg.text.slice(end))
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(start + token.length, start + token.length) })
  }

  return (
    <div className={cn('space-y-3 rounded-lg border p-4', !msg.enabled && 'opacity-70')}>
      <div className="flex items-start gap-3">
        <Switch id={`msg-${kind}`} checked={msg.enabled} aria-label={`Enviar ${title}`}
          onCheckedChange={(v) => setValue(`messages.${kind}.enabled`, v, { shouldDirty: true, shouldValidate: true })} />
        <label htmlFor={`msg-${kind}`} className="min-w-0 flex-1">
          <p className="font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{when}</p>
        </label>
      </div>
      {msg.enabled && (
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="space-y-2">
            <Textarea ref={area} rows={6} value={msg.text} maxLength={1000} aria-label={`Texto: ${title}`}
              onChange={(e) => setText(e.target.value)} />
            <div className="flex flex-wrap gap-1">
              {[...MESSAGE_VARIABLES, ...extraVariables].map((v) => (
                <button key={v.key} type="button" onClick={() => insert(v.key)}
                  className="rounded-full border px-2 py-0.5 text-xs hover:border-primary hover:text-primary">
                  {v.label}
                </button>
              ))}
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Prévia com dados de exemplo</p>
            <p className="whitespace-pre-wrap break-words rounded-lg bg-muted p-3 text-sm">{renderEventMessage(msg.text, sample)}</p>
            <p className="text-xs text-muted-foreground">A linha do SAIR é fixa e não pode ser editada.</p>
          </div>
        </div>
      )}
    </div>
  )
}
