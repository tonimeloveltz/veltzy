import { useEffect, useRef, useState } from 'react'
import { Check, X } from 'lucide-react'

interface MessageEditFormProps {
  initialContent: string
  isPending: boolean
  onCancel: () => void
  onSubmit: (content: string) => void
}

/**
 * Textarea da edicao inline de uma mensagem ja enviada.
 *
 * Componente separado porque message-bubble.tsx ja esta no teto de ~200 linhas.
 * Usa <textarea> cru com as classes do chat-input.tsx: este repo nao tem
 * components/ui/textarea do shadcn, e o chat-input e o idioma da casa.
 */
const MessageEditForm = ({ initialContent, isPending, onCancel, onSubmit }: MessageEditFormProps) => {
  const [content, setContent] = useState(initialContent)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Autofocus com o cursor no fim, e nao selecionando tudo: quem edita costuma
  // querer acrescentar ou corrigir o final, nao reescrever do zero.
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [])

  const trimmed = content.trim()
  const canSubmit = !!trimmed && trimmed !== initialContent.trim() && !isPending

  const handleSubmit = () => {
    if (!canSubmit) return
    onSubmit(trimmed)
  }

  // Mesmo idioma do chat-input: Enter envia, Shift+Enter quebra linha. Esc
  // cancela, que o chat-input nao tem porque la nao ha o que cancelar.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    }
  }

  return (
    <div className="space-y-1">
      <textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={isPending}
        rows={2}
        className="w-full resize-none rounded-lg border border-input bg-background px-2 py-1.5 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring input-clean"
      />
      <div className="flex items-center justify-end gap-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={isPending}
          title="Cancelar (Esc)"
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-smooth hover:bg-muted disabled:opacity-50"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          title="Salvar (Enter)"
          className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground transition-smooth hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

export { MessageEditForm }
