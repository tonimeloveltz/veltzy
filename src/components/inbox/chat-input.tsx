import { useState, useRef, useCallback } from 'react'
import { SendHorizonal, Paperclip, Loader2, AlertTriangle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ReplyTemplatesPopover } from '@/components/inbox/reply-templates-popover'
import { TemplateSelectorPopover } from '@/components/inbox/template-selector-popover'
import { TemplateVariablesForm } from '@/components/inbox/template-variables-form'
import { AudioRecorder } from '@/components/inbox/audio-recorder'
import { useSendMessage, useWhatsAppConnected } from '@/hooks/use-messages'
import { useWhatsAppStatus } from '@/hooks/use-whatsapp-status'
import { useConversationWindow } from '@/hooks/use-conversation-window'
import { useAuthStore } from '@/stores/auth.store'
import { supabase } from '@/lib/supabase'
import { safeStorageName } from '@/lib/storage'
import type { WhatsAppTemplate } from '@/types/whatsapp-template'

interface ChatInputProps {
  leadId: string
  onTyping?: () => void
}

const ChatInput = ({ leadId, onTyping }: ChatInputProps) => {
  const [content, setContent] = useState('')
  const [uploading, setUploading] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedTemplate, setSelectedTemplate] = useState<WhatsAppTemplate | null>(null)
  const [varsFormOpen, setVarsFormOpen] = useState(false)
  const sendMessage = useSendMessage()
  const { data: whatsAppConnected } = useWhatsAppConnected()
  const { data: whatsappStatus } = useWhatsAppStatus()
  const profile = useAuthStore((s) => s.profile)
  const companyId = useAuthStore((s) => s.company?.id)
  const isEvolution = whatsappStatus?.provider === 'evolution'
  const hasInstance = !isEvolution || !!profile?.default_whatsapp_instance

  // Template HSM: so no Cloud API. Fora da janela de 24h (recebida do contato),
  // a Meta so entrega template aprovado -> desabilita texto livre e destaca o seletor.
  const isCloudApi = whatsappStatus?.provider === 'cloud_api'
  const { data: windowOpen } = useConversationWindow(leadId)
  const windowClosed = isCloudApi && windowOpen === false

  const openTemplate = (t: WhatsAppTemplate) => {
    setSelectedTemplate(t)
    setVarsFormOpen(true)
  }

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [])

  const handleSend = async () => {
    const text = content.trim()
    if (!text || sendMessage.isPending) return
    // Fora da janela de 24h (Cloud API), texto livre nao e entregue: so template.
    if (windowClosed) return

    setContent('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    await sendMessage.mutateAsync({ leadId, content: text })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !companyId) return

    if (file.size > 25 * 1024 * 1024) {
      toast.error('Arquivo muito grande (max 25MB)')
      return
    }

    setUploading(true)
    try {
      // Sanitiza SO o segmento do filename (acento/nao-ASCII quebra a key do Storage).
      // UUIDs de company/lead e timestamp ficam intactos. O nome original com acento
      // segue em content/fileName para exibicao no chat.
      const path = `${companyId}/${leadId}/${Date.now()}-${safeStorageName(file.name)}`
      const { error: uploadError } = await supabase.storage
        .from('chat-attachments')
        .upload(path, file)
      if (uploadError) throw uploadError

      const { data: publicUrlData } = supabase.storage
        .from('chat-attachments')
        .getPublicUrl(path)
      const fileUrl = publicUrlData.publicUrl

      const messageType = file.type.startsWith('image/') ? 'image'
        : file.type.startsWith('audio/') ? 'audio'
        : file.type.startsWith('video/') ? 'video'
        : 'document'

      await sendMessage.mutateAsync({
        leadId,
        content: file.name,
        messageType,
        fileUrl,
        fileName: file.name,
        mimeType: file.type,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao enviar arquivo'
      toast.error(msg)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  if (!hasInstance) {
    return (
      <div className="border-t bg-background p-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
          <span>Configure seu numero WhatsApp em{' '}
            <Link to="/minha-conta" className="underline text-primary">Minha Conta</Link>
            {' '}para enviar mensagens.
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="border-t bg-background p-3">
      {windowClosed && (
        <div className="mb-2 flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          A janela de 24h fechou. So e possivel enviar um template aprovado.
        </div>
      )}
      <div className="relative flex items-end gap-2">
        {!isRecording && (
          <>
            <div className="relative">
              <ReplyTemplatesPopover onSelect={(t) => { setContent(t); textareaRef.current?.focus() }} />
            </div>
            {isCloudApi && (
              <div className="relative">
                <TemplateSelectorPopover onPick={openTemplate} highlight={windowClosed} />
              </div>
            )}

            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx"
              onChange={handleFileUpload}
            />
          </>
        )}

        <AudioRecorder leadId={leadId} onRecordingChange={setIsRecording} />

        {!isRecording && (
          <>
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => {
                setContent(e.target.value)
                adjustHeight()
                onTyping?.()
              }}
              onKeyDown={handleKeyDown}
              disabled={windowClosed}
              placeholder={windowClosed ? 'Janela fechada. Envie um template aprovado.' : 'Digite uma mensagem...'}
              rows={1}
              className="flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring input-clean disabled:cursor-not-allowed disabled:opacity-60"
            />

            <button
              onClick={handleSend}
              disabled={!content.trim() || sendMessage.isPending || windowClosed}
              title={whatsAppConnected === false ? 'WhatsApp nao conectado - mensagem sera salva como manual' : undefined}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-all duration-150 hover:bg-primary/90 disabled:cursor-not-allowed"
            >
              {sendMessage.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <SendHorizonal className="h-4 w-4" />
              )}
            </button>
          </>
        )}
      </div>

      <TemplateVariablesForm
        open={varsFormOpen}
        onOpenChange={setVarsFormOpen}
        template={selectedTemplate}
        leadId={leadId}
      />
    </div>
  )
}

export { ChatInput }
