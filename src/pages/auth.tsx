import { useState, useEffect } from 'react'
import { Navigate, useSearchParams, Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { LoginForm } from '@/components/auth/login-form'
import { useAuthStore } from '@/stores/auth.store'
import { resetPassword } from '@/services/auth.service'
import { Loader2 } from 'lucide-react'

const ERROR_MESSAGES: Record<string, string> = {
  company_inactive: 'Sua conta foi desativada. Entre em contato com o suporte.',
  no_subscription: 'Sua empresa nao possui uma assinatura ativa do Veltzy. Entre em contato com o suporte.',
}

const AuthPage = () => {
  const { user, isLoading } = useAuthStore()
  const [searchParams, setSearchParams] = useSearchParams()
  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetLoading, setResetLoading] = useState(false)

  useEffect(() => {
    const errorCode = searchParams.get('error')
    if (errorCode && ERROR_MESSAGES[errorCode]) {
      toast.error(ERROR_MESSAGES[errorCode])
      searchParams.delete('error')
      setSearchParams(searchParams, { replace: true })
    }
  }, [searchParams, setSearchParams])

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (user) {
    return <Navigate to="/" replace />
  }

  const handleResetPassword = async () => {
    if (!resetEmail) return
    setResetLoading(true)
    try {
      await resetPassword(resetEmail)
      toast.success('Email de recuperacao enviado!')
      setShowForgotPassword(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao enviar email'
      toast.error(message)
    } finally {
      setResetLoading(false)
    }
  }

  return (
    <div className="ambient-bg flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold text-xl">
            V
          </div>
          <h1 className="text-2xl font-bold text-gradient-primary">Veltzy</h1>
          <p className="text-sm text-muted-foreground">CRM inteligente para sua equipe</p>
        </div>

        <Card className="glass-card">
          <CardContent className="pt-6">
            {showForgotPassword ? (
              <div className="space-y-4">
                <CardHeader className="p-0 pb-4">
                  <CardTitle className="text-lg">Recuperar Senha</CardTitle>
                  <CardDescription>
                    Digite seu email para receber o link de recuperacao
                  </CardDescription>
                </CardHeader>
                <div className="space-y-2">
                  <Label htmlFor="reset-email">Email</Label>
                  <Input
                    id="reset-email"
                    type="email"
                    placeholder="seu@email.com"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setShowForgotPassword(false)}
                  >
                    Voltar
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={handleResetPassword}
                    disabled={resetLoading}
                  >
                    {resetLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Enviar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <LoginForm onForgotPassword={() => setShowForgotPassword(true)} />
                <p className="text-center text-sm text-muted-foreground">
                  Nao tem conta?{' '}
                  <Link to="/auth/cadastro" className="text-primary hover:underline font-medium">
                    Criar conta
                  </Link>
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="mt-6 flex items-center justify-center gap-3 text-center text-xs text-muted-foreground">
          <Link to="/privacidade" className="hover:text-foreground hover:underline">
            Política de Privacidade
          </Link>
          <span aria-hidden="true">·</span>
          <Link to="/termos" className="hover:text-foreground hover:underline">
            Termos de Serviço
          </Link>
        </p>
      </div>
    </div>
  )
}

export default AuthPage
