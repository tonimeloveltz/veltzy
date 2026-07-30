import { RefreshCw, AlertCircle, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useWhatsAppTemplates, useSyncTemplates } from '@/hooks/use-whatsapp-templates'
import type { QualityRating, TemplateStatus } from '@/types/whatsapp-template'

const STATUS_META: Record<TemplateStatus, { label: string; className: string }> = {
  APPROVED: { label: 'Aprovado', className: 'bg-green-100 text-green-700' },
  IN_REVIEW: { label: 'Em revisao', className: 'bg-amber-100 text-amber-700' },
  PENDING: { label: 'Pendente', className: 'bg-muted text-muted-foreground' },
  REJECTED: { label: 'Rejeitado', className: 'bg-red-100 text-red-700' },
  PAUSED: { label: 'Pausado', className: 'bg-orange-100 text-orange-700' },
  DISABLED: { label: 'Desabilitado', className: 'bg-red-100 text-red-700' },
}

const QUALITY_META: Record<QualityRating, { label: string; className: string }> = {
  GREEN: { label: 'Alta', className: 'bg-green-500' },
  YELLOW: { label: 'Media', className: 'bg-amber-500' },
  RED: { label: 'Baixa', className: 'bg-red-500' },
}

const CATEGORY_LABEL: Record<string, string> = {
  UTILITY: 'Utilidade',
  MARKETING: 'Marketing',
  AUTHENTICATION: 'Autenticacao',
}

export const WhatsAppTemplatesManager = () => {
  const { data: templates, isLoading, isError, refetch } = useWhatsAppTemplates()
  const sync = useSyncTemplates()

  const handleSync = () => {
    sync.mutate(undefined, {
      onSuccess: (result) => toast.success(`${result.count} template(s) sincronizado(s).`),
      onError: (err) => toast.error(err instanceof Error ? err.message : 'Erro ao sincronizar.'),
    })
  }

  const syncButton = (
    <Button size="sm" variant="outline" onClick={handleSync} disabled={sync.isPending}>
      <RefreshCw className={`h-3.5 w-3.5 ${sync.isPending ? 'animate-spin' : ''}`} />
      Sincronizar
    </Button>
  )

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Templates</h3>
          {syncButton}
        </div>
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>
    )
  }

  if (isError) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
          <AlertCircle className="h-5 w-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Nao foi possivel carregar os templates.</p>
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Templates</h3>
        {syncButton}
      </div>

      {!templates || templates.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
            <FileText className="h-5 w-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Nenhum template ainda.</p>
            <p className="text-xs text-muted-foreground">
              Clique em Sincronizar para buscar os templates aprovados na Meta.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {templates.map((t) => {
            const status = STATUS_META[t.status]
            const quality = t.quality_rating ? QUALITY_META[t.quality_rating] : null
            return (
              <Card key={t.id}>
                <CardContent className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{t.name}</span>
                      {quality && (
                        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <span className={`h-2 w-2 rounded-full ${quality.className}`} />
                          {quality.label}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {CATEGORY_LABEL[t.category] ?? t.category} &middot; {t.language}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium ${status.className}`}
                  >
                    {status.label}
                  </span>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
