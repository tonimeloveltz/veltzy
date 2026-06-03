import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleInboundMessage } from '../_shared/lead-inbound-handler.ts'
import { normalizePhoneBR } from '../_shared/phone.ts'
import { mapPayload, type WebhookPreset } from '../_shared/webhook-payload-mapper.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
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

    // 5. Pipeline routing via pipeline_sources
    const { data: pipelineSource } = await supabase
      .from('pipeline_sources')
      .select('pipeline_id')
      .eq('source_id', sourceId)
      .limit(1)
      .maybeSingle()

    let pipelineId = pipelineSource?.pipeline_id ?? undefined

    // Fallback: pipeline default da empresa
    if (!pipelineId) {
      const { data: defaultPipeline } = await supabase
        .from('pipelines')
        .select('id')
        .eq('company_id', companyId)
        .eq('is_default', true)
        .eq('is_active', true)
        .maybeSingle()

      if (!defaultPipeline) {
        const { data: fallback } = await supabase
          .from('pipelines')
          .select('id')
          .eq('company_id', companyId)
          .eq('is_active', true)
          .order('position')
          .limit(1)
          .maybeSingle()
        pipelineId = fallback?.id
      } else {
        pipelineId = defaultPipeline.id
      }
    }

    // 6. Resolver whatsapp_instance_name do pipeline (para SDR transfer)
    let instanceName: string | null = null
    if (pipelineId) {
      const { data: pipeline } = await supabase
        .from('pipelines')
        .select('sdr_instance_name')
        .eq('id', pipelineId)
        .single()
      instanceName = pipeline?.sdr_instance_name ?? null
    }

    // 7. Delegar para handler compartilhado
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
      instanceName,
      adContext: null,
      pipelineId,
      sourceId,
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
