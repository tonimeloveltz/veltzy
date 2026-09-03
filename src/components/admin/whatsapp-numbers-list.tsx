import { useState } from 'react'
import { MessageCircle, Plus, Unplug, QrCode, Settings2, GitBranch } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useRoles } from '@/hooks/use-roles'
import { useWhatsAppNumbers, useDisconnectNumber } from '@/hooks/use-whatsapp-numbers'
import type { WhatsAppNumberItem, WhatsAppProviderKind } from '@/services/whatsapp-numbers.service'
import { WhatsAppConnectDialog } from './whatsapp-connect-dialog'

const providerBadge: Record<WhatsAppProviderKind, string> = {
  cloud_api: 'bg-emerald-500/10 text-emerald-600',
  evolution: 'bg-blue-500/10 text-blue-600',
  waha: 'bg-violet-500/10 text-violet-600',
}

const statusConfig = {
  connected: { label: 'Conectado', dot: 'bg-green-500' },
  disconnected: { label: 'Desconectado', dot: 'bg-red-500' },
  qr_pending: { label: 'Aguardando QR', dot: 'bg-yellow-500' },
  pending: { label: 'Preparando', dot: 'bg-muted-foreground/40' },
  error: { label: 'Com erro', dot: 'bg-red-500' },
} as const

const NumberRow = ({
  item,
  isAdmin,
  onDisconnect,
}: {
  item: WhatsAppNumberItem
  isAdmin: boolean
  onDisconnect: (item: WhatsAppNumberItem) => void
}) => {
  const status = statusConfig[item.status] ?? statusConfig.disconnected
  const isOfficial = item.provider === 'cloud_api'

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <div className={cn('h-2.5 w-2.5 shrink-0 rounded-full', status.dot)} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium">
              {item.displayNumber ?? 'Aguardando conexao'}
            </p>
            <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', providerBadge[item.provider])}>
              {item.providerLabel}
            </span>
          </div>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <GitBranch className="h-3 w-3" />
            {item.funnelName ? `Funil ${item.funnelName}` : 'Sem regra - vai pro padrao'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 pl-5 sm:pl-0">
        <span className="text-xs text-muted-foreground">{status.label}</span>
        {isAdmin && (
          isOfficial ? (
            <Button variant="outline" size="sm" className="h-8" asChild>
              <a href="#cloud-api">
                <Settings2 className="mr-1 h-3.5 w-3.5" />
                Gerenciar
              </a>
            </Button>
          ) : item.status === 'connected' ? (
            <Button variant="outline" size="sm" className="h-8" onClick={() => onDisconnect(item)}>
              <Unplug className="mr-1 h-3.5 w-3.5" />
              Desconectar
            </Button>
          ) : (
            <Button variant="outline" size="sm" className="h-8" disabled title="Gerencie a conexao no painel">
              <QrCode className="mr-1 h-3.5 w-3.5" />
              Ler QR Code
            </Button>
          )
        )}
      </div>
    </div>
  )
}

export const WhatsAppNumbersList = () => {
  const { isAdmin } = useRoles()
  const { data: numbers, isLoading } = useWhatsAppNumbers()
  const disconnectMutation = useDisconnectNumber()

  const [connectOpen, setConnectOpen] = useState(false)
  const [disconnectTarget, setDisconnectTarget] = useState<WhatsAppNumberItem | null>(null)

  const count = numbers?.length ?? 0

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                <MessageCircle className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <CardTitle className="text-base">Numeros de WhatsApp</CardTitle>
                <CardDescription>
                  {count} {count === 1 ? 'numero' : 'numeros'} conectados aos seus funis
                </CardDescription>
              </div>
            </div>
            {isAdmin && (
              <Button size="sm" onClick={() => setConnectOpen(true)}>
                <Plus className="mr-1 h-4 w-4" />
                Conectar numero
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : numbers && numbers.length > 0 ? (
            <div className="space-y-2">
              {numbers.map((item) => (
                <NumberRow
                  key={`${item.provider}:${item.ref}`}
                  item={item}
                  isAdmin={isAdmin}
                  onDisconnect={setDisconnectTarget}
                />
              ))}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum numero conectado. Clique em "Conectar numero" para comecar.
            </p>
          )}
        </CardContent>
      </Card>

      <WhatsAppConnectDialog open={connectOpen} onOpenChange={setConnectOpen} mode="create" />

      <AlertDialog
        open={!!disconnectTarget}
        onOpenChange={(open) => { if (!open) setDisconnectTarget(null) }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desconectar numero?</AlertDialogTitle>
            <AlertDialogDescription>
              {disconnectTarget?.displayNumber ?? 'Este numero'} sera desconectado. Voce podera
              reconectar depois lendo o QR Code novamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (disconnectTarget) {
                  disconnectMutation.mutate({ provider: disconnectTarget.provider, ref: disconnectTarget.ref })
                  setDisconnectTarget(null)
                }
              }}
            >
              Desconectar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
