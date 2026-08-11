import { useState, useRef, useCallback } from 'react'
import {
  SendHorizonal, Paperclip, Loader2, AlertTriangle, Plus, FileText, Package, CalendarPlus
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ReplyTemplatesPopover } from '@/components/inbox/reply-templates-popover'
import { ScheduleMeetingDialog } from '@/components/inbox/schedule-meeting-dialog'
import { ProductsPopover } from '@/components/inbox/products-popover'
import { AudioRecorder } from '@/components/inbox/audio-recorder'
import { useSendMessage, useWhatsAppConnected } from '@/hooks/use-messages'
import { useWhatsAppStatus } from '@/hooks/use-whatsapp-status'
import { useAuthStore } from '@/stores/auth.store'
import { supabase } from '@/lib/supabase'
import { safeStorageName } from '@/lib/storage'
import type { Product } from '@/types/database'

interface ChatInputProps {
  leadId: string
  onTyping?: () => void
}

const composeMenuItemClass =
  'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground transition-smooth'


const ChatInput = ({ leadId, onTyping }: ChatInputProps) => {
  const [content, setContent] = useState('')
  const [uploading, setUploading] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [productsOpen, setProductsOpen] = useState(false)
  const [composeMenuOpen, setComposeMenuOpen] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const sendMessage = useSendMessage()
  const { data: whatsAppConnected } = useWhatsAppConnected()
  const { data: whatsappStatus } = useWhatsAppStatus()
  const profile = useAuthStore((s) => s.profile)
  const companyId = useAuthStore((s) => s.company?.id)
  const isEvolution = whatsappStatus?.provider === 'evolution'
  const hasInstance = !isEvolution || !!profile?.default_whatsapp_instance

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [])

  // Os dois paineis sao absolutos e ancoram na mesma barra: abertos juntos, um
  // cobre o outro. Abrir um fecha o outro.
  const openTemplates = (open: boolean) => {
    setTemplatesOpen(open)
    if (open) setProductsOpen(false)
  }

  const openProducts = (open: boolean) => {
    setProductsOpen(open)
    if (open) setTemplatesOpen(false)
  }

  /**
   * Foco no fim mais reajuste de altura, DEPOIS do commit do React: e ali que o
   * scrollHeight ja reflete o texto inserido. Sem isso, texto de varias linhas
   * nasce cortado na altura de uma linha e so se corrige quando o vendedor
   * digita alguma coisa.
   */
  const focusTextareaEnd = useCallback(() => {
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
      adjustHeight()
    })
  }, [adjustHeight])

  /** O script E a mensagem inteira, entao substitui o que estiver escrito. */
  const handleTemplateSelect = (template: string) => {
    setContent(template)
    focusTextareaEnd()
  }

  /**
   * Do produto vai APENAS o link para a mensagem. Nome, categoria e descricao
   * existem para o vendedor achar o produto certo no popover, nao para o
   * cliente ler.
   *
   * E ACRESCENTA, enquanto o script SUBSTITUI: o script E a mensagem inteira,
   * o link e complemento do que o vendedor ja esta escrevendo.
   */
  const handleProductSelect = (product: Product) => {
    const link = product.link?.trim()
    if (!link) {
      toast.error('Este produto nao tem link cadastrado')
      return
    }

    setContent((prev) => (prev.trim() ? `${prev}\n\n${link}` : link))
    focusTextareaEnd()
  }

  const handleSend = async () => {
    const text = content.trim()
    if (!text || sendMessage.isPending) return

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
      <div className="relative flex items-end gap-2">
        {!isRecording && (
          <>
            {/* O painel de templates e absoluto e ancora na barra: nao ocupa
                largura nem gap, e serve tanto ao gatilho de desktop quanto ao
                item "Templates" do menu agrupado de mobile. */}
            {/* Templates e produtos primeiro, juntos: os dois inserem texto na
                mensagem. Anexo e agendar fazem outra coisa e vem depois. A
                mesma ordem vale no menu agrupado de mobile. */}
            <ReplyTemplatesPopover
              open={templatesOpen}
              onOpenChange={openTemplates}
              triggerClassName="hidden sm:inline-flex"
              onSelect={handleTemplateSelect}
            />

            <ProductsPopover
              open={productsOpen}
              onOpenChange={openProducts}
              triggerClassName="hidden sm:inline-flex"
              onSelect={handleProductSelect}
            />

            {/* Abaixo de 640px a barra nao comporta quatro icones: templates,
                anexo e agendar colapsam atras deste gatilho. Audio, textarea e
                enviar continuam sempre visiveis. */}
            <div className="relative sm:hidden">
              {composeMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setComposeMenuOpen(false)}
                  />
                  <div className="absolute bottom-full left-0 z-20 mb-2 w-48 rounded-lg border bg-popover p-1 shadow-lg animate-fade-in">
                    <button
                      type="button"
                      onClick={() => { setComposeMenuOpen(false); openTemplates(true) }}
                      className={composeMenuItemClass}
                    >
                      <FileText className="h-4 w-4 shrink-0" />
                      Templates
                    </button>
                    <button
                      type="button"
                      onClick={() => { setComposeMenuOpen(false); openProducts(true) }}
                      className={composeMenuItemClass}
                    >
                      <Package className="h-4 w-4 shrink-0" />
                      Produtos
                    </button>
                    <button
                      type="button"
                      onClick={() => { setComposeMenuOpen(false); fileInputRef.current?.click() }}
                      className={composeMenuItemClass}
                    >
                      <Paperclip className="h-4 w-4 shrink-0" />
                      Anexo
                    </button>
                  </div>
                </>
              )}

              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={() => setComposeMenuOpen((o) => !o)}
                title="Mais acoes"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              </Button>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="hidden h-8 w-8 text-muted-foreground hover:text-foreground sm:inline-flex"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              title="Anexar arquivo"
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

            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="hidden h-8 w-8 text-muted-foreground hover:text-foreground sm:inline-flex"
              onClick={() => setScheduleOpen(true)}
              title="Agendar reuniao"
            >
              <CalendarPlus className="h-4 w-4" />
            </Button>
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
              placeholder="Digite uma mensagem..."
              rows={1}
              className="flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring input-clean"
            />

            <button
              onClick={handleSend}
              disabled={!content.trim() || sendMessage.isPending}
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

      {/* Montado sob demanda: o dialogo busca o lead e a conexao Google so
          quando o vendedor abre de fato. */}
      {scheduleOpen && (
        <ScheduleMeetingDialog leadId={leadId} onClose={() => setScheduleOpen(false)} />
      )}
    </div>
  )
}

export { ChatInput }
