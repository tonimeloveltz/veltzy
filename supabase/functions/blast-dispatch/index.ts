import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'
import { buildAudiencePlan, leadIdsInStages } from '../_shared/blast-audience.ts'
import { computeBlastSchedule, type ScheduleItem } from '../_shared/blast-schedule.ts'
import { getTemplateBodyText, renderTemplateBody, renderMessageBody, resolveTemplateParams } from '../_shared/blast-render.ts'
import { resolveCloudSenderOverride, resolveSenderInstance, splitAntiBan } from '../_shared/blast-sender.ts'
import { assignVariants, sameVariables } from '../_shared/campaign-variants.ts'

// blast-dispatch (mkt-ativo · SPEC §2a/§3). Fluxo: gate por-empresa (early-return,
// precedente sdr-ai) → resolve provider (cloud_api RECUSADO na Fase 1: HSM real =
// proximo corte) → resolve audiencia (dentro da company, exclui opt-out) → cria
// blast_recipients → calcula scheduled_at anti-ban (§4bis) → renderiza o BODY do
// template como TEXTO por recipient → EXPANDE em message_queue (source='campaign')
// gravando message_queue_id nos recipients → marca campanha. NAO toca o
// process-message-queue (que ja tem ramo waha em develop) — ele pega a fila e envia
// pelo provider da company. verify_jwt=false + auth manual (padrao das proxies).

