import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getWhatsAppConfig, getActiveProvider } from '../_shared/whatsapp-config.ts'
import { createProvider } from '../_shared/whatsapp-factory.ts'
import { resolveInstanceName } from '../_shared/resolve-instance.ts'
import { resolveOutboundCloudApiNumber } from '../_shared/cloud-api-resolve.ts'

import { getCorsHeaders } from '../_shared/cors.ts'

interface SendPayload {
  leadId: string
  content: string
  messageType?: string
  fileUrl?: string
  fileName?: string
  mimeType?: string
  repliedMessageId?: string
  instanceName?: string       // override explicito (admin/manager)
  senderType?: 'human' | 'ai' // aceito apenas com service role
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const url = Deno.env.get('SUPABASE_URL')!
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseAuth = createClient(url, key)
    const supabase = createClient(url, key, { db: { schema: 'veltzy' } })
    const supabasePublic = createClient(url, key)

    // --- Autenticacao dual ---
    const token = authHeader.replace('Bearer ', '')
    const isServiceRole = token === key

    let companyId: string
    let profileId: string | null = null
    let senderType: 'human' | 'ai' = 'human'

    if (isServiceRole) {
      // Chamada interna (sdr-ai, process-message-queue)
      // company_id vem do payload via lead lookup
      companyId = '' // sera preenchido abaixo
    } else {
      // Chamada do frontend (user JWT)
      const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token)
      if (authError || !user) {
        return new Response(JSON.stringify({ error: 'Invalid token' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      const { data: profile } = await supabasePublic
        .from('profiles')
        .select('company_id, id, default_whatsapp_instance')
        .eq('user_id', user.id)
        .single()

      if (!profile?.company_id) {
        return new Response(JSON.stringify({ error: 'No company' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      companyId = profile.company_id
      profileId = profile.id
    }

    const payload: SendPayload = await req.json()

    // senderType: aceitar apenas de service role (defesa em profundidade)
    if (isServiceRole && payload.senderType) {
      senderType = payload.senderType
    }

    // Buscar lead
    const { data: lead } = await supabase
      .from('leads')
      .select('phone, whatsapp_instance_name, assigned_to, company_id, cloud_api_number_id')
      .eq('id', payload.leadId)
      .single()

    if (!lead) {
      return new Response(JSON.stringify({ error: 'Lead not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Para service role, pegar company_id do lead
    if (isServiceRole) {
      companyId = lead.company_id
    }

    // Validar que lead pertence a empresa do user
    if (!isServiceRole && lead.company_id !== companyId) {
      return new Response(JSON.stringify({ error: 'Lead not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // --- Roteamento por provider ---
    const activeProvider = await getActiveProvider(supabasePublic, companyId)
    const msgType = (payload.messageType ?? 'text') as 'text' | 'image' | 'audio' | 'video' | 'document'

    let instanceName: string | null = null
    let deliveryStatus: 'sent' | 'failed' = 'sent'
    let deliveryError: string | null = null
    let source: 'whatsapp' | 'manual' = 'whatsapp'
    let externalId: string | null = null

    if (activeProvider === 'evolution') {
      // Override explicito do payload (admin/manager)
      instanceName = payload.instanceName ?? null

      if (!instanceName) {
        const mode = senderType === 'ai' ? 'sdr' : 'human'

        // O pipeline vem do negocio (Onda 4): regra R1, negocio ABERTO mais
        // recente. So o modo 'sdr' usa esse valor, entao o envio humano nao
        // paga a consulta. Sem negocio aberto vai `undefined`, e a cadeia do
        // resolveInstanceName desce para o numero do vendedor.
        let sdrPipelineId: string | undefined
        if (mode === 'sdr') {
          const { data: activeDeal } = await supabase
            .from('deals')
            .select('pipeline_id')
            .eq('company_id', companyId)
            .eq('lead_id', payload.leadId)
            .eq('status', 'open')
            .not('pipeline_id', 'is', null)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          sdrPipelineId = activeDeal?.pipeline_id ?? undefined
        }

        // supabase usa schema 'veltzy'; resolveInstanceName tipa o 1o param com o
        // SupabaseClient default (schema 'public'). Cast type-only, runtime inalterado.
        instanceName = await resolveInstanceName(supabase as unknown as typeof supabasePublic, supabasePublic, {
          leadId: payload.leadId,
          companyId,
          userId: profileId ?? undefined,
          mode,
          pipelineId: sdrPipelineId,
        })
      }

      if (!instanceName) {
        return new Response(JSON.stringify({
          error: 'Configure seu numero WhatsApp em Minha Conta para enviar mensagens.',
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      // Enviar via Evolution Hub
      try {
        const provider = createProvider('evolution')
        await provider.sendMessage({} as import('../_shared/whatsapp-provider.ts').WhatsAppConfig, {
          phone: lead.phone,
          content: payload.content,
          type: msgType,
          mediaUrl: payload.fileUrl,
          fileName: payload.fileName,
          instanceName,
          companyId,
        })
      } catch (err) {
        console.error('[whatsapp-send] Evolution send failed:', err)
        deliveryStatus = 'failed'
        deliveryError = err instanceof Error ? err.message : String(err)
      }
    } else if (activeProvider === 'cloud_api') {
      // Resolve o numero Cloud API: vinculo do lead -> default da empresa.
      const outbound = await resolveOutboundCloudApiNumber(supabase, {
        cloud_api_number_id: lead.cloud_api_number_id,
        company_id: companyId,
      })

      if (!outbound) {
        return new Response(JSON.stringify({
          error: 'Nenhum numero Cloud API configurado para esta empresa (sem vinculo no lead e sem default).',
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      // instance_name = label do numero (auditoria multi-instancia, igual Evolution)
      instanceName = outbound.instanceLabel

      try {
        const provider = createProvider('cloud_api')
        const result = await provider.sendMessage({} as import('../_shared/whatsapp-provider.ts').WhatsAppConfig, {
          phone: lead.phone,
          content: payload.content,
          type: msgType,
          mediaUrl: payload.fileUrl,
          fileName: payload.fileName,
          phoneNumberId: outbound.phoneNumberId,
          companyId,
        })
        externalId = result.externalId ?? null
      } catch (err) {
        console.error('[whatsapp-send] Cloud API send failed:', err)
        deliveryStatus = 'failed'
        deliveryError = err instanceof Error ? err.message : String(err)
      }
    } else {
      // Fluxo Z-API existente
      const config = await getWhatsAppConfig(supabasePublic, companyId)

      if (config?.status === 'connected') {
        try {
          const provider = createProvider(config.provider)
          await provider.sendMessage(config, {
            phone: lead.phone,
            content: payload.content,
            type: msgType,
            mediaUrl: payload.fileUrl,
            fileName: payload.fileName,
          })
        } catch (err) {
          console.error('[whatsapp-send] Z-API send failed:', err)
          deliveryStatus = 'failed'
          deliveryError = err instanceof Error ? err.message : String(err)
        }
      } else {
        source = 'manual'
      }
    }

    // Salvar mensagem
    const { data: message } = await supabase
      .from('messages')
      .insert({
        lead_id: payload.leadId,
        company_id: companyId,
        content: payload.content,
        sender_type: senderType,
        message_type: payload.messageType ?? 'text',
        file_url: payload.fileUrl ?? null,
        file_name: payload.fileName ?? null,
        file_mime_type: payload.mimeType ?? null,
        source: deliveryStatus === 'failed' ? 'manual' : source,
        replied_message_id: payload.repliedMessageId ?? null,
        instance_name: instanceName,
        delivery_status: deliveryStatus,
        delivery_error: deliveryError,
        external_id: externalId,
      })
      .select()
      .single()

    // Atualizar status da conversa
    if (senderType === 'human') {
      await supabase
        .from('leads')
        .update({ conversation_status: 'replied' })
        .eq('id', payload.leadId)

      // Popula first_response_at na primeira resposta do vendedor
      await supabase
        .from('leads')
        .update({ first_response_at: new Date().toISOString() })
        .eq('id', payload.leadId)
        .is('first_response_at', null)
    }

    return new Response(JSON.stringify(message),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('[whatsapp-send] Error:', err)
    return new Response(JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
