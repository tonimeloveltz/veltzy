import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth.store'

export type AuditEvent =
  | 'login_success'
  | 'login_failed'
  | 'logout'
  | 'invite_sent'
  | 'invite_accepted'
  | 'invite_revoked'
  | 'role_changed'
  | 'company_switched'
  | 'password_reset'
  | 'google_oauth_linked'
  | 'login_new_device'

export const logAuditEvent = async (
  event: AuditEvent,
  metadata: Record<string, unknown> = {},
  companyId?: string,
  userId?: string | null
) => {
  try {
    // Nunca chamar supabase.auth.getUser() aqui: era uma chamada de auth extra
    // que competia no refresh do token no pico do login (race -> 400). O caller
    // fornece o userId; no fallback, lemos o store em memoria (sem rede).
    const resolvedUserId =
      userId !== undefined ? userId : (useAuthStore.getState().user?.id ?? null)

    await supabase.from('auth_audit_log').insert({
      user_id: resolvedUserId,
      company_id: companyId ?? null,
      event,
      metadata,
    })
  } catch (err) {
    console.error('[Audit] Erro ao registrar evento:', err)
  }
}
