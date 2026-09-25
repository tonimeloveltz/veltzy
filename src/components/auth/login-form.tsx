import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/hooks/use-auth'

const loginSchema = z.object({
  email: z.string().email('E-mail inválido'),
  // Login nao aplica politica de criacao (M6): quem tem senha antiga de 6 ou 7
  // caracteres, aceita pelo servidor na epoca, ficava barrado aqui antes de tentar.
  // A politica vale onde a senha nasce: convite, troca de senha e Auth hospedado.
  password: z.string().min(1, 'Informe a senha'),
})

type LoginValues = z.infer<typeof loginSchema>

interface LoginFormProps {
  onForgotPassword: () => void
}

const authErrorMessages: Record<string, string> = {
  'Email not confirmed': 'Confirme seu email antes de entrar. Verifique sua caixa de entrada.',
  'Invalid login credentials': 'Email ou senha incorretos.',
  'User not found': 'Usuario nao encontrado.',
  'Too many requests': 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
}

const getFriendlyError = (message: string) =>
  authErrorMessages[message] ?? 'Ocorreu um erro. Tente novamente.'

const LoginForm = ({ onForgotPassword }: LoginFormProps) => {
  const { signIn } = useAuth()
  const [isLoading, setIsLoading] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
  })

  const onSubmit = async (values: LoginValues) => {
    setIsLoading(true)
    try {
      await signIn(values.email, values.password)
      toast.success('Login realizado com sucesso!')
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Erro ao fazer login'
      toast.error(getFriendlyError(raw))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="login-email">Email</Label>
          <Input
            id="login-email"
            type="email"
            placeholder="seu@email.com"
            {...register('email')}
          />
          {errors.email && (
            <p className="text-xs text-destructive">{errors.email.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="login-password">Senha</Label>
            <button
              type="button"
              onClick={onForgotPassword}
              className="text-xs text-primary hover:underline"
            >
              Esqueceu a senha?
            </button>
          </div>
          <Input
            id="login-password"
            type="password"
            placeholder="******"
            autoComplete="current-password"
            {...register('password')}
          />
          {errors.password && (
            <p className="text-xs text-destructive">{errors.password.message}</p>
          )}
        </div>

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Entrar
        </Button>
      </form>
    </div>
  )
}

export { LoginForm }
