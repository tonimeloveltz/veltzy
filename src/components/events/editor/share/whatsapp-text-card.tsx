import { Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EditorSection } from '@/components/events/editor/editor-section'
import { copyText } from '@/lib/events/copy-event-link'

export const WhatsappTextCard = ({ text }: { text: string }) => (
  <EditorSection title="Texto pronto para o WhatsApp">
    <p className="whitespace-pre-wrap break-words rounded-lg bg-muted p-3 text-sm">{text}</p>
    <Button type="button" variant="outline" size="sm" onClick={() => copyText(text, 'Texto copiado.')}>
      <Copy className="h-4 w-4" /> Copiar texto
    </Button>
  </EditorSection>
)
