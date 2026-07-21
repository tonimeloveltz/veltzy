import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updatePassword } from '@/services/auth.service'
import { passwordSchema } from '@/lib/password-rules'
import { PasswordChecklist } from '@/components/auth/password-checklist'

const formSchema = z.object({
  password: passwordSchema,
  confirmPassword: z.string().min(8, 'Minimo 8 caracteres'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Senhas nao conferem',
  path: ['confirmPassword'],
})

type PasswordValues = z.infer<typeof formSchema>

const UpdatePasswordPage = () => {
  const navigate = useNavigate()
  const [isLoading, setIsLoading] = useState(false)

  const { register, handleSubmit, watch, formState: { errors } } = useForm<PasswordValues>({
    resolver: zodResolver(formSchema),
  })

  // watch reavalia a cada tecla: o checklist acende em tempo real.
  const senha = watch('password') ?? ''

  const onSubmit = async (values: PasswordValues) => {
    setIsLoading(true)
    try {
      await updatePassword(values.password)
      toast.success('Senha atualizada com sucesso!')
      navigate('/')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao atualizar senha'
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="ambient-bg flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md animate-fade-in">
        <Card className="glass-card">
          <CardHeader>
            <CardTitle>Nova Senha</CardTitle>
            <CardDescription>Digite sua nova senha</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">Nova Senha</Label>
                <Input
                  id="new-password"
                  type="password"
                  placeholder="******"
                  {...register('password')}
                />
                {/* Checklist no lugar da mensagem de erro da senha. */}
                <PasswordChecklist senha={senha} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-new-password">Confirmar Senha</Label>
                <Input
                  id="confirm-new-password"
                  type="password"
                  placeholder="******"
                  {...register('confirmPassword')}
                />
                {errors.confirmPassword && (
                  <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Atualizar Senha
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default UpdatePasswordPage
