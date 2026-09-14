import { getCorsHeaders } from '../_shared/cors.ts'
import { revokeFromSignedRequest } from '../_shared/instagram-revoke.ts'

// Instagram DM, Onda 1 (Spec 5.5, PRD secao 8): "Data deletion request URL".
// Apaga o token e desativa a conexao da conta que pediu. Conversas pertencem ao
// controlador (a empresa cliente) e nao sao apagadas por este callback.

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const outcome = await revokeFromSignedRequest(req, 'Exclusao de dados solicitada pelo Instagram')
    if (!outcome.valid) return json({ error: 'signed_request_invalido' }, 400)

    const confirmationCode = crypto.randomUUID()
    // Sem dado pessoal no log: so o codigo e as empresas afetadas.
    console.log('[instagram-data-deletion] pedido registrado', {
      confirmation_code: confirmationCode,
      company_ids: outcome.companyIds,
    })

    const appUrl = Deno.env.get('APP_URL') ?? 'https://app.veltzy.com'
    return json({ url: `${appUrl}/privacidade`, confirmation_code: confirmationCode })
  } catch (err) {
    console.error('[instagram-data-deletion] error:', err instanceof Error ? err.message : String(err))
    return json({ error: 'Erro inesperado' }, 500)
  }
})
