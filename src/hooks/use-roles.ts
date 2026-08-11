import { useAuthStore } from '@/stores/auth.store'
import type { AppRole } from '@/types/database'

/**
 * Fonte de verdade da derivacao de roles (ver AppRole em types/database).
 *
 * Matriz de acesso (navegacao/distribuicao):
 *   super_admin  Gestao: sim   Admin: sim   6 itens vendedor: sim   Auto-distribuicao: nao (nao atende leads)
 *   admin        Gestao: sim   Admin: sim   6 itens vendedor: sim   Auto-distribuicao: nao
 *   manager      Gestao: sim   Admin: nao   6 itens vendedor: sim   Auto-distribuicao: nao
 *   seller       Gestao: nao   Admin: nao   6 itens vendedor: sim   Auto-distribuicao: SIM
 *   representative Gestao: nao Admin: nao   6 itens vendedor: sim   Auto-distribuicao: NAO
 *
 * representative = "vendedor sem auto-distribuicao": ve os mesmos 6 itens-base do
 * seller (Dashboard, Pipeline, Inbox, Negocios, Contatos, Tarefas), NAO ve Gestao/Admin,
 * e NAO entra na fila de rodizio de leads (canReceiveAutoDistribution = isSellerOrRep && !isRepresentative).
 */
export const useRoles = () => {
  const roles = useAuthStore((s) => s.roles)

  const hasRole = (role: AppRole) => roles.includes(role)
  const isSuperAdmin = hasRole('super_admin')
  const isAdmin = hasRole('admin') || isSuperAdmin
  const isManager = hasRole('manager') || isAdmin
  const isRepresentative = hasRole('representative')
  const isSellerOrRep = hasRole('seller') || isRepresentative
  const canAccessGestao = isManager
  const canAccessAdmin = isAdmin
  const canReceiveAutoDistribution = isSellerOrRep && !isRepresentative

  return {
    roles,
    hasRole,
    isAdmin,
    isManager,
    isSuperAdmin,
    isRepresentative,
    isSellerOrRep,
    canAccessGestao,
    canAccessAdmin,
    canReceiveAutoDistribution,
  }
}
