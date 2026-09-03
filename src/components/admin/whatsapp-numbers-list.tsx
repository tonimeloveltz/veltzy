import { useState } from 'react'
import { MessageCircle, Plus, Unplug, RefreshCw, Trash2, Settings2, GitBranch } from 'lucide-react'
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
import { useWhatsAppNumbers, useDisconnectNumber, useDeleteNumber } from '@/hooks/use-whatsapp-numbers'
import { useWhatsAppCategories } from '@/hooks/use-whatsapp-categories'
import type { WhatsAppNumberItem, WhatsAppProviderKind } from '@/services/whatsapp-numbers.service'
import { ConnectNumberDialog, type ConnectChoice } from './connect-number-dialog'
import { OfficialManageDialog } from './official-manage-dialog'
import { WhatsAppConnectDialog } from './whatsapp-connect-dialog'
import { WahaConnectDialog } from './waha-connect-dialog'

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
  onReconnect,
  onDelete,
  onManageOfficial,
}: {
  item: WhatsAppNumberItem
  isAdmin: boolean
  onDisconnect: (item: WhatsAppNumberItem) => void
  onReconnect: (item: WhatsAppNumberItem) => void
  onDelete: (item: WhatsAppNumberItem) => void
  onManageOfficial: () => void
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
              {item.displayNumber ?? (item.status === 'connected' ? 'Numero conectado' : 'Aguardando conexao')}
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
            <Button variant="outline" size="sm" className="h-8" onClick={onManageOfficial}>
              <Settings2 className="mr-1 h-3.5 w-3.5" />
              Gerenciar
            </Button>
          ) : item.status === 'connected' ? (
            <Button variant="outline" size="sm" className="h-8" onClick={() => onDisconnect(item)}>
              <Unplug className="mr-1 h-3.5 w-3.5" />
              Desconectar
            </Button>
          ) : (
            <>
              <Button variant="outline" size="sm" className="h-8" onClick={() => onReconnect(item)}>
                <RefreshCw className="mr-1 h-3.5 w-3.5" />
                Reconectar
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive"
                title="Remover numero"
                onClick={() => onDelete(item)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )
        )}
      </div>
    </div>
  )
}

// Providers na ordem de exibicao + mapeamento categoria->provider (item 1).
const PROVIDER_META: {
  key: WhatsAppProviderKind
  label: string
  connect: ConnectChoice
  categoryKey: 'official' | 'qr_code' | 'waha'
}[] = [
  { key: 'cloud_api', label: 'WhatsApp API Oficial', connect: 'official', categoryKey: 'official' },
  { key: 'evolution', label: 'Evolution', connect: 'evolution', categoryKey: 'qr_code' },
  { key: 'waha', label: 'WAHA', connect: 'waha', categoryKey: 'waha' },
]

// Linha de estado vazio: provider LIBERADO no Hub mas sem numero conectado ainda.
const EmptyProviderRow = ({
  label,
  provider,
  isAdmin,
  onConnect,
}: {
  label: string
  provider: WhatsAppProviderKind
  isAdmin: boolean
  onConnect: () => void
}) => (
  <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3 sm:flex-row sm:items-center sm:justify-between">
    <div className="flex items-center gap-3">
      <div className="h-2.5 w-2.5 shrink-0 rounded-full bg-muted-foreground/30" />
      <div className="flex items-center gap-2">
        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', providerBadge[provider])}>
          {label}
        </span>
        <span className="text-xs text-muted-foreground">Disponivel - conecte um numero</span>
      </div>
    </div>
    {isAdmin && (
      <Button variant="outline" size="sm" className="h-8 pl-5 sm:pl-3" onClick={onConnect}>
        <Plus className="mr-1 h-3.5 w-3.5" />
        Conectar
      </Button>
    )}
  </div>
)

export const WhatsAppNumbersList = () => {
  const { isAdmin } = useRoles()
  const { data: numbers, isLoading } = useWhatsAppNumbers()
  const { data: categories } = useWhatsAppCategories()
  const disconnectMutation = useDisconnectNumber()
  const deleteMutation = useDeleteNumber()

  const [connectOpen, setConnectOpen] = useState(false)
  const [connectInitial, setConnectInitial] = useState<ConnectChoice | undefined>(undefined)
  const [officialManageOpen, setOfficialManageOpen] = useState(false)
  const [disconnectTarget, setDisconnectTarget] = useState<WhatsAppNumberItem | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<WhatsAppNumberItem | null>(null)
  const [reconnectTarget, setReconnectTarget] = useState<WhatsAppNumberItem | null>(null)

  const count = numbers?.length ?? 0

  // Providers LIBERADOS no Hub que ainda nao tem numero -> linha de estado vazio.
  // (Nunca escondemos numero real que ja exista, mesmo de provider nao-liberado.)
  const emptyEnabledProviders = PROVIDER_META.filter(
    (p) => categories?.[p.categoryKey] && !(numbers ?? []).some((n) => n.provider === p.key),
  )

  const openConnect = (initial?: ConnectChoice) => {
    setConnectInitial(initial)
    setConnectOpen(true)
  }
  const hasAnyRow = (numbers?.length ?? 0) > 0 || emptyEnabledProviders.length > 0

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
              <Button size="sm" onClick={() => openConnect()}>
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
          ) : hasAnyRow ? (
            <div className="space-y-2">
              {(numbers ?? []).map((item) => (
                <NumberRow
                  key={`${item.provider}:${item.ref}`}
                  item={item}
                  isAdmin={isAdmin}
                  onDisconnect={setDisconnectTarget}
                  onReconnect={setReconnectTarget}
                  onDelete={setDeleteTarget}
                  onManageOfficial={() => setOfficialManageOpen(true)}
                />
              ))}
              {emptyEnabledProviders.map((p) => (
                <EmptyProviderRow
                  key={p.key}
                  label={p.label}
                  provider={p.key}
                  isAdmin={isAdmin}
                  onConnect={() => openConnect(p.connect)}
                />
              ))}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum canal de WhatsApp liberado. Fale com o suporte.
            </p>
          )}
        </CardContent>
      </Card>

      <ConnectNumberDialog
        open={connectOpen}
        onOpenChange={setConnectOpen}
        initialProvider={connectInitial}
      />
      <OfficialManageDialog open={officialManageOpen} onOpenChange={setOfficialManageOpen} />

      {/* Reconectar: Evolution reusa o dialog existente (mode reconnect); WAHA via PATCH. */}
      <WhatsAppConnectDialog
        open={reconnectTarget?.provider === 'evolution'}
        onOpenChange={(o) => { if (!o) setReconnectTarget(null) }}
        mode="reconnect"
        instanceName={reconnectTarget?.provider === 'evolution' ? reconnectTarget.ref : undefined}
      />
      <WahaConnectDialog
        open={reconnectTarget?.provider === 'waha'}
        onOpenChange={(o) => { if (!o) setReconnectTarget(null) }}
        reconnectSession={reconnectTarget?.provider === 'waha' ? reconnectTarget.ref : undefined}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover numero?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.displayNumber ?? 'Este numero'} sera removido permanentemente. Esta acao
              e irreversivel.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) {
                  deleteMutation.mutate({ provider: deleteTarget.provider, ref: deleteTarget.ref })
                  setDeleteTarget(null)
                }
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
