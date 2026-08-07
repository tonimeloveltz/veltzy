import { Navigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuthStore } from '@/stores/auth.store'
import { useFeatureFlagStatus } from '@/hooks/use-feature-flag'
import type { AppRole } from '@/types/database'

interface ProtectedRouteProps {
  children: React.ReactNode
  skipCompanyCheck?: boolean
  requireRole?: AppRole[]
  requirePermission?: string
  /** Quando setada, exige que a feature flag do tenant esteja habilitada (alem da role). */
  requireFeature?: string
}

/**
 * Cruza a role (ja validada pelo ProtectedRoute) com a feature flag do tenant.
 * Montado APENAS quando requireFeature esta setada, para nao chamar o hook de
 * flag nas rotas que nao usam feature (rules-of-hooks). Enquanto a flag carrega
 * (isLoading), NAO redireciona: mostra loader e so decide quando a flag resolve.
 * Redirecionar durante o loading jogaria um usuario COM direito para fora.
 */
const FeatureGate = ({
  feature,
  children,
}: {
  feature: string
  children: React.ReactNode
}) => {
  const { enabled, isLoading } = useFeatureFlagStatus(feature)

  if (isLoading) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!enabled) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}

const ProtectedRoute = ({
  children,
  skipCompanyCheck = false,
  requireRole,
  requirePermission,
  requireFeature,
}: ProtectedRouteProps) => {
  const { user, company, roles, permissions, isLoading } = useAuthStore()

  if (isLoading) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/auth" replace />
  }

  if (!skipCompanyCheck && !company) {
    // Se está aceitando convite, aguarda sem redirecionar
    const acceptingInvite = sessionStorage.getItem('accepting_invite')
    const inviteAccepted = sessionStorage.getItem('invite_accepted')
    if (acceptingInvite || inviteAccepted) {
      return (
        <div className="flex h-dvh items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )
    }
    // Sem empresa e sem convite — volta para login
    return <Navigate to="/auth" replace />
  }

  // Limpa flag apos company carregar
  if (company) {
    sessionStorage.removeItem('invite_accepted')
    sessionStorage.removeItem('accepting_invite')
  }

  if (requireRole && !requireRole.some((r) => roles.includes(r))) {
    return <Navigate to="/acesso-negado" replace />
  }

  if (requirePermission && !permissions.includes(requirePermission)) {
    return <Navigate to="/acesso-negado" replace />
  }

  // Role/permissao ja validadas acima. A flag e o ultimo gate: delegada ao
  // FeatureGate (montado so aqui) para tratar o loading assincrono sem barrar
  // quem tem direito.
  if (requireFeature) {
    return <FeatureGate feature={requireFeature}>{children}</FeatureGate>
  }

  return <>{children}</>
}

export { ProtectedRoute }
