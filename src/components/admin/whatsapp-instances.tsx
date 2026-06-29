import { useState } from 'react'
import { MessageCircle, MoreVertical, Plus, Unplug, RefreshCw, Trash2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import {
  useWhatsAppInstances,
  useDisconnectInstance,
  useDeleteInstance,
} from '@/hooks/use-whatsapp-instances'
import { WhatsAppConnectDialog } from './whatsapp-connect-dialog'

const statusConfig = {
  connected: { label: 'Conectado', dot: 'bg-green-500', badge: 'bg-green-500/10 text-green-600' },
  disconnected: { label: 'Desconectado', dot: 'bg-red-500', badge: 'bg-red-500/10 text-red-600' },
  qr_pending: { label: 'Aguardando QR', dot: 'bg-yellow-500', badge: 'bg-yellow-500/10 text-yellow-600' },
} as const

export const WhatsAppInstances = () => {
  const { isAdmin } = useRoles()
  const { data: instances, isLoading } = useWhatsAppInstances()
  const disconnectMutation = useDisconnectInstance()
  const deleteMutation = useDeleteInstance()

  const [connectOpen, setConnectOpen] = useState(false)
  const [reconnectInstance, setReconnectInstance] = useState<string | null>(null)
  const [disconnectConfirm, setDisconnectConfirm] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const instanceCount = instances?.length ?? 0

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                <MessageCircle className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <CardTitle className="text-base">Conexao via QR Code</CardTitle>
                <CardDescription>
                  {instanceCount} {instanceCount === 1 ? 'numero conectado' : 'numeros'}
                </CardDescription>
              </div>
            </div>
            {isAdmin && (
              <Button size="sm" onClick={() => setConnectOpen(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Conectar numero
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : instances && instances.length > 0 ? (
            <div className="space-y-2">
              {instances.map((inst) => {
                const status = statusConfig[inst.status as keyof typeof statusConfig] ?? statusConfig.disconnected
                return (
                  <div key={inst.instance_name} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className={cn('h-2.5 w-2.5 rounded-full', status.dot)} />
                      <div>
                        <p className="text-sm font-medium">{inst.display_name ?? inst.instance_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {inst.phone_number ?? 'Aguardando conexao'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', status.badge)}>
                        {status.label}
                      </span>
                      {isAdmin && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {inst.status === 'connected' && (
                              <DropdownMenuItem onClick={() => setDisconnectConfirm(inst.instance_name)}>
                                <Unplug className="h-4 w-4 mr-2" />
                                Desconectar
                              </DropdownMenuItem>
                            )}
                            {(inst.status === 'disconnected' || inst.status === 'qr_pending') && (
                              <DropdownMenuItem onClick={() => setReconnectInstance(inst.instance_name)}>
                                <RefreshCw className="h-4 w-4 mr-2" />
                                Reconectar
                              </DropdownMenuItem>
                            )}
                            {inst.status !== 'connected' && (
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => setDeleteConfirm(inst.instance_name)}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Deletar
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Nenhuma instancia WhatsApp configurada
            </p>
          )}
        </CardContent>
      </Card>

      {/* Dialog: Criar instancia */}
      <WhatsAppConnectDialog
        open={connectOpen}
        onOpenChange={setConnectOpen}
        mode="create"
      />

      {/* Dialog: Reconectar instancia */}
      <WhatsAppConnectDialog
        open={!!reconnectInstance}
        onOpenChange={(open) => { if (!open) setReconnectInstance(null) }}
        mode="reconnect"
        instanceName={reconnectInstance ?? undefined}
      />

      {/* AlertDialog: Desconectar */}
      <AlertDialog open={!!disconnectConfirm} onOpenChange={(open) => { if (!open) setDisconnectConfirm(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desconectar instancia?</AlertDialogTitle>
            <AlertDialogDescription>
              O numero {disconnectConfirm} sera desconectado. Voce podera reconectar depois.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (disconnectConfirm) {
                  disconnectMutation.mutate(disconnectConfirm)
                  setDisconnectConfirm(null)
                }
              }}
            >
              Desconectar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AlertDialog: Deletar */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => { if (!open) setDeleteConfirm(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deletar instancia?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acao e irreversivel. O numero {deleteConfirm} sera removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteConfirm) {
                  deleteMutation.mutate(deleteConfirm)
                  setDeleteConfirm(null)
                }
              }}
            >
              Deletar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
