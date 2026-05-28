import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// --- Tipos ---

export interface InboundParams {
  supabaseUrl: string
  supabaseKey: string
  companyId: string
  phone: string
  senderName: string | null
  content: string
  messageType: string
  externalId: string | null
  fileUrl: string | null
  fileName: string | null
  fileMimeType: string | null
  source: 'whatsapp' | 'instagram'
  instanceName: string | null
  adContext: Record<string, unknown> | null
  /** Se true, tenta buscar foto de perfil via WhatsApp provider */
  fetchAvatar?: {
    provider: import('./whatsapp-provider.ts').WhatsAppProvider
    config: import('./whatsapp-provider.ts').WhatsAppConfig
  }
}

export interface InboundResult {
  leadId: string
  isNewLead: boolean
}

// --- Handler ---

export async function handleInboundMessage(params: InboundParams): Promise<InboundResult> {
  const supabase = createClient(params.supabaseUrl, params.supabaseKey, { db: { schema: 'veltzy' } })
  const supabasePublic = createClient(params.supabaseUrl, params.supabaseKey)

  // 1. Buscar lead existente
  let { data: lead } = await supabase
    .from('leads')
    .select('id, assigned_to, avatar_url, name, whatsapp_instance_name')
    .eq('company_id', params.companyId)
    .eq('phone', params.phone)
    .maybeSingle()

  // Atualizar nome se veio senderName e lead nao tem nome
  if (lead && (!lead.name || lead.name.startsWith('Contato ')) && params.senderName) {
    await supabase.from('leads').update({ name: params.senderName }).eq('id', lead.id)
  }

  // Atualizar instance_name se veio de instancia nova
  if (lead && params.instanceName && lead.whatsapp_instance_name !== params.instanceName) {
    await supabase.from('leads')
      .update({ whatsapp_instance_name: params.instanceName })
      .eq('id', lead.id)
  }

  const isNewLead = !lead

  // 2. Criar lead se nao existe
  if (!lead) {
    lead = await createLead(supabase, supabasePublic, params)
  }

  if (!lead) {
    throw new Error('Failed to create lead')
  }

  // 3. Buscar avatar do WhatsApp (se solicitado e lead sem avatar)
  if (!lead.avatar_url && params.fetchAvatar) {
    await fetchAndUploadAvatar(
      params.supabaseUrl,
      params.supabaseKey,
      supabase,
      lead.id,
      params.phone,
      params.fetchAvatar.provider,
      params.fetchAvatar.config,
    )
  }

  // 4. Atualizar timestamp SLA
  await supabase
    .from('leads')
    .update({ last_customer_message_at: new Date().toISOString() })
    .eq('id', lead.id)

  // 5. Salvar mensagem
  const { data: savedMessage } = await supabase.from('messages').insert({
    lead_id: lead.id,
    company_id: params.companyId,
    content: params.content,
    sender_type: 'lead',
    message_type: params.messageType,
    file_url: params.fileUrl,
    file_name: params.fileName,
    file_mime_type: params.fileMimeType,
    source: params.source,
    external_id: params.externalId,
    instance_name: params.instanceName,
    delivery_status: 'sent',
  }).select('id').single()

  // 6. Transcricao de audio (async, nao bloqueia)
  if ((params.messageType === 'audio') && params.fileUrl && savedMessage?.id) {
    const openaiKey = Deno.env.get('OPENAI_API_KEY')
    if (openaiKey) {
      transcribeAudio(supabase, params.fileUrl, savedMessage.id, openaiKey)
    }
  }

  // 7. Disparar SDR e automacoes (async, best-effort)
  const fnHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${params.supabaseKey}` }

  try {
    const { data: leadFull } = await supabase
      .from('leads')
      .select('is_ai_active, pipeline_id')
      .eq('id', lead.id)
      .single()

    if (leadFull?.is_ai_active) {
      // Verificar se pipeline tem agent_profile v2 ativo
      let useV2 = false
      if (leadFull.pipeline_id) {
        const { data: agentProfile } = await supabase
          .from('agent_profiles')
          .select('id, is_active')
          .eq('pipeline_id', leadFull.pipeline_id)
          .maybeSingle()

        if (agentProfile?.is_active) {
          // Agent profile ativo: checar feature flag sdr_agent_v2
          const { data: flag } = await supabasePublic
            .from('tenant_feature_flags')
            .select('enabled')
            .eq('company_id', params.companyId)
            .eq('feature_key', 'sdr_agent_v2')
            .maybeSingle()
          useV2 = !!flag?.enabled
        }
      }

      if (useV2) {
        // SDR v2: sdr-engine (agent harness)
        fetch(`${params.supabaseUrl}/functions/v1/sdr-engine`, {
          method: 'POST',
          headers: fnHeaders,
          body: JSON.stringify({
            leadId: lead.id,
            companyId: params.companyId,
            messageContent: params.content,
            messageType: params.messageType,
            pipelineId: leadFull.pipeline_id,
            instanceName: params.instanceName,
          }),
        }).catch(() => {})
      } else {
        // SDR v1: sdr-ai (scoring + auto-reply)
        fetch(`${params.supabaseUrl}/functions/v1/sdr-ai`, {
          method: 'POST',
          headers: fnHeaders,
          body: JSON.stringify({
            leadId: lead.id,
            companyId: params.companyId,
            messageContent: params.content,
            conversationHistory: [],
          }),
        }).catch(() => {})
      }
    }
  } catch { /* best-effort */ }

  try {
    fetch(`${params.supabaseUrl}/functions/v1/run-automations`, {
      method: 'POST',
      headers: fnHeaders,
      body: JSON.stringify({
        trigger: isNewLead ? 'lead_created' : 'message_received',
        leadId: lead.id,
        companyId: params.companyId,
        triggerData: { messageContent: params.content, source: params.source },
      }),
    }).catch(() => {})
  } catch { /* best-effort */ }

  // 8. Auto-reply fora do horario (apenas para leads novos)
  if (isNewLead) {
    await handleAutoReply(supabase, params, lead.id)
  }

  return { leadId: lead.id, isNewLead }
}

// --- Funcoes auxiliares ---

async function createLead(
  supabase: SupabaseClient,
  supabasePublic: SupabaseClient,
  params: InboundParams,
): Promise<{ id: string; assigned_to: string | null; avatar_url: string | null; name: string | null; whatsapp_instance_name: string | null } | null> {
  // Pipeline padrao
  const { data: rawDefault, error: defaultError } = await supabase
    .from('pipelines')
    .select('id')
    .eq('company_id', params.companyId)
    .eq('is_default', true)
    .eq('is_active', true)
    .maybeSingle()

  if (defaultError) {
    console.error('[lead-inbound] Error fetching default pipeline:', JSON.stringify(defaultError))
  }

  let defaultPipeline = rawDefault

  if (!defaultPipeline) {
    const { data: fallback, error: fallbackError } = await supabase
      .from('pipelines')
      .select('id')
      .eq('company_id', params.companyId)
      .eq('is_active', true)
      .order('position')
      .order('created_at')
      .limit(1)
      .single()
    if (fallbackError) {
      console.error('[lead-inbound] Error fetching fallback pipeline:', JSON.stringify(fallbackError))
    }
    defaultPipeline = fallback
  }

  // Primeiro stage
  const { data: defaultStage } = await supabase
    .from('pipeline_stages')
    .select('id')
    .eq('pipeline_id', defaultPipeline?.id)
    .order('position')
    .limit(1)
    .single()

  // Source WhatsApp
  const { data: whatsappSource } = await supabase
    .from('lead_sources')
    .select('id')
    .eq('company_id', params.companyId)
    .eq('slug', 'whatsapp')
    .single()

  // Atribuicao automatica com filtro por instancia
  let assignedTo: string | null = null

  if (params.instanceName) {
    // Evolution: filtrar vendedores pela instancia especifica
    const { data: instanceSellers } = await supabasePublic
      .from('profiles')
      .select('id')
      .eq('company_id', params.companyId)
      .eq('is_available', true)
      .eq('default_whatsapp_instance', params.instanceName)

    if (instanceSellers && instanceSellers.length > 0) {
      assignedTo = instanceSellers[Math.floor(Math.random() * instanceSellers.length)].id
    } else {
      // Fallback: buscar admins da empresa
      const { data: adminRoles } = await supabasePublic
        .from('user_roles')
        .select('user_id')
        .eq('company_id', params.companyId)
        .eq('role', 'admin')

      if (adminRoles && adminRoles.length > 0) {
        const adminIds = adminRoles.map(r => r.user_id)

        // Fallback a: admins ativos com mesma instancia
        const { data: instanceAdmins } = await supabasePublic
          .from('profiles')
          .select('id')
          .in('id', adminIds)
          .eq('is_available', true)
          .eq('default_whatsapp_instance', params.instanceName)

        if (instanceAdmins && instanceAdmins.length > 0) {
          assignedTo = instanceAdmins[Math.floor(Math.random() * instanceAdmins.length)].id
        } else {
          // Fallback b: qualquer admin ativo da empresa
          const { data: anyAdmins } = await supabasePublic
            .from('profiles')
            .select('id')
            .in('id', adminIds)
            .eq('is_available', true)

          if (anyAdmins && anyAdmins.length > 0) {
            assignedTo = anyAdmins[Math.floor(Math.random() * anyAdmins.length)].id
          }
          // Fallback c: assignedTo permanece null, lead fica em queue
        }
      }
    }
  } else {
    // Z-API legado / instancia unica: round-robin entre todos
    const { data: sellers } = await supabasePublic
      .from('profiles')
      .select('id')
      .eq('company_id', params.companyId)
      .eq('is_available', true)

    if (sellers && sellers.length > 0) {
      assignedTo = sellers[Math.floor(Math.random() * sellers.length)].id
    }
  }

  const { data: newLead } = await supabase
    .from('leads')
    .insert({
      company_id: params.companyId,
      phone: params.phone,
      name: params.senderName,
      pipeline_id: defaultPipeline?.id,
      stage_id: defaultStage?.id,
      source_id: whatsappSource?.id,
      assigned_to: assignedTo,
      is_queued: !assignedTo,
      ad_context: params.adContext,
      whatsapp_instance_name: params.instanceName,
    })
    .select('id, assigned_to, avatar_url, name, whatsapp_instance_name')
    .single()

  return newLead
}

async function fetchAndUploadAvatar(
  supabaseUrl: string,
  supabaseKey: string,
  supabase: SupabaseClient,
  leadId: string,
  phone: string,
  provider: import('./whatsapp-provider.ts').WhatsAppProvider,
  config: import('./whatsapp-provider.ts').WhatsAppConfig,
): Promise<void> {
  try {
    const photoUrl = await provider.getProfilePicture(config, phone)
    if (!photoUrl) return

    const imgRes = await fetch(photoUrl)
    const imgBuffer = await imgRes.arrayBuffer()
    const path = `avatars/${leadId}.jpg`

    const storageClient = createClient(supabaseUrl, supabaseKey)
    const { error: uploadError } = await storageClient.storage
      .from('chat-attachments')
      .upload(path, imgBuffer, { contentType: 'image/jpeg', upsert: true })

    if (uploadError) {
      console.error('Avatar upload error:', JSON.stringify(uploadError))
      return
    }

    const { data: urlData } = storageClient.storage
      .from('chat-attachments')
      .getPublicUrl(path)

    await supabase
      .from('leads')
      .update({ avatar_url: urlData.publicUrl })
      .eq('id', leadId)
  } catch (err) {
    console.error('Avatar fetch failed:', err instanceof Error ? err.message : JSON.stringify(err))
  }
}

async function transcribeAudio(
  supabase: SupabaseClient,
  audioUrl: string,
  messageId: string,
  openaiKey: string,
): Promise<void> {
  try {
    const audioResponse = await fetch(audioUrl)
    const audioBuffer = await audioResponse.arrayBuffer()

    const formData = new FormData()
    formData.append('file', new Blob([audioBuffer], { type: 'audio/ogg' }), 'audio.ogg')
    formData.append('model', 'whisper-1')
    formData.append('language', 'pt')

    const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${openaiKey}` },
      body: formData,
    })

    const result = await whisperResponse.json()
    if (result.text) {
      await supabase.from('messages').update({ content: result.text }).eq('id', messageId)
    }
  } catch (err) {
    console.error('Transcription failed:', err)
  }
}

