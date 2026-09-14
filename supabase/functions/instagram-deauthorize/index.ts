import { getCorsHeaders } from '../_shared/cors.ts'
import { revokeFromSignedRequest } from '../_shared/instagram-revoke.ts'

// Instagram DM, Onda 1 (Spec 5.5): "Deauthorize callback URL" do painel da Meta.
// Chamado quando a conta remove o app nas configuracoes do Instagram.

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const outcome = await revokeFromSignedRequest(req, 'App removido pelo Instagram')
    if (!outcome.valid) return json({ error: 'signed_request_invalido' }, 400)

    if (outcome.companyIds.length === 0) {
      console.log('[instagram-deauthorize] sem conexao correspondente')
    } else {
      console.log('[instagram-deauthorize] conexao revogada', { companyIds: outcome.companyIds })
    }
    return json({ ok: true })
  } catch (err) {
    console.error('[instagram-deauthorize] error:', err instanceof Error ? err.message : String(err))
    return json({ error: 'Erro inesperado' }, 500)
  }
})
