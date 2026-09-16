import { useState } from 'react'
import { Camera, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { InstagramConnectionStatus } from '@/components/admin/instagram-connection-status'
import { useAuthStore } from '@/stores/auth.store'
import { useFeatureFlagStatus } from '@/hooks/use-feature-flag'
import { useInstagramConnection } from '@/hooks/use-instagram-connection'
import { useConnectInstagram } from '@/hooks/use-connect-instagram'
import { useDisconnectInstagram } from '@/hooks/use-disconnect-instagram'
import { cn } from '@/lib/utils'
import { instagramCardState, type InstagramCardState } from '@/lib/instagram-connection-state'

const BADGE: Record<InstagramCardState | 'disabled', { label: string; className: string }> = {
  disabled: { label: 'Não habilitado', className: 'bg-muted text-muted-foreground' },
  not_connected: { label: 'Desconectado', className: 'bg-muted text-muted-foreground' },
  connected: { label: 'Conectado', className: 'bg-primary/10 text-primary' },
  needs_reconnect: { label: 'Reconectar', className: 'bg-destructive/10 text-destructive' },
}

const InstagramConnectionCard = () => {
  const [now] = useState(() => new Date())
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)
  const roles = useAuthStore((s) => s.roles)
  const canManage = roles.includes('admin') || roles.includes('super_admin')
  const { enabled, isLoading: flagLoading } = useFeatureFlagStatus('instagram_enabled')
  const { data: connection, isLoading: connectionLoading } = useInstagramConnection()
  const connect = useConnectInstagram()
  const disconnect = useDisconnectInstagram()

  const isLoading = flagLoading || connectionLoading
  const state = instagramCardState(connection, now)
  const badge = BADGE[enabled ? state : 'disabled']

  const connectButton = (label: string, variant: 'default' | 'outline') => (
    <Button size="sm" variant={variant} onClick={() => connect.mutate()} disabled={connect.isPending}>
      {connect.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
      {label}
    </Button>
  )

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
              <Camera className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <CardTitle className="text-base">Instagram Business</CardTitle>
              <CardDescription>Mensagens do Direct no Inbox</CardDescription>
            </div>
          </div>
          {!isLoading && (
            <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium', badge.className)}>
              {badge.label}
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {isLoading && <Skeleton className="h-16 w-full" />}

        {!isLoading && !enabled && (
          <p className="text-sm text-muted-foreground">Não habilitado para a sua empresa.</p>
        )}

        {!isLoading && enabled && state === 'not_connected' && (
          <>
            <p className="text-sm text-muted-foreground">
              Conecte a conta profissional do Instagram da empresa para receber e responder as DMs pelo Veltzy.
            </p>
            {canManage
              ? connectButton('Conectar Instagram', 'default')
              : <p className="text-xs text-muted-foreground">Peça a um administrador para conectar.</p>}
          </>
        )}

        {!isLoading && enabled && state !== 'not_connected' && connection && (
          <>
            <InstagramConnectionStatus connection={connection} now={now} />
            {canManage && (
              <div className="flex flex-wrap gap-2">
                {connectButton('Reconectar', state === 'needs_reconnect' ? 'default' : 'outline')}
                {connection.is_active && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setConfirmDisconnect(true)}
                    disabled={disconnect.isPending}
                  >
                    Desconectar
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>

      <AlertDialog open={confirmDisconnect} onOpenChange={setConfirmDisconnect}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desconectar o Instagram?</AlertDialogTitle>
            <AlertDialogDescription>
              Novas DMs deixam de entrar no Inbox e não será possível responder pelo Instagram até conectar de novo.
              As conversas já recebidas continuam no Veltzy.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => { disconnect.mutate(); setConfirmDisconnect(false) }}
            >
              Desconectar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

export { InstagramConnectionCard }
