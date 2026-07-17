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
import { passwordSchema } from '@/lib/password-rules'
import { PasswordChecklist } from '@/components/auth/password-checklist'

const registerSchema = z.object({
  name: z.string().min(2, 'Minimo 2 caracteres'),
  email: z.string().email('Email invalido'),
  password: passwordSchema,
  confirmPassword: z.string().min(8, 'Minimo 8 caracteres'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Senhas nao conferem',
  path: ['confirmPassword'],
})

type RegisterValues = z.infer<typeof registerSchema>

const RegisterForm = () => {
  const { signUp } = useAuth()
  const [isLoading, setIsLoading] = useState(false)

  const { register, handleSubmit, watch, formState: { errors } } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
  })

  // watch reavalia a cada tecla, entao o checklist acende em tempo real sem
  // depender de submit nem blur (o form segue em mode onSubmit para os erros).
  const senha = watch('password') ?? ''

  const onSubmit = async (values: RegisterValues) => {
    setIsLoading(true)
    try {
      await signUp(values.email, values.password, values.name)
      toast.success('Conta criada! Verifique seu email para confirmar.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao criar conta'
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="register-name">Nome</Label>
        <Input
          id="register-name"
          placeholder="Seu nome"
          {...register('name')}
        />
        {errors.name && (
          <p className="text-xs text-destructive">{errors.name.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="register-email">Email</Label>
        <Input
          id="register-email"
          type="email"
          placeholder="seu@email.com"
          {...register('email')}
        />
        {errors.email && (
          <p className="text-xs text-destructive">{errors.email.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="register-password">Senha</Label>
        <Input
          id="register-password"
          type="password"
          placeholder="******"
          autoComplete="new-password"
          {...register('password')}
        />
        {/* O checklist substitui a mensagem de erro da senha: cada regra vira
            um item que acende sozinho. O erro do confirmPassword continua abaixo. */}
        <PasswordChecklist senha={senha} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="register-confirm">Confirmar Senha</Label>
        <Input
          id="register-confirm"
          type="password"
          placeholder="******"
          autoComplete="new-password"
          {...register('confirmPassword')}
        />
        {errors.confirmPassword && (
          <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Criar Conta
      </Button>
    </form>
  )
}

export { RegisterForm }
