import { supabase } from '@/lib/supabase'

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

/**
 * Registra evento de auditoria via RPC (M8).
 *
 * O INSERT direto em `auth_audit_log` saiu de proposito: a policy antiga era
 * `TO anon WITH CHECK (true)`, entao qualquer um com a anon key forjava linha
 * escolhendo user_id, ip e user_agent, e o log deixava de valer como prova.
 *
 * Quem decide os tres agora e a funcao no banco: `user_id` sai de `auth.uid()`
 * e `ip_address`/`user_agent` sao carimbados do request. Por isso nao existe
 * mais parametro de userId aqui, nem leitura do store: o chamador nao tem como
 * dizer quem foi, so o token diz. Em `login_failed`, que roda sem sessao, o
 * user_id fica nulo, que ja era o comportamento anterior.
 */
export const logAuditEvent = async (
  event: AuditEvent,
  metadata: Record<string, unknown> = {},
  companyId?: string
) => {
  try {
    const { error } = await supabase.rpc('log_auth_event', {
      p_event: event,
      p_company_id: companyId ?? null,
      p_metadata: metadata,
    })
    if (!error) return

    // A RPC nasce na fase 1 (hub 20260909130000). Se este bundle subir antes da
    // migration, PGRST202 e "funcao nao encontrada no schema cache": cair no
    // INSERT antigo evita a janela em que o log some calado, que e justamente o
    // que o M8 quer impedir. A fase 3 revoga esse INSERT, e ai o fallback deixa
    // de ter efeito e pode sair daqui.
    if (error.code !== 'PGRST202') throw error
    console.warn('[Audit] log_auth_event ausente, usando INSERT direto (pre fase 1)')

    const { error: insertError } = await supabase.from('auth_audit_log').insert({
      company_id: companyId ?? null,
      event,
      metadata,
    })
    if (insertError) throw insertError
  } catch (err) {
    console.error('[Audit] Erro ao registrar evento:', err)
  }
}
