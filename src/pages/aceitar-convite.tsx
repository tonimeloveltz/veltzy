import { useState, useEffect, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth.store'
import { logAuditEvent } from '@/lib/audit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { passwordSchema } from '@/lib/password-rules'
import { PasswordChecklist } from '@/components/auth/password-checklist'
import type { Invitation } from '@/types/database'

const registerSchema = z.object({
  full_name: z.string().min(2, 'Mínimo 2 caracteres'),
  // Antes so exigia min(8), aceitando senha fraca. Agora usa a fonte unica:
  // as 4 regras (maiuscula, minuscula, numero) passam a valer aqui tambem.
  password: passwordSchema,
  confirm_password: z.string(),
}).refine((data) => data.password === data.confirm_password, {
  message: 'Senhas não conferem',
  path: ['confirm_password'],
})

type RegisterValues = z.infer<typeof registerSchema>

type InviteState = 'loading' | 'valid' | 'invalid' | 'expired' | 'accepting' | 'accepted' | 'needs_register' | 'needs_login'

const roleLabels: Record<string, string> = {
  seller: 'Vendedor',
  manager: 'Gestor comercial',
  admin: 'Administrador',
  representative: 'Representante',
  super_admin: 'Super Admin',
}

const AceitarConvitePage = () => {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user, loadUserData } = useAuthStore()
  const token = searchParams.get('token')
  const handledRef = useRef(false)

  const [state, setState] = useState<InviteState>('loading')
  const [invite, setInvite] = useState<Invitation | null>(null)
  const [companyName, setCompanyName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [loginPassword, setLoginPassword] = useState('')
  const [loginError, setLoginError] = useState('')

  const { register, handleSubmit, watch, formState: { errors } } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
  })

  // watch reavalia a cada tecla: o checklist acende em tempo real.
  const senha = watch('password') ?? ''

  useEffect(() => {
    sessionStorage.setItem('accepting_invite', 'true')

    // Caso 0: Supabase retornou erro no hash (#error=access_denied&error_code=otp_expired)
    const hash = window.location.hash.substring(1)
    if (hash) {
      const hashParams = new URLSearchParams(hash)
      const error = hashParams.get('error')
      const errorCode = hashParams.get('error_code')
      if (error || errorCode) {
        console.error('[Convite] Erro do Supabase Auth:', error, errorCode, hashParams.get('error_description'))
        window.history.replaceState(null, '', window.location.pathname)
        sessionStorage.removeItem('accepting_invite')
        if (errorCode === 'otp_expired') {
          setState('expired')
        } else {
          setState('invalid')
        }
        return
      }
    }

    // Caso 1: Token do convite via query string (?token=...)
    if (token) {
      validateToken(token)
      return
    }

    // Caso 2: Chegou via redirect do Supabase (hash já consumido pelo client)
    const tryDetectSession = async () => {
      await new Promise(r => setTimeout(r, 500))

      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user && !handledRef.current) {
        handledRef.current = true
        await handleAuthenticatedInvite(session.user.id, session.user.email!)
        return
      }

      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        (event, sess) => {
          if (handledRef.current) return
          if (event === 'SIGNED_IN' && sess?.user) {
            handledRef.current = true
            handleAuthenticatedInvite(sess.user.id, sess.user.email!)
            subscription.unsubscribe()
          }
        }
      )

      setTimeout(() => {
        if (!handledRef.current) {
          subscription.unsubscribe()
          sessionStorage.removeItem('accepting_invite')
          setState('invalid')
        }
      }, 8000)
    }

    tryDetectSession()
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAuthenticatedInvite = async (_userId: string, userEmail: string) => {
    try {
      console.log('[Convite] Buscando convite pendente para:', userEmail)

      const { data: pendingInvite, error: inviteError } = await supabase
        .from('invitations')
        .select('*')
        .eq('email', userEmail)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      console.log('[Convite] Resultado busca:', { pendingInvite, inviteError })

      if (inviteError || !pendingInvite) {
        console.warn('[Convite] Nenhum convite pendente para:', userEmail)
        sessionStorage.removeItem('accepting_invite')
        setState('invalid')
        return
      }

      // Encontrou convite — mostra formulário para criar senha
      setInvite(pendingInvite)
      setCompanyName(pendingInvite.company_name ?? '')
      setState('needs_register')
    } catch (err) {
      console.error('[Convite] Erro:', err)
      sessionStorage.removeItem('accepting_invite')
      setState('invalid')
    }
  }

  const validateToken = async (t: string) => {
    console.log('[Convite] Validando token:', t)

    // Leitura por token via RPC SECURITY DEFINER: a tabela invitations nao e
    // mais legivel direto (fix C1). A RPC retorna no maximo 1 linha.
    const { data: rows, error } = await supabase
      .rpc('get_invitation_by_token', { p_token: t })
    const data = rows?.[0] ?? null

    console.log('[Convite] Resultado validateToken:', { data, error })

    if (error || !data) {
      localStorage.removeItem('pending_invite_token')
      sessionStorage.removeItem('accepting_invite')
      setState('invalid')
      return
    }

    if (data.status !== 'pending') {
      localStorage.removeItem('pending_invite_token')
      sessionStorage.removeItem('accepting_invite')
      // Se já foi aceito, redireciona para login
      if (data.status === 'accepted') {
        toast.info('Este convite já foi aceito. Faça login para acessar.')
        navigate('/auth')
        return
      }
      setState(data.status === 'expired' ? 'expired' : 'invalid')
      return
    }

    if (new Date(data.expires_at) < new Date()) {
      localStorage.removeItem('pending_invite_token')
      sessionStorage.removeItem('accepting_invite')
      setState('expired')
      return
    }

    localStorage.setItem('pending_invite_token', t)

    setInvite(data)
    setCompanyName(data.company_name ?? '')

    if (user) {
      setState('valid')
    } else {
      const { data: session } = await supabase.auth.getSession()
      if (session.session?.user) {
        setState('valid')
      } else {
        const { data: existingProfile } = await supabase
          .from('profiles')
          .select('user_id')
          .eq('email', data.email)
          .single()

        if (existingProfile?.user_id) {
          setState('needs_login')
        } else {
          setState('needs_register')
        }
      }
    }
  }

  const acceptInvite = async () => {
    if (!invite) return
    setState('accepting')

    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser()
      if (!currentUser) throw new Error('Usuário não autenticado')

      const { data: rpcResult, error: rpcError } = await supabase.rpc('accept_invitation', {
        p_invitation_id: invite.id,
      })

      if (rpcError) throw rpcError
      if (rpcResult && !rpcResult.success) {
        if (rpcResult.error?.includes('invalido') || rpcResult.error?.includes('expirado')) {
          setState('accepted')
          toast.success('Convite já foi aceito!')
          setTimeout(() => navigate('/'), 2000)
          return
        }
        throw new Error(rpcResult.error ?? 'Erro ao aceitar convite')
      }

      await logAuditEvent('invite_accepted', {
        invite_id: invite.id,
        role: invite.role,
      }, invite.company_id)

      await loadUserData(currentUser.id)
      sessionStorage.setItem('invite_accepted', 'true')
      sessionStorage.removeItem('accepting_invite')
      localStorage.removeItem('pending_invite_token')

      setState('accepted')
      toast.success('Convite aceito com sucesso!')
      navigate('/')
    } catch (err) {
      console.error('Erro ao aceitar convite:', err)
      toast.error('Erro ao aceitar convite')
      setState('valid')
    }
  }

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!invite || !loginPassword) return
    setIsSubmitting(true)
    setLoginError('')

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: invite.email,
        password: loginPassword,
      })

      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          setLoginError('Senha incorreta.')
        } else if (error.message.includes('Email not confirmed')) {
          setLoginError('Confirme seu email antes de entrar.')
        } else {
          setLoginError(error.message)
        }
        return
      }

      if (!data.user) throw new Error('Erro ao fazer login')

      const { data: rpcResult, error: rpcError } = await supabase.rpc('accept_invitation', {
        p_invitation_id: invite.id,
      })

      if (rpcError) throw rpcError
      if (rpcResult && !rpcResult.success) {
        throw new Error(rpcResult.error ?? 'Erro ao aceitar convite')
      }

      localStorage.removeItem('pending_invite_token')
      sessionStorage.setItem('invite_accepted', 'true')
      sessionStorage.removeItem('accepting_invite')
      await loadUserData(data.user.id)
      setState('accepted')
      toast.success('Convite aceito com sucesso!')
      navigate('/')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao fazer login'
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const onRegister = async (values: RegisterValues) => {
    if (!invite) return
    setIsSubmitting(true)

    try {
      // Verifica se já tem sessão ativa (veio via invite link do Supabase)
      const { data: { session: currentSession } } = await supabase.auth.getSession()

      let userId: string

      if (currentSession?.user) {
        // Usuário já autenticado via invite link — setar senha e nome
        const { error: updateError } = await supabase.auth.updateUser({
          password: values.password,
          data: { name: values.full_name },
        })
        if (updateError) throw updateError
        userId = currentSession.user.id
      } else {
        // Conta nova: a Edge Function accept-invite cria a conta JA CONFIRMADA
        // (o link do convite ja provou a posse do email), evitando o segundo
        // email de confirmação. Gateada pelo token do convite.
        const { data: fnResult, error: fnError } = await supabase.functions.invoke(
          'accept-invite',
          { body: { token: invite.token, password: values.password, name: values.full_name } },
        )

        // account_exists: já há conta com esse email — manda para o login.
        const fnErrCode = (fnResult as { error?: string } | null)?.error
        if (fnErrCode === 'account_exists') {
          toast.info('Você já tem uma conta. Entre para aceitar o convite.')
          setState('needs_login')
          return
        }
        if (fnError || fnErrCode) {
          throw new Error(fnErrCode ?? 'Erro ao criar conta')
        }

        // Conta criada e confirmada: loga na hora (sem segundo email).
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: invite.email,
          password: values.password,
        })
        if (signInError || !signInData.user) throw signInError ?? new Error('Erro ao entrar')
        userId = signInData.user.id
      }

      // Aceitar convite via RPC (identidade vem da sessão; email conferido no banco)
      const { data: rpcResult, error: rpcError } = await supabase.rpc('accept_invitation', {
        p_invitation_id: invite.id,
        p_name: values.full_name,
      })

      if (rpcError) throw rpcError
      if (rpcResult && !rpcResult.success) {
        throw new Error(rpcResult.error ?? 'Erro ao aceitar convite')
      }

      localStorage.removeItem('pending_invite_token')
      sessionStorage.removeItem('accepting_invite')
      sessionStorage.setItem('invite_accepted', 'true')
      await loadUserData(userId)
      setState('accepted')
      toast.success('Conta criada e convite aceito!')
      navigate('/')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao criar conta'
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (state === 'loading') {
    return (
      <div className="flex h-dvh items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (state === 'invalid' || state === 'expired') {
    return (
      <div className="flex h-dvh items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <XCircle className="mx-auto h-12 w-12 text-destructive" />
            <CardTitle className="mt-4">
              {state === 'expired' ? 'Convite expirado' : 'Convite inválido'}
            </CardTitle>
            <CardDescription>
              {state === 'expired'
                ? 'Este link de convite expirou. Solicite um novo convite ao administrador.'
                : 'Este link de convite não é válido. Verifique o link ou solicite um novo convite.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button onClick={() => navigate('/auth')} variant="outline">
              Ir para o login
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (state === 'accepted') {
    return (
      <div className="flex h-dvh items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-green-500" />
            <CardTitle className="mt-4">Convite aceito!</CardTitle>
            <CardDescription>
              Você agora faz parte de {companyName}.
              {user ? ' Redirecionando...' : ' Verifique seu email para confirmar sua conta e fazer login.'}
            </CardDescription>
          </CardHeader>
          {!user && (
            <CardContent className="text-center">
              <Button onClick={() => navigate('/auth')} variant="outline">
                Ir para o login
              </Button>
            </CardContent>
          )}
        </Card>
      </div>
    )
  }

  if (state === 'valid' || state === 'accepting') {
    return (
      <div className="flex h-dvh items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Aceitar convite</CardTitle>
            <CardDescription>
              Você foi convidado para {companyName} como <strong>{roleLabels[invite?.role ?? ''] ?? invite?.role}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap justify-center gap-3">
            <Button variant="outline" onClick={() => navigate('/auth')}>
              Cancelar
            </Button>
            <Button onClick={acceptInvite} disabled={state === 'accepting'}>
              {state === 'accepting' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Aceitar convite
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const roleBadgeColors: Record<string, string> = {
    seller: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    representative: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
    manager: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    admin: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
    super_admin: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  }

  const inviteHeader = (
    <div className="mb-8 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold text-xl">
        V
      </div>
      <h1 className="text-2xl font-bold text-gradient-primary">Veltzy</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Você foi convidado para entrar como
      </p>
      <span className={`mt-2 inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${roleBadgeColors[invite?.role ?? ''] ?? 'bg-muted text-muted-foreground'}`}>
        {roleLabels[invite?.role ?? ''] ?? invite?.role}
      </span>
      <p className="mt-1 text-sm font-medium">{companyName}</p>
    </div>
  )

  if (state === 'needs_login') {
    return (
      <div className="ambient-bg flex min-h-dvh items-center justify-center p-4">
        <div className="w-full max-w-md animate-fade-in">
          {inviteHeader}
          <Card className="glass-card">
            <CardHeader className="text-center">
              <CardTitle className="text-lg">Entrar para aceitar convite</CardTitle>
              <CardDescription>
                Já existe uma conta com este email. Faça login para aceitar.
              </CardDescription>
            </CardHeader>
          <CardContent>
            <form onSubmit={onLogin} className="space-y-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={invite?.email ?? ''} disabled />
              </div>

              <div className="space-y-2">
                <Label htmlFor="login-password">Senha</Label>
                <Input
                  id="login-password"
                  type="password"
                  placeholder="Sua senha"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                />
                {loginError && (
                  <p className="text-xs text-destructive">{loginError}</p>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={isSubmitting || !loginPassword}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Entrar e aceitar convite
              </Button>
            </form>
          </CardContent>
        </Card>
        </div>
      </div>
    )
  }

  // needs_register
  return (
    <div className="ambient-bg flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-md animate-fade-in">
        {inviteHeader}
        <Card className="glass-card">
          <CardHeader className="text-center">
            <CardTitle className="text-lg">Criar sua conta</CardTitle>
            <CardDescription>Preencha os dados para continuar</CardDescription>
          </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onRegister)} className="space-y-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={invite?.email ?? ''} disabled />
            </div>

            <div className="space-y-2">
              <Label htmlFor="full_name">Nome completo</Label>
              <Input
                id="full_name"
                placeholder="Seu nome"
                {...register('full_name')}
              />
              {errors.full_name && (
                <p className="text-xs text-destructive">{errors.full_name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                placeholder="Mínimo 8 caracteres"
                {...register('password')}
              />
              {/* Checklist no lugar da mensagem de erro da senha. */}
              <PasswordChecklist senha={senha} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm_password">Confirmar senha</Label>
              <Input
                id="confirm_password"
                type="password"
                placeholder="Repita a senha"
                {...register('confirm_password')}
              />
              {errors.confirm_password && (
                <p className="text-xs text-destructive">{errors.confirm_password.message}</p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Criar conta e aceitar convite
            </Button>
          </form>
        </CardContent>
      </Card>
      </div>
    </div>
  )
}

export default AceitarConvitePage
