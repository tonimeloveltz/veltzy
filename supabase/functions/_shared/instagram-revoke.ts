// Revogacao da conexao do Instagram a partir do signed_request da Meta.
// Compartilhado por instagram-deauthorize e instagram-data-deletion (Spec 5.5):
// os dois callbacks fazem a mesma coisa com a conexao e so respondem diferente.
// Nunca logar o signed_request.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import { parseSignedRequest } from './instagram-signed-request.ts'
import { guardarSegredo, instagramTokenSecretName } from './vault-secret.ts'

export type RevokeOutcome =
  | { valid: false }
  | { valid: true; companyIds: string[] }

/**
 * Le o form da Meta, valida o signed_request e desativa toda conexao cujo
 * instagram_app_user_id ou instagram_account_id bate com o user_id. O token do
 * Vault e sobrescrito com '' (lerSegredo trata vazio como ausente) e a linha fica
 * como registro de que a conexao existiu. Leads e mensagens nao sao tocados.
 */
export async function revokeFromSignedRequest(req: Request, lastError: string): Promise<RevokeOutcome> {
  const form = new URLSearchParams(await req.text().catch(() => ''))
  const payload = await parseSignedRequest(form.get('signed_request') ?? '', Deno.env.get('INSTAGRAM_APP_SECRET') ?? '')
  if (!payload) return { valid: false }

  const url = Deno.env.get('SUPABASE_URL')!
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(url, key, { db: { schema: 'veltzy' } })
  const supabasePublic = createClient(url, key)

  const [byAppUser, byAccount] = await Promise.all([
    supabase.from('instagram_connections').select('id, company_id').eq('instagram_app_user_id', payload.user_id),
    supabase.from('instagram_connections').select('id, company_id').eq('instagram_account_id', payload.user_id),
  ])
  const rows = new Map<string, string>()
  for (const row of [...(byAppUser.data ?? []), ...(byAccount.data ?? [])]) rows.set(row.id, row.company_id)

  const companyIds: string[] = []
  for (const [id, companyId] of rows) {
    try {
      await guardarSegredo(supabasePublic, instagramTokenSecretName(companyId), '')
      await supabase
        .from('instagram_connections')
        .update({ is_active: false, status: 'revoked', last_error: lastError })
        .eq('id', id)
      companyIds.push(companyId)
    } catch (err) {
      console.error('[instagram-revoke] falha ao revogar', {
        connectionId: id,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return { valid: true, companyIds }
}
