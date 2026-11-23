import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EditorSection } from '@/components/events/editor/editor-section'
import { CopyField } from '@/components/events/editor/share/copy-field'
import { useQrCode } from '@/hooks/events/use-qr-code'

export const LinkQrCard = ({ url, slug }: { url: string; slug: string }) => {
  const qr = useQrCode(url)
  return (
    <EditorSection title="Link do evento">
      <CopyField value={url} openable />
      <div className="flex flex-wrap items-center gap-4">
        {qr.data ? (
          <img src={qr.data} alt="QR code do link do evento" className="h-36 w-36 rounded-md border bg-white p-1" />
        ) : <Skeleton className="h-36 w-36" />}
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Para cartaz, slide ou mesa de recepção. Aponta para o link principal.</p>
          <Button type="button" variant="outline" size="sm" asChild disabled={!qr.data}>
            <a href={qr.data ?? '#'} download={`qr-${slug}.png`}><Download className="h-4 w-4" /> Baixar QR code (PNG)</a>
          </Button>
        </div>
      </div>
    </EditorSection>
  )
}