// Fuso da company: o Veltzy opera em America/Sao_Paulo (CLAUDE.md). Sem coluna de
// tz por empresa hoje; BRT como default. TODO: tz por-company quando existir.
const BRT_OFFSET_MINUTES = -180
// Áudio com texto: o áudio sai logo depois do texto.
const AUDIO_AFTER_TEXT_MS = 3_000

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

    // ---- Provider da company. Corte A: cloud_api LIBERADO (modo template HSM).
    // Leitura direta de active_whatsapp_provider (o consumidor resolve o envio real por-provider). ----
    const { data: companyProvider } = await admin
      .from('companies').select('active_whatsapp_provider').eq('id', companyId).single()
    const provider = (companyProvider?.active_whatsapp_provider as string) ?? 'zapi'
    const isCloudApi = provider === 'cloud_api'

    // ---- Anexo (campanhas-layout-midia): só texto livre em número não oficial. ----
    const mediaType = campaign.media_path ? (campaign.media_type as string | null) : null
    if (campaign.media_path) {
      if (campaign.media_purged_at) {
        return jsonResponse({ error: 'O anexo expirou. Anexe de novo.', reason: 'media_expired' }, corsHeaders, 422)
      }
      if (isCloudApi) {
        return jsonResponse({ error: 'Canal oficial (Cloud API) nao envia anexo em campanha.', reason: 'media_not_supported_official' }, corsHeaders, 422)
      }
      if (campaign.template_id) {
        return jsonResponse({ error: 'Anexo so vale para mensagem livre, nao para template.', reason: 'media_requires_free_text' }, corsHeaders, 422)
      }
      if (!mediaType || !['image', 'audio', 'video', 'document'].includes(mediaType) || !campaign.media_url) {
        return jsonResponse({ error: 'Anexo da campanha invalido', reason: 'media_invalid' }, corsHeaders, 422)
      }
    }

    // ---- Fonte do conteudo. Com template_id: HSM (Cloud API) / BODY renderizado (waha/evo).
    // Sem template_id: MENSAGEM LIVRE (campaign.message_body) — so nao-oficial. ----
    // deno-lint-ignore no-explicit-any
    let template: any = null
    let bodyText = ''
    const isFreeText = !campaign.template_id
    // Versões da mensagem livre (campanha-variacoes-ia): [0] = original. Só valem com 2+.
    let variants: string[] | null = null

    if (isFreeText) {
      // Cloud API exige template aprovado (regra da Meta): texto livre nao serve.
      if (isCloudApi) {
        return jsonResponse({ error: 'Canal oficial (Cloud API) exige template aprovado pela Meta; mensagem livre nao e permitida.', reason: 'template_required' }, corsHeaders, 422)
      }
      bodyText = (campaign.message_body ?? '').trim()
      if (!bodyText && !mediaType) {
        return jsonResponse({ error: 'Campanha sem template_id e sem message_body' }, corsHeaders, 400)
      }
      const raw = campaign.message_variants
      if (Array.isArray(raw) && raw.length > 1) {
        const list = raw.map((v: unknown) => (typeof v === 'string' ? v.trim() : ''))
        // Defesa (o wizard já valida): toda versão precisa ter as MESMAS variáveis da original.
        if (list.some((v: string) => !v || !sameVariables(list[0], v))) {
          return jsonResponse({ error: 'Versoes da mensagem invalidas (variaveis diferentes da original)', reason: 'invalid_variants' }, corsHeaders, 422)
        }
        variants = list
      }
    } else {
      const { data: tpl } = await veltzy
        .from('whatsapp_templates')
        .select('id, company_id, waba_id, name, language, components, status')
        .eq('id', campaign.template_id)
        .single()
      if (!tpl || tpl.company_id !== companyId) {
        return jsonResponse({ error: 'Template nao encontrado' }, corsHeaders, 404)
      }
      // Cloud API oficial: a Meta so entrega template APROVADO. Recusa cedo se nao estiver.
      if (isCloudApi && tpl.status !== 'APPROVED') {
        return jsonResponse({ error: `Template '${tpl.name}' nao esta APPROVED (status: ${tpl.status}). Cloud API exige template aprovado.`, reason: 'template_not_approved' }, corsHeaders, 422)
      }
      bodyText = getTemplateBodyText(tpl.components)
      if (!bodyText) {
        return jsonResponse({ error: 'Template sem componente BODY com texto' }, corsHeaders, 422)
      }
      template = tpl
    }

    // ---- Audiencia: dentro da company, exclui opt-out, aplica o filtro ----
    const plan = buildAudiencePlan(campaign.audience_filter)
    let q = veltzy
      .from('leads')
      .select('*')
      .eq('company_id', companyId)
      .eq('marketing_opt_out', false)
    // Seleção MANUAL: restringe a EXATAMENTE esses leads (ignora os outros filtros).
    if (plan.manualIds) q = q.in('id', plan.manualIds)
    if (plan.temperatureIn) q = q.in('temperature', plan.temperatureIn)
    if (plan.tagsOverlap) q = q.overlaps('tags', plan.tagsOverlap)
    if (plan.sourceEq) q = q.eq('source_id', plan.sourceEq)

    // Excluir recentes: remove leads com mensagem enviada nos últimos N dias (anti-fadiga).
    if (plan.excludeRecentDays) {
      const since = new Date(Date.now() - plan.excludeRecentDays * 86_400_000).toISOString()
      const { data: recent, error: recentErr } = await veltzy
        .from('messages')
        .select('lead_id')
        .eq('company_id', companyId)
        .gte('created_at', since)
        .not('lead_id', 'is', null)
      if (recentErr) return jsonResponse({ error: `Falha ao resolver recentes: ${recentErr.message}` }, corsHeaders, 500)
      const recentIds = [...new Set((recent ?? []).map((m: { lead_id: string }) => m.lead_id))]
      if (recentIds.length > 0) q = q.not('id', 'in', `(${recentIds.join(',')})`)
    }

    // Segmentação por ETAPA (critério A estrito): resolve os lead_ids cujo deal ABERTO
    // mais recente está num dos stages e restringe a audiência a eles. (Pulado na seleção manual.)
    if (plan.stageIn && !plan.manualIds) {
      const { data: openDeals, error: dealsErr } = await veltzy
        .from('deals')
        .select('lead_id, stage_id, created_at')
        .eq('company_id', companyId)
        .eq('status', 'open')
      if (dealsErr) return jsonResponse({ error: `Falha ao resolver etapas: ${dealsErr.message}` }, corsHeaders, 500)
      const stageLeadIds = leadIdsInStages(openDeals ?? [], plan.stageIn)
      if (stageLeadIds.length === 0) {
        return jsonResponse({ ok: true, recipients: 0, note: 'Nenhum lead na(s) etapa(s) selecionada(s)' }, corsHeaders)
      }
      q = q.in('id', stageLeadIds)
    }

    const { data: leads, error: leadsErr } = await q
    if (leadsErr) return jsonResponse({ error: `Falha ao resolver audiencia: ${leadsErr.message}` }, corsHeaders, 500)

    const audience = (leads ?? []).filter((l: { phone: string | null }) => !!l.phone)
    if (audience.length === 0) {
      return jsonResponse({ ok: true, recipients: 0, note: 'Nenhum lead elegivel (apos company/opt-out/filtro)' }, corsHeaders)
    }

    // ---- Numero de envio (SPEC seletor-numero-campanha): mora no anti_ban. waha/evolution
    // guardam a sessao/instancia; cloud_api guarda o phone_number_id. O escolhido precisa ser
    // da company (regra de ouro), senao e ignorado. ----
    const split = splitAntiBan(campaign.anti_ban)
    let sender: string | null = null
    let cloudSenderLabel: string | null = null
    if (split.sender && isCloudApi) {
      const { data: owned } = await veltzy
        .from('cloud_api_numbers').select('phone_number_id, instance_label, waba_id')
        .eq('company_id', companyId).eq('phone_number_id', split.sender).eq('status', 'active').maybeSingle()
      if (!owned) {
        console.warn(`[blast-dispatch] numero Cloud API '${split.sender}' nao pertence a company ${companyId} ou esta inativo; ignorado`)
      } else if (template?.waba_id && owned.waba_id && owned.waba_id !== template.waba_id) {
        // Template HSM e da WABA: numero de outra conta da Meta nao consegue enviar este template.
        return jsonResponse({ error: `O template '${template.name}' nao pertence a conta Meta do numero escolhido. Escolha um numero da mesma conta ou outro template.`, reason: 'template_waba_mismatch' }, corsHeaders, 422)
      } else {
        sender = split.sender
        cloudSenderLabel = (owned.instance_label as string | null) ?? split.sender
      }
    } else if (split.sender && (provider === 'waha' || provider === 'evolution')) {
      const table = provider === 'waha' ? 'waha_instances' : 'evolution_instances'
      const column = provider === 'waha' ? 'session_name' : 'instance_name'
      const { data: owned } = await admin
        .from(table).select(column).eq('company_id', companyId).eq(column, split.sender).maybeSingle()
      if (owned) sender = split.sender
      else console.warn(`[blast-dispatch] sender_instance '${split.sender}' nao pertence a company ${companyId}; ignorado`)
    }
    const senderFor = (l: { whatsapp_instance_name: string | null }) =>
      resolveSenderInstance(l.whatsapp_instance_name, sender, split.force)
    // Cloud API: phone_number_id escolhido quando vale pra este lead (null = vinculo do lead/default).
    const cloudOverrideFor = (l: { cloud_api_number_id?: string | null }) =>
      isCloudApi ? resolveCloudSenderOverride(l.cloud_api_number_id, sender, split.force) : null

    // ---- Versões: atribuição balanceada aleatória (embaralha e reparte em fatias iguais) ----
    const assigned = variants ? assignVariants(audience.length, variants.length) : null

    // ---- Cria blast_recipients (idempotente via UNIQUE(campaign_id, lead_id)) ----
    const recipientRows = audience.map((l: { id: string; phone: string }, i: number) => ({
      campaign_id,
      lead_id: l.id,
      phone: l.phone,
      status: 'pending',
      variant_index: assigned ? assigned[i] : null,
    }))
    const { error: recErr } = await veltzy
      .from('blast_recipients')
      .upsert(recipientRows, { onConflict: 'campaign_id,lead_id', ignoreDuplicates: true })
    if (recErr) return jsonResponse({ error: `Falha ao criar recipients: ${recErr.message}` }, corsHeaders, 500)

    // O upsert ignora recipients já existentes (re-disparo de campanha 'scheduled'): o texto
    // segue o variant_index GRAVADO, para nunca divergir do que consta no recipient.
    const variantFor = new Map<string, number>()
    if (variants && assigned) {
      const { data: recs, error: recReadErr } = await veltzy
        .from('blast_recipients').select('lead_id, variant_index').eq('campaign_id', campaign_id)
      if (recReadErr) return jsonResponse({ error: `Falha ao ler recipients: ${recReadErr.message}` }, corsHeaders, 500)
      const stored = new Map((recs ?? []).map((r: { lead_id: string; variant_index: number | null }) => [r.lead_id, r.variant_index]))
      audience.forEach((l: { id: string }, i: number) => {
        const idx = stored.get(l.id)
        variantFor.set(l.id, idx != null && idx >= 0 && idx < variants!.length ? idx : assigned[i])
      })
    }

    // ---- Escalonamento (§4bis). enforce=true (nao-oficial waha/evolution/zapi) aplica o
    // piso anti-ban; cloud_api OFICIAL nao (enforce=false = espacamento leve, limites da Meta). ----
    // O teto diario agrupa pelo numero EFETIVO de envio (ja com o sender aplicado).
    const scheduleItems: ScheduleItem[] = audience.map((l: { whatsapp_instance_name: string | null; cloud_api_number_id?: string | null }) => ({
      instanceKey: isCloudApi
        ? (cloudOverrideFor(l) ?? l.cloud_api_number_id ?? 'default')
        : (senderFor(l) ?? 'default'),
    }))
    // anti_ban (override editável por campanha) tem precedência sobre throttle_config.
    const antiBan = split.throttle ?? campaign.throttle_config ?? null
    const schedule = computeBlastSchedule(scheduleItems, {
      throttle: antiBan as Parameters<typeof computeBlastSchedule>[1]['throttle'],
      enforce: !isCloudApi,
      now: new Date(campaign.scheduled_at ? new Date(campaign.scheduled_at) : new Date()),
      tzOffsetMinutes: BRT_OFFSET_MINUTES,
    })

    // ---- EXPANDE em message_queue (source='campaign'), um item por recipient. O consumidor
    // (process-message-queue) envia pelo provider da company. cloud_api = message_type='template'
    // + metadata (name/language/params resolvidos por-recipient); demais = texto renderizado. ----
    // metadata.campaign_id em todo item: blast-campaign-manage cancela por ele (inclui o
    // item de texto do par áudio). Anexo: image/video/document = 1 item com legenda;
    // audio = texto em scheduled_at + áudio 3s depois (WhatsApp não aceita legenda em áudio).
    const variableMapping = (campaign.variable_mapping ?? {}) as Record<string, string>
    const campaignMeta = { campaign_id }
    const queueRows = audience.flatMap((lead: Record<string, unknown>, i: number) => {
      const cloudOverride = cloudOverrideFor(lead as { cloud_api_number_id?: string | null })
      const base = {
        company_id: companyId,
        lead_id: lead.id as string,
        // content carrega o texto renderizado (historico/inbox). Texto livre usa variaveis
        // nomeadas ({{nome}}/{{telefone}}/{{empresa}}); template usa o mapping posicional.
        content: isFreeText
          ? renderMessageBody(variants ? variants[variantFor.get(lead.id as string) ?? 0] : bodyText, lead)
          : renderTemplateBody(bodyText, variableMapping, lead),
        scheduled_at: schedule[i].scheduled_at,
        source: 'campaign',
        instance_name: isCloudApi
          ? (cloudOverride ? cloudSenderLabel : (lead.whatsapp_instance_name as string | null) ?? null)
          : senderFor(lead as { whatsapp_instance_name: string | null }),
      }
      if (isCloudApi) {
        return [{
          ...base,
          message_type: 'template',
          metadata: {
            ...campaignMeta,
            template_name: template.name,
            language: template.language,
            params: resolveTemplateParams(bodyText, variableMapping, lead),
            // Lido pelo process-message-queue antes do vinculo do lead/default.
            ...(cloudOverride ? { phone_number_id: cloudOverride } : {}),
          },
        }]
      }
      if (!mediaType) return [{ ...base, message_type: 'text', metadata: campaignMeta }]
      const mediaItem = { ...base, message_type: mediaType, file_url: campaign.media_url as string, metadata: campaignMeta }
      if (mediaType !== 'audio') return [mediaItem]
      if (!base.content.trim()) return [{ ...mediaItem, content: '' }]
      const audioAt = new Date(new Date(base.scheduled_at).getTime() + AUDIO_AFTER_TEXT_MS).toISOString()
      return [
        { ...base, message_type: 'text', metadata: campaignMeta },
        { ...mediaItem, content: '', scheduled_at: audioAt },
      ]
    })
    const { data: inserted, error: queueErr } = await veltzy
      .from('message_queue')
      .insert(queueRows)
      .select('id, lead_id, message_type')
    if (queueErr) return jsonResponse({ error: `Falha ao enfileirar: ${queueErr.message}` }, corsHeaders, 500)

    // Liga cada recipient ao item da fila (fonte do status) e marca 'queued'. No par
    // texto+áudio o recipient aponta para o áudio (último a sair).
    const queueIdByLead = new Map<string, string>()
    for (const item of inserted ?? []) {
      if (!queueIdByLead.has(item.lead_id) || item.message_type !== 'text') queueIdByLead.set(item.lead_id, item.id)
    }
    for (const [leadId, queueId] of queueIdByLead) {
      await veltzy.from('blast_recipients')
        .update({ message_queue_id: queueId, status: 'queued' })
        .eq('campaign_id', campaign_id)
        .eq('lead_id', leadId)
    }

    // Marca a campanha: 'scheduled' se futura, 'queued' se imediata.
    const isScheduled = campaign.scheduled_at && new Date(campaign.scheduled_at).getTime() > Date.now()
    await veltzy.from('blast_campaigns')
      .update({
        status: isScheduled ? 'scheduled' : 'queued',
        total_recipients: audience.length,
        queued_count: queueIdByLead.size,
        started_at: isScheduled ? null : new Date().toISOString(),
      })
      .eq('id', campaign_id)

    return jsonResponse({
      ok: true,
      gate: 'passed',
      provider,
      recipients: audience.length,
      queued: queueIdByLead.size,
      campaign_status: isScheduled ? 'scheduled' : 'queued',
      schedule_preview: schedule.slice(0, 3),
      note: 'Campanha expandida na message_queue; o process-message-queue envia via provider da company.',
    }, corsHeaders)
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, getCorsHeaders(req), 500)
  }
})
