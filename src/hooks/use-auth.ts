import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth.store'
import * as authService from '@/services/auth.service'
import { logAuditEvent } from '@/lib/audit'
import type { AppRole } from '@/types/database'

export const useAuth = () => {
  const store = useAuthStore()
  const navigate = useNavigate()

  const signIn = async (email: string, password: string) => {
    try {
      const data = await authService.signIn(email, password)
      const userId = data.user?.id ?? null
      // Audit fora do caminho critico: nao bloqueia o login e roda no proximo
      // tick, longe do pico de refresh/loadUserData, sem chamada de auth extra.
      setTimeout(() => {
        void logAuditEvent('login_success', { method: 'email' }, undefined, userId)
      }, 0)
    } catch (err) {
      setTimeout(() => {
        void logAuditEvent('login_failed', { email, method: 'email' }, undefined, null)
      }, 0)
      throw err
    }
  }

  const signOut = async () => {
    const companyId = store.activeCompanyId
    await logAuditEvent('logout', {}, companyId ?? undefined)
    await authService.signOut()
    store.clear()
    navigate('/auth')
  }

  const hasRole = (role: AppRole) => store.roles.includes(role)

  const hasPermission = (key: string): boolean => {
    return store.permissions.includes(key)
  }

  const isSuperAdmin = (): boolean => {
    return store.roles.includes('super_admin')
  }

  const isRepresentative = (): boolean => {
    return store.roles.includes('representative') &&
      !store.roles.includes('admin') &&
      !store.roles.includes('manager')
  }

  return {
    user: store.user,
    profile: store.profile,
    company: store.company,
    roles: store.roles,
    permissions: store.permissions,
    companies: store.companies,
    activeCompanyId: store.activeCompanyId,
    isLoading: store.isLoading,
    isAuthenticated: !!store.user,
    hasCompany: !!store.company,
    signIn,
    signOut,
    hasRole,
    hasPermission,
    isSuperAdmin,
    isRepresentative,
    switchCompany: store.switchCompany,
  }
}
