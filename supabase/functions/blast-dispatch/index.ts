import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'
import { buildAudiencePlan } from '../_shared/blast-audience.ts'
import { computeBlastSchedule, type ScheduleItem } from '../_shared/blast-schedule.ts'

// blast-dispatch (mkt-ativo · SPEC §2a) — PARTE COMUM (Opcao pendente do Toni).
// Faz: gate por-empresa (early-return, precedente sdr-ai) → resolve audiencia
// (dentro da company, exclui opt-out) → cria blast_recipients → calcula o
// scheduled_at anti-ban de cada item (§4bis). NAO enfileira nem envia: a etapa
// final depende da decisao de envio (Opcao 1/2/3) e NAO toca o process-message-queue
// (territorio da frente WAHA). verify_jwt=false + auth manual (padrao das proxies).

// Fuso da company: o Veltzy opera em America/Sao_Paulo (CLAUDE.md). Sem coluna de
// tz por empresa hoje; BRT como default. TODO: tz por-company quando existir.
const BRT_OFFSET_MINUTES = -180

interface AuthResult {
  profileId: string
  companyId: string
}

function jsonResponse(body: unknown, corsHeaders: Record<string, string>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function authenticate(
  admin: ReturnType<typeof createClient>,
  authHeader: string | null,
): Promise<AuthResult | Response> {
  const cors = {} as Record<string, string>
  if (!authHeader) return jsonResponse({ error: 'Nao autorizado' }, cors, 401)

  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await admin.auth.getUser(token)
  if (error || !user) return jsonResponse({ error: 'Nao autorizado' }, cors, 401)

  const { data: profile } = await admin
    .from('profiles')
    .select('id, company_id')
    .eq('user_id', user.id)
    .single()
  if (!profile?.company_id) return jsonResponse({ error: 'Usuario sem empresa vinculada' }, cors, 400)

  const { data: roles } = await admin
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('company_id', profile.company_id)
  const userRoles = (roles ?? []).map((r: { role: string }) => r.role)
  const isPrivileged = userRoles.some((r: string) => ['admin', 'manager', 'super_admin'].includes(r))
  if (!isPrivileged) {
    const { data: globalRoles } = await admin
      .from('user_roles').select('role').eq('user_id', user.id).eq('role', 'super_admin')
    if (!globalRoles || globalRoles.length === 0) return jsonResponse({ error: 'Permissao negada' }, cors, 403)
  }

  return { profileId: profile.id as string, companyId: profile.company_id as string }
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Metodo nao permitido' }, corsHeaders, 405)

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(url, key) // schema public (companies/profiles/user_roles)
    const veltzy = createClient(url, key, { db: { schema: 'veltzy' } })

    const auth = await authenticate(admin, req.headers.get('Authorization'))
    if (auth instanceof Response) {
      // reanexa CORS (authenticate nao tem os headers reais)
      return jsonResponse(await auth.json(), corsHeaders, auth.status)
    }
    const { companyId } = auth

    const { campaign_id } = await req.json().catch(() => ({}))
    if (!campaign_id) return jsonResponse({ error: 'campaign_id obrigatorio' }, corsHeaders, 400)

    // Carrega a campanha e confirma que pertence a company do usuario (service_role
    // ignora RLS; a validacao de tenant e no codigo — regra de ouro do Veltzy).
    const { data: campaign } = await veltzy
      .from('blast_campaigns')
      .select('*')
      .eq('id', campaign_id)
      .single()
    if (!campaign || campaign.company_id !== companyId) {
      return jsonResponse({ error: 'Campanha nao encontrada' }, corsHeaders, 404)
    }

    // ---- GATE por-empresa (server-side, early-return; precedente sdr-ai) ----
    const { data: company } = await admin
      .from('companies').select('features').eq('id', companyId).single()
    const features = (company?.features ?? {}) as Record<string, unknown>
    if (features.mkt_ativo_enabled !== true) {
      return jsonResponse({ skipped: true, reason: 'mkt_ativo_not_enabled' }, corsHeaders)
    }

    // Campanha precisa estar em estado disparavel.
    if (!['draft', 'scheduled'].includes(campaign.status)) {
      return jsonResponse({ error: `Campanha em status '${campaign.status}' nao pode ser disparada` }, corsHeaders, 409)
    }

    // ---- Audiencia: dentro da company, exclui opt-out, aplica o filtro ----
    const plan = buildAudiencePlan(campaign.audience_filter)
    let q = veltzy
      .from('leads')
      .select('id, phone, whatsapp_instance_name')
      .eq('company_id', companyId)
      .eq('marketing_opt_out', false)
    if (plan.statusIn) q = q.in('status', plan.statusIn)
    if (plan.temperatureIn) q = q.in('temperature', plan.temperatureIn)
    if (plan.tagsOverlap) q = q.overlaps('tags', plan.tagsOverlap)
    if (plan.sourceEq) q = q.eq('source_id', plan.sourceEq)

    const { data: leads, error: leadsErr } = await q
    if (leadsErr) return jsonResponse({ error: `Falha ao resolver audiencia: ${leadsErr.message}` }, corsHeaders, 500)

    const audience = (leads ?? []).filter((l: { phone: string | null }) => !!l.phone)
    if (audience.length === 0) {
      return jsonResponse({ ok: true, recipients: 0, note: 'Nenhum lead elegivel (apos company/opt-out/filtro)' }, corsHeaders)
    }

    // ---- Cria blast_recipients (idempotente via UNIQUE(campaign_id, lead_id)) ----
    const recipientRows = audience.map((l: { id: string; phone: string }) => ({
      campaign_id,
      lead_id: l.id,
      phone: l.phone,
      status: 'pending',
    }))
    const { error: recErr } = await veltzy
      .from('blast_recipients')
      .upsert(recipientRows, { onConflict: 'campaign_id,lead_id', ignoreDuplicates: true })
    if (recErr) return jsonResponse({ error: `Falha ao criar recipients: ${recErr.message}` }, corsHeaders, 500)

    // ---- Calcula o escalonamento anti-ban (§4bis) — SO CALCULO, nao persiste na fila ----
    // enforce=true assume caminho NAO-OFICIAL (o de risco que o §4bis cobre). A decisao
    // final de provider (e portanto enforce oficial vs nao-oficial) e a etapa SEGURADA.
    const scheduleItems: ScheduleItem[] = audience.map((l: { whatsapp_instance_name: string | null }) => ({
      instanceKey: l.whatsapp_instance_name ?? 'default',
    }))
    const schedule = computeBlastSchedule(scheduleItems, {
      throttle: (campaign.throttle_config ?? null) as Parameters<typeof computeBlastSchedule>[1]['throttle'],
      enforce: true,
      now: new Date(campaign.scheduled_at ? new Date(campaign.scheduled_at) : new Date()),
      tzOffsetMinutes: BRT_OFFSET_MINUTES,
    })

    // Atualiza a contagem (informativo; nao muda status — isso e da etapa de enfileiramento).
    await veltzy.from('blast_campaigns')
      .update({ total_recipients: audience.length })
      .eq('id', campaign_id)

    // ======================================================================
    // ⏸ ETAPA SEGURADA (aguarda decisao do Toni — Opcao 1/2/3):
    //   - resolver provider/template e o CONTEUDO a enfileirar
    //   - INSERT em message_queue (source='campaign', scheduled_at do schedule[])
    //     gravando message_queue_id em cada recipient
    //   - marcar campanha 'queued'/'running'
    //   NAO tocar o process-message-queue (territorio WAHA) sem coordenacao.
    // ======================================================================

    return jsonResponse({
      ok: true,
      phase: 'common-only',
      gate: 'passed',
      recipients: audience.length,
      schedule_preview: schedule.slice(0, 5),
      schedule_count: schedule.length,
      note: 'Parte comum: gate+audiencia+recipients+calculo anti-ban. Enfileiramento/envio SEGURADO ate decisao de envio.',
    }, corsHeaders)
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, getCorsHeaders(req), 500)
  }
})
