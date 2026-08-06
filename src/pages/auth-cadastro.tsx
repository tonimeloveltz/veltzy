import { Navigate, Link } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { RegisterForm } from '@/components/auth/register-form'
import { useAuthStore } from '@/stores/auth.store'
import { Loader2 } from 'lucide-react'

const AuthCadastroPage = () => {
  const { user, isLoading } = useAuthStore()

  if (isLoading) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (user) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="ambient-bg flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold text-xl">
            V
          </div>
          <h1 className="text-2xl font-bold text-gradient-primary">Criar sua conta</h1>
          <p className="text-sm text-muted-foreground">
            Apos o cadastro, voce podera criar sua empresa
          </p>
        </div>

        <Card className="glass-card">
          <CardContent className="pt-6">
            <RegisterForm />
            <p className="mt-4 text-center text-sm text-muted-foreground">
              Ja tem conta?{' '}
              <Link to="/auth" className="text-primary hover:underline font-medium">
                Fazer login
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default AuthCadastroPage
