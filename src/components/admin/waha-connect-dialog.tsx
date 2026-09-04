import { useState, useEffect, useCallback } from 'react'
import { CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCreateWahaSession, useWahaSessionStatus } from '@/hooks/use-whatsapp-numbers'
import { reconnectWahaSession } from '@/services/whatsapp-numbers.service'

type DialogState = 'idle' | 'loading' | 'qr_pending' | 'connected' | 'error' | 'expired'

interface WahaConnectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Quando presente, o dialog reconecta essa sessao (PATCH) em vez de criar uma nova. */
  reconnectSession?: string
}

// Janela do QR curta (licao do E2E: parear rapido). 2 min e o teto pratico.
const QR_TIMEOUT_MS = 120_000

export const WahaConnectDialog = ({ open, onOpenChange, reconnectSession }: WahaConnectDialogProps) => {
  const queryClient = useQueryClient()
  const [state, setState] = useState<DialogState>('idle')
  const [displayName, setDisplayName] = useState('')
  const [qrBase64, setQrBase64] = useState<string | null>(null)
  const [sessionName, setSessionName] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState('')

  const createMutation = useCreateWahaSession()
  const { data: statusData } = useWahaSessionStatus(sessionName, state === 'qr_pending')

  // Transiciona pra connected quando o polling detecta WORKING.
  useEffect(() => {
    if (statusData?.status === 'connected' && state === 'qr_pending') {
      setState('connected')
      queryClient.invalidateQueries({ queryKey: ['whatsapp-numbers'] })
    }
    // Atualiza o QR se o Hub devolver um novo durante o pending.
    if (statusData?.qr_code_base64 && state === 'qr_pending') {
      setQrBase64(statusData.qr_code_base64)
    }
  }, [statusData, state, queryClient])

  // Auto-fechar apos conectar.
  useEffect(() => {
    if (state === 'connected') {
      const timer = setTimeout(() => onOpenChange(false), 2000)
      return () => clearTimeout(timer)
    }
  }, [state, onOpenChange])

  // Timeout do QR.
  useEffect(() => {
    if (state !== 'qr_pending') return
    const timer = setTimeout(() => setState('expired'), QR_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [state, qrBase64])

  // Reset ao fechar.
  useEffect(() => {
    if (!open) {
      setState('idle')
      setDisplayName('')
      setQrBase64(null)
      setSessionName(null)
      setErrorMessage('')
    }
  }, [open])

  // Auto-iniciar reconexao ao abrir (PATCH reconnect + polling do QR/status).
  useEffect(() => {
    if (open && reconnectSession && state === 'idle') {
      setState('loading')
      reconnectWahaSession(reconnectSession)
        .then((r) => {
          setSessionName(reconnectSession)
          setQrBase64(r.qr_code_base64)
          setState('qr_pending')
        })
        .catch((err) => {
          setErrorMessage(err instanceof Error ? err.message : 'Erro ao reconectar')
          setState('error')
        })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reconnectSession])

  const handleCreate = useCallback(async () => {
    setState('loading')
    try {
      const result = await createMutation.mutateAsync(displayName || undefined)
      setSessionName(result.session_name)
      setQrBase64(result.qr_code_base64)
      setState('qr_pending')
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Erro ao criar sessao')
      setState('error')
    }
  }, [createMutation, displayName])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Conectar WhatsApp (QR Code)</DialogTitle>
        </DialogHeader>

        {state === 'idle' && !reconnectSession && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="waha-display-name">Nome de exibicao (opcional)</Label>
              <Input
                id="waha-display-name"
                placeholder="Ex: Atendimento, Vendas..."
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
            <Button className="w-full" onClick={handleCreate}>
              Criar e gerar QR
            </Button>
          </div>
        )}

        {state === 'loading' && (
          <div className="flex flex-col items-center justify-center gap-3 py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Preparando...</p>
          </div>
        )}

        {state === 'qr_pending' && (
          <div className="flex flex-col items-center gap-4 py-4">
            {qrBase64 ? (
              <img src={qrBase64} alt="QR Code WhatsApp" className="h-64 w-64 rounded-lg border" />
            ) : (
              <div className="flex h-64 w-64 items-center justify-center rounded-lg border bg-muted">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )}
            <div className="space-y-1 text-center">
              <p className="text-sm font-medium">Escaneie o QR code</p>
              <p className="text-xs text-muted-foreground">
                Abra o WhatsApp &rarr; Aparelhos conectados &rarr; Conectar um aparelho
              </p>
              <p className="text-xs text-muted-foreground">O QR expira em 2 minutos. Pareie rapido.</p>
            </div>
          </div>
        )}

        {state === 'connected' && (
          <div className="flex flex-col items-center justify-center gap-3 py-8">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <p className="text-sm font-medium">Conectado com sucesso!</p>
          </div>
        )}

        {state === 'error' && (
          <div className="flex flex-col items-center justify-center gap-4 py-8">
            <AlertTriangle className="h-10 w-10 text-destructive" />
            <p className="text-center text-sm text-destructive">{errorMessage}</p>
            <Button variant="outline" onClick={() => setState('idle')}>
              Tentar novamente
            </Button>
          </div>
        )}

        {state === 'expired' && (
          <div className="flex flex-col items-center justify-center gap-4 py-8">
            <AlertTriangle className="h-10 w-10 text-yellow-500" />
            <p className="text-center text-sm text-muted-foreground">
              O QR code expirou. Gere um novo para tentar de novo.
            </p>
            <Button variant="outline" onClick={() => setState('idle')}>
              Gerar novo QR
            </Button>
          </div>
        )}

        <DialogFooter>
          {state !== 'connected' && (
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
