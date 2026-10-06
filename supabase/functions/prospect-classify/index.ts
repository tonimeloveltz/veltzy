import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'
import { DecisionClient, DecisionError, type JevQuestions, type JevState } from '../_shared/decision-client.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Chave (product, feature) que o ai-decide usa para resolver provider/model.
// Sem config seedada ou sem TYPESAFE_API_KEY, o ai-decide cai no fallback Haiku
// e grava ai_usage.provider='anthropic'. Com ('veltzy','prospect_classify','jev')
// + TYPESAFE_API_KEY no Hub, passa a usar o Jev SEM redeploy daqui.
const FEATURE = 'prospect_classify'

interface ClassifyRequest {
  company_id: string
  niche?: string
  target: string
  context: string[]
}

interface Classification {
  is_opportunity: boolean
  category: string
  urgency: number
  probability: number | null
  confidence: number | null
  provider: string
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}

function finiteNum(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

// Shape canonico pos-H3b (Hub): cada resposta e um objeto {type, value, confidence}.
// Shape atual do ai-decide deployado: primitivo cru (bool/string/int).
// Lemos DEFENSIVO os dois: objeto -> {value, confidence}; primitivo -> valor cru,
// confidence null. probability so existe no noul (is_opportunity) quando rico
// (value 0..1). NUNCA inventar/derivar de urgency; o gradeamento de faixa e do V4.
interface RichAnswer {
  type?: string
  value?: unknown
  confidence?: unknown
}

function isRichAnswer(v: unknown): v is RichAnswer {
  return typeof v === 'object' && v !== null && 'value' in (v as Record<string, unknown>)
}

function readAnswer(raw: unknown): { value: unknown; confidence: number | null; rich: boolean } {
  if (isRichAnswer(raw)) {
    return { value: raw.value, confidence: finiteNum(raw.confidence), rich: true }
  }
  return { value: raw, confidence: null, rich: false }
}

function json(payload: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(payload), { status, headers })
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req)
  const headers = { ...cors, 'Content-Type': 'application/json' }

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') {
    return json({ ok: false, error: { code: 'INVALID_REQUEST', message: 'POST only' } }, 405, headers)
  }

  // Edge interno: chamado pelo prospect-process-windows (V4) com service_role.
  // Sem caller de browser — exige service_role no Bearer.
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
  if (token !== SERVICE_ROLE) {
    return json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'service_role requerido' } }, 401, headers)
  }

  try {
    const body = await req.json() as ClassifyRequest
    const { company_id, niche, target, context } = body
    if (!company_id || !target || !Array.isArray(context)) {
      return json({ ok: false, error: { code: 'INVALID_REQUEST', message: 'company_id, target, context[] obrigatorios' } }, 400, headers)
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: 'veltzy' } })

    // Criterio ativo da empresa (por nicho, se informado). unique(company_id, niche).
    let q = supabase
      .from('prospect_criteria')
      .select('niche, questions, is_active')
      .eq('company_id', company_id)
      .eq('is_active', true)
    if (niche) q = q.eq('niche', niche)
    const { data: criteria, error: critErr } = await q.limit(1).maybeSingle()
    if (critErr) throw critErr
    if (!criteria) {
      return json({ ok: false, error: { code: 'NO_CRITERIA', message: 'nenhum criterio ativo para a empresa/nicho' } }, 404, headers)
    }

    const questions = criteria.questions as JevQuestions
    const state: JevState = { target, context }

    const client = new DecisionClient()
    let resp
    try {
      resp = await client.decide({ company_id, product: 'veltzy', feature: FEATURE, state, questions })
    } catch (err) {
      if (err instanceof DecisionError && (err.code === 'TENANT_DISABLED' || err.code === 'LIMIT_EXCEEDED')) {
        return json({ ok: false, error: { code: err.code, message: err.message } }, 403, headers)
      }
      throw err
    }

    if (!resp.ok || !resp.data) {
      return json({ ok: false, error: resp.error ?? { code: 'PROVIDER_ERROR', message: 'ai-decide sem data' } }, 502, headers)
    }

    const answers = resp.data.answers
    const oppA = readAnswer(answers.is_opportunity)
    const catA = readAnswer(answers.category)
    const urgA = readAnswer(answers.urgency)

    // noul rico: value 0..1 E a probability; confidence vem da propria resposta.
    const oppValue = finiteNum(oppA.value)
    const probability = oppA.rich && oppValue !== null ? clamp01(oppValue) : null
    const confidence = oppA.confidence
    // is_opportunity (bool, so display): deriva do probability quando houver,
    // senao usa o bool cru do shape atual. O V4 gradeia por probability, nao aqui.
    const isOpportunity = probability !== null ? probability >= 0.5 : oppA.value === true
    const category = typeof catA.value === 'string' ? catA.value : String(catA.value ?? '')
    const urgency = finiteNum(urgA.value) ?? Number(urgA.value ?? 0)

    const result: Classification = {
      is_opportunity: isOpportunity,
      category,
      urgency,
      probability,
      confidence,
      provider: resp.data.provider,
    }

    return json({ ok: true, data: result }, 200, headers)
  } catch (err) {
    console.error('[prospect-classify]', err)
    return json({ ok: false, error: { code: 'INTERNAL', message: (err as Error).message } }, 500, headers)
  }
})