async function handleAutoReply(
  supabase: SupabaseClient,
  params: InboundParams,
  leadId: string,
): Promise<void> {
  try {
    const { data: autoReplySetting } = await supabase
      .from('system_settings')
      .select('value')
      .eq('company_id', params.companyId)
      .eq('key', 'auto_reply_config')
      .maybeSingle()

    const arConfig = autoReplySetting?.value as {
      enabled?: boolean
      message?: string
      schedule?: { start: string; end: string; days: number[]; timezone: string }
    } | null

    if (!arConfig?.enabled || !arConfig.message || !arConfig.schedule) return

    const now = new Date(new Date().toLocaleString('en', { timeZone: arConfig.schedule.timezone }))
    const day = now.getDay()
    const time = now.getHours() * 60 + now.getMinutes()
    const [startH, startM] = arConfig.schedule.start.split(':').map(Number)
    const [endH, endM] = arConfig.schedule.end.split(':').map(Number)
    const isOutside = !arConfig.schedule.days.includes(day) || time < startH * 60 + startM || time >= endH * 60 + endM

    if (isOutside) {
      // Enviar via whatsapp-send (salva mensagem E envia de fato)
      await fetch(`${params.supabaseUrl}/functions/v1/whatsapp-send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${params.supabaseKey}`,
        },
        body: JSON.stringify({
          leadId,
          content: arConfig.message,
          messageType: 'text',
          senderType: 'ai',
          instanceName: params.instanceName,
        }),
      })
    }
  } catch { /* best-effort */ }
}
