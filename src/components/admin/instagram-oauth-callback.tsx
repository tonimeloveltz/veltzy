import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useInstagramOAuthCallback } from '@/hooks/use-instagram-oauth-callback'

const INTEGRATIONS_PATH = '/admin?tab=integracoes'
const SUCCESS_REDIRECT_MS = 1500

const InstagramOAuthCallback = () => {
  const { status, message } = useInstagramOAuthCallback()
  const navigate = useNavigate()

  useEffect(() => {
    if (status !== 'success') return
    const timer = setTimeout(() => navigate(INTEGRATIONS_PATH, { replace: true }), SUCCESS_REDIRECT_MS)
    return () => clearTimeout(timer)
  }, [status, navigate])

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
          {status === 'loading' && <Loader2 className="h-8 w-8 animate-spin text-primary" />}
          {status === 'success' && <CheckCircle2 className="h-8 w-8 text-primary" />}
          {status === 'error' && <AlertTriangle className="h-8 w-8 text-destructive" />}
          <p className="text-sm">{message}</p>
          {status === 'error' && (
            <Button variant="outline" onClick={() => navigate(INTEGRATIONS_PATH, { replace: true })}>
              Voltar para integrações
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export { InstagramOAuthCallback }
