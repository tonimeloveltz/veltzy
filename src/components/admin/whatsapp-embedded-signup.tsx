import { useState } from 'react'
import { BadgeCheck, Loader2, CheckCircle2, AlertCircle, RotateCcw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useRoles } from '@/hooks/use-roles'
import { useCloudApiOnboard } from '@/hooks/use-cloud-api-onboard'
import { launchEmbeddedSignup, EMBEDDED_SIGNUP_CANCELLED } from '@/lib/meta-embedded-signup'
import { NumberConflictError } from '@/services/cloud-api-onboard.service'

type SignupState = 'idle' | 'loading' | 'exchanging' | 'connected' | 'cancelled' | 'error'

export const WhatsAppEmbeddedSignup = () => {
  const { isAdmin } = useRoles()
  const onboard = useCloudApiOnboard()
  const [state, setState] = useState<SignupState>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const handleConnect = async () => {
    setErrorMsg(null)
    setState('loading')
    try {
      const result = await launchEmbeddedSignup()
      setState('exchanging')
      await onboard.mutateAsync({
        code: result.code,
        phoneNumberId: result.phoneNumberId,
        wabaId: result.wabaId,
      })
      setState('connected')
    } catch (err) {
      if (err instanceof Error && err.message === EMBEDDED_SIGNUP_CANCELLED) {
        setState('cancelled')
        return
      }
      if (err instanceof NumberConflictError) {
        setErrorMsg(err.message)
        setState('error')
        return
      }
      setErrorMsg(err instanceof Error ? err.message : 'Nao foi possivel conectar o numero.')
      setState('error')
    }
  }

  const busy = state === 'loading' || state === 'exchanging'

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
            <BadgeCheck className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <CardTitle className="text-base">WhatsApp API Oficial</CardTitle>
            <CardDescription>Conecte o numero oficial da sua empresa.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!isAdmin ? (
          <p className="text-sm text-muted-foreground">
            Apenas administradores podem conectar um numero.
          </p>
        ) : state === 'connected' ? (
          <div className="flex flex-col items-start gap-3">
            <div className="flex items-center gap-2 text-sm font-medium text-green-600">
              <CheckCircle2 className="h-4 w-4" />
              Numero oficial conectado com sucesso.
            </div>
            <Button size="sm" variant="outline" onClick={() => setState('idle')}>
              Conectar outro numero
            </Button>
          </div>
        ) : state === 'error' ? (
          <div className="flex flex-col items-start gap-3">
            <div className="flex items-center gap-2 text-sm font-medium text-destructive">
              <AlertCircle className="h-4 w-4" />
              {errorMsg ?? 'Nao foi possivel conectar o numero.'}
            </div>
            <Button size="sm" variant="outline" onClick={handleConnect}>
              <RotateCcw className="h-4 w-4 mr-1" />
              Tentar novamente
            </Button>
          </div>
        ) : state === 'cancelled' ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-muted-foreground">Conexao cancelada.</p>
            <Button size="sm" variant="outline" onClick={handleConnect}>
              <RotateCcw className="h-4 w-4 mr-1" />
              Tentar novamente
            </Button>
          </div>
        ) : (
          <Button size="sm" onClick={handleConnect} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            {state === 'loading'
              ? 'Abrindo conexao...'
              : state === 'exchanging'
                ? 'Finalizando conexao...'
                : 'Conectar numero oficial'}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
