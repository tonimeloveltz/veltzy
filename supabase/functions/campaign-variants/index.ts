import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'
import { HubClient, HubError, type OpenAIToolDef } from '../_shared/hub-client.ts'
import { MAX_MESSAGE_LENGTH, MAX_VARIANTS, validateVariant } from '../_shared/campaign-variants.ts'

// campaign-variants (SPEC campanha-variacoes-ia · B2): gera versões alternativas da
// mensagem livre de campanha via gateway ai-complete do Hub (feature
// campaign_message_variants). Devolve só versões que preservam EXATAMENTE as
// variáveis da original. A IA recebe só o texto da mensagem, nunca dado de lead.
// Auth: JWT do usuário (verify_jwt=true no config.toml) + papel admin/manager/super_admin
// (mesma regra do blast-dispatch). Gates: mkt_ativo_enabled e ai_msg_enabled.

const FEATURE = 'campaign_message_variants'
const MAX_NEW = MAX_VARIANTS - 1 // a original conta como uma versão
const EXTRA_ATTEMPTS = 2

function jsonResponse(body: unknown, corsHeaders: Record<string, string>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

const TOOL: OpenAIToolDef = {
  type: 'function',
  function: {
    name: 'return_variants',
    description: 'Devolve as versões reescritas da mensagem.',
    parameters: {
      type: 'object',
      properties: {
        variants: { type: 'array', items: { type: 'string' }, description: 'Versões reescritas, uma por item.' },
      },
      required: ['variants'],
    },
  },
}

const SYSTEM_PROMPT = `Voce reescreve mensagens de WhatsApp de uma empresa para seus contatos, em portugues do Brasil.
Regras:
- Mantenha o sentido, a oferta, o tom e um tamanho parecido com o da mensagem original. Mude a forma (palavras, ordem, abertura, fechamento).
- Copie cada variavel entre chaves duplas (ex.: {{nome}}) EXATAMENTE como esta na original. Nao remova nenhuma, nao crie outras, nao traduza.
- Nao use markdown, aspas em volta da mensagem nem comentarios.
- Cada versao deve ser diferente da original e das outras versoes.
Responda chamando a funcao return_variants.`

// deno-lint-ignore no-explicit-any
function parseVariants(data: any): string[] {
  const args = data?.tool_calls?.[0]?.function?.arguments
  const raw = typeof args === 'string' ? args : (typeof data?.content === 'string' ? data.content : '')
  try {
    const parsed = JSON.parse(raw)
    const arr = Array.isArray(parsed) ? parsed : parsed?.variants
    return Array.isArray(arr) ? arr.filter((v: unknown): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Metodo nao permitido' }, corsHeaders, 405)

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(url, key)

    // ---- Auth: usuário + empresa + papel ----
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonResponse({ error: 'Nao autorizado' }, corsHeaders, 401)
    const { data: { user }, error: authErr } = await admin.auth.getUser(authHeader.replace('Bearer ', ''))
    if (authErr || !user) return jsonResponse({ error: 'Nao autorizado' }, corsHeaders, 401)

    const { data: profile } = await admin
      .from('profiles').select('id, company_id').eq('user_id', user.id).single()
    if (!profile?.company_id) return jsonResponse({ error: 'Usuario sem empresa vinculada' }, corsHeaders, 400)
    const companyId = profile.company_id as string

    const { data: roles } = await admin.from('user_roles').select('role, company_id').eq('user_id', user.id)
    const allowed = (roles ?? []).some((r: { role: string; company_id: string | null }) =>
      r.role === 'super_admin' || (r.company_id === companyId && ['admin', 'manager'].includes(r.role)))
    if (!allowed) return jsonResponse({ error: 'Permissao negada', reason: 'forbidden' }, corsHeaders, 403)

    // ---- Gates por empresa ----
    const { data: company } = await admin.from('companies').select('features').eq('id', companyId).single()
    const features = (company?.features ?? {}) as Record<string, unknown>
    if (features.mkt_ativo_enabled !== true) {
      return jsonResponse({ error: 'Campanhas nao estao ativas para a empresa', reason: 'mkt_ativo_disabled' }, corsHeaders, 403)
    }
    if (features.ai_msg_enabled !== true) {
      return jsonResponse({ error: 'Geracao com IA nao esta ativa para a empresa', reason: 'ai_not_enabled' }, corsHeaders, 403)
    }

    // ---- Entrada ----
    const body = await req.json().catch(() => ({}))
    const message = typeof body.message === 'string' ? body.message.trim() : ''
    const count = Number(body.count)
    const avoid: string[] = Array.isArray(body.avoid)
      ? body.avoid.filter((v: unknown): v is string => typeof v === 'string').slice(0, MAX_VARIANTS)
      : []
    if (!message) return jsonResponse({ error: 'Mensagem vazia' }, corsHeaders, 400)
    if (message.length > MAX_MESSAGE_LENGTH) return jsonResponse({ error: 'Mensagem longa demais' }, corsHeaders, 400)
    if (!Number.isInteger(count) || count < 1 || count > MAX_NEW) {
      return jsonResponse({ error: `Quantidade de versoes invalida (1 a ${MAX_NEW})` }, corsHeaders, 400)
    }

    // ---- Geração com validação; tentativas extras só para o que faltar ----
    const hub = new HubClient()
    const accepted: string[] = []
    for (let attempt = 0; attempt <= EXTRA_ATTEMPTS && accepted.length < count; attempt++) {
      const missing = count - accepted.length
      const known = [...avoid, ...accepted]
      const res = await hub.complete({
        company_id: companyId,
        product: 'veltzy',
        feature: FEATURE,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Mensagem original:\n${message}\n\nGere ${missing} versao(oes) nova(s).` +
              (known.length ? `\n\nNao repita estes textos:\n${known.map((k) => `- ${k}`).join('\n')}` : ''),
          },
        ],
        tools: [TOOL],
        max_tokens: Math.min(4000, 400 + Math.ceil(message.length / 2) * missing),
        temperature: 0.9,
      })
      if (!res.ok || !res.data) throw new HubError(res.error?.code ?? 'NO_CONTENT', res.error?.message ?? 'sem conteudo', false)
      for (const v of parseVariants(res.data)) {
        if (accepted.length >= count) break
        const text = v.trim()
        if (validateVariant(message, text, [...avoid, ...accepted]).ok) accepted.push(text)
      }
    }

    return jsonResponse({ variants: accepted, incomplete: accepted.length < count }, corsHeaders)
  } catch (err) {
    if (err instanceof HubError) {
      if (err.code === 'LIMIT_EXCEEDED') {
        return jsonResponse({ error: 'Limite de uso de IA da empresa atingido', reason: 'limit_exceeded' }, corsHeaders, 402)
      }
      if (err.code === 'TENANT_DISABLED') {
        return jsonResponse({ error: 'IA desativada para a empresa', reason: 'ai_not_enabled' }, corsHeaders, 403)
      }
      console.error('[campaign-variants] hub error:', err.code, err.message)
      return jsonResponse({ error: 'Falha ao gerar as versoes', reason: 'ai_error' }, corsHeaders, 502)
    }
    console.error('[campaign-variants] error:', err)
    return jsonResponse({ error: (err as Error).message }, corsHeaders, 500)
  }
})
