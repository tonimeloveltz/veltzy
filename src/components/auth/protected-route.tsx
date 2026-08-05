import { Navigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuthStore } from '@/stores/auth.store'
import type { AppRole } from '@/types/database'

interface ProtectedRouteProps {
  children: React.ReactNode
  skipCompanyCheck?: boolean
  requireRole?: AppRole[]
  requirePermission?: string
}

const ProtectedRoute = ({
  children,
  skipCompanyCheck = false,
  requireRole,
  requirePermission,
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

  return <>{children}</>
}

export { ProtectedRoute }
