import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleInboundMessage } from '../_shared/lead-inbound-handler.ts'
import { normalizePhoneBR } from '../_shared/phone.ts'
import { mapPayload, type WebhookPreset } from '../_shared/webhook-payload-mapper.ts'
import { getCorsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  const json = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, serviceKey, { db: { schema: 'veltzy' } })

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
  let rawPayload: Record<string, unknown> = {}

  try {
    // 1. Extrair Bearer token
    const authHeader = req.headers.get('authorization') ?? ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null

    if (!token) {
      await logWebhook(supabase, { status: 'invalid_token', ip, errorMessage: 'Missing Bearer token', rawPayload })
      return json({ error: 'Unauthorized' }, 401)
    }

    // 2. Buscar source_integration por webhook_token
    const { data: integration } = await supabase
      .from('source_integrations')
      .select('id, company_id, source_id, config, is_active')
      .eq('webhook_token', token)
      .maybeSingle()

    if (!integration || !integration.is_active) {
      await logWebhook(supabase, { status: 'invalid_token', ip, errorMessage: 'Invalid or inactive token', rawPayload })
      return json({ error: 'Unauthorized' }, 401)
    }

    const { company_id: companyId, source_id: sourceId, config } = integration
    const preset: WebhookPreset = (config as Record<string, unknown>)?.preset as WebhookPreset ?? 'generic'

    // 3. Parsear body
    try {
      rawPayload = await req.json()
    } catch {
      await logWebhook(supabase, {
        status: 'invalid_payload', companyId, sourceIntegrationId: integration.id, sourceId, ip,
        errorMessage: 'Invalid JSON body', rawPayload,
      })
      return json({ error: 'Invalid JSON body' }, 400)
    }

    // 4. Mapear payload pelo preset
    const mapped = mapPayload(preset, rawPayload)

    if (!mapped.phone) {
      await logWebhook(supabase, {
        status: 'invalid_payload', companyId, sourceIntegrationId: integration.id, sourceId, ip,
        errorMessage: 'Phone required', rawPayload, parsedPayload: mapped,
      })
      return json({ error: 'Phone required' }, 400)
    }

    const phone = normalizePhoneBR(mapped.phone)
    if (!phone) {
      await logWebhook(supabase, {
        status: 'invalid_payload', companyId, sourceIntegrationId: integration.id, sourceId, ip,
        errorMessage: 'Invalid phone after normalization', rawPayload, parsedPayload: mapped,
      })
      return json({ error: 'Invalid phone' }, 400)
    }

    // 5. Delegar para handler compartilhado.
    // Pipeline agora e decidido pelo resolver (resolve-pipeline-by-origin) DENTRO do handler,
    // a partir do sourceId (match webhook_source, cobre o legado do pipeline_sources, migrado
    // em 1C) e dos identificadores de campanha estruturados (utm/campaign/ad). Nao calculamos
    // mais pipelineId aqui (RF6, fonte unica de decisao).
    // instanceName: null. A origem do webhook e a source/campanha, nao uma instancia; se o
    // SDR precisar responder, resolve-instance.ts cai no sdr_instance_name do pipeline roteado.
    const result = await handleInboundMessage({
      supabaseUrl,
      supabaseKey: serviceKey,
      companyId,
      phone,
      senderName: mapped.name,
      content: mapped.observations ?? '',
      messageType: 'text',
      externalId: null,
      fileUrl: null,
      fileName: null,
      fileMimeType: null,
      source: 'webhook',
      instanceName: null,
      adContext: null,
      sourceId,
      utmCampaign: mapped.utmCampaign,
      campaignId: mapped.campaignId,
      adId: mapped.adId,
      useQueue: true,
    })

    console.log(`[source-webhook] Processed: leadId=${result.leadId}, isNew=${result.isNewLead}, company=${companyId}`)

    // 8. Logar sucesso
    await logWebhook(supabase, {
      status: 'success', companyId, sourceIntegrationId: integration.id, sourceId, ip,
      leadId: result.leadId, rawPayload, parsedPayload: mapped,
    })

    return json({ success: true, leadId: result.leadId, isNewLead: result.isNewLead })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[source-webhook] Error:', message)
    await logWebhook(supabase, { status: 'error', ip, errorMessage: message, rawPayload }).catch(() => {})
    return json({ error: message }, 500)
  }
})

// --- Helpers ---

interface LogParams {
  status: string
  companyId?: string
  sourceIntegrationId?: string
  sourceId?: string
  leadId?: string
  ip: string | null
  errorMessage?: string
  rawPayload: Record<string, unknown>
  parsedPayload?: Record<string, unknown> | null
}

async function logWebhook(
  supabase: ReturnType<typeof createClient>,
  params: LogParams,
): Promise<void> {
  try {
    await supabase.from('webhook_inbound_log').insert({
      company_id: params.companyId ?? null,
      source_integration_id: params.sourceIntegrationId ?? null,
      source_id: params.sourceId ?? null,
      status: params.status,
      lead_id: params.leadId ?? null,
      raw_payload: params.rawPayload,
      parsed_payload: params.parsedPayload ?? null,
      error_message: params.errorMessage ?? null,
      ip_address: params.ip,
    })
  } catch (logErr) {
    console.error('[source-webhook] Failed to log webhook:', logErr)
  }
}
