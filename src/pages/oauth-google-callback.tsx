import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { PageLoadingSkeleton } from '@/components/shared/page-loading-skeleton'
import { GOOGLE_CALENDAR_CONNECTION_KEY } from '@/hooks/use-google-calendar'
import { completeCallback, takeStoredAuthState } from '@/services/google-calendar.service'
import { useQueryClient } from '@tanstack/react-query'

const INTEGRATIONS_TAB = '/minha-conta?tab=integracoes'

/**
 * Volta do consentimento do Google. Confere o nonce guardado no sessionStorage
 * antes de trocar o codigo, redireciona para Minha Conta em qualquer desfecho.
 */
const OAuthGoogleCallbackPage = () => {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  // A troca do codigo so pode acontecer uma vez: o code do Google e de uso
  // unico, e o StrictMode monta o efeito duas vezes em desenvolvimento.
  const startedRef = useRef(false)

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true

    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const googleError = searchParams.get('error')
    const expectedState = takeStoredAuthState()

    const run = async () => {
      if (googleError) {
        setError(
          googleError === 'access_denied'
            ? 'Voce recusou o acesso a agenda. Nada foi conectado.'
            : `O Google recusou a autorizacao: ${googleError}`,
        )
        return
      }

      if (!code) {
        setError('O Google nao devolveu o codigo de autorizacao.')
        return
      }

      if (!state || state !== expectedState) {
        setError('A autorizacao nao confere com a que foi iniciada aqui. Tente conectar de novo.')
        return
      }

      try {
        const googleEmail = await completeCallback(code, state)
        queryClient.invalidateQueries({ queryKey: [GOOGLE_CALENDAR_CONNECTION_KEY] })
        toast.success(`Google Agenda conectado: ${googleEmail}`)
        navigate(INTEGRATIONS_TAB, { replace: true })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao conectar Google Agenda')
      }
    }

    run()
  }, [searchParams, navigate, queryClient])

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <AlertTriangle className="h-8 w-8 text-destructive" />
        <div className="space-y-1">
          <p className="font-medium">Nao foi possivel conectar o Google Agenda</p>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
        <Button onClick={() => navigate(INTEGRATIONS_TAB, { replace: true })}>
          Voltar para Minha Conta
        </Button>
      </div>
    )
  }

  return <PageLoadingSkeleton />
}

export default OAuthGoogleCallbackPage
