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
  source: 'whatsapp' | 'instagram' | 'webhook'
  instanceName: string | null
  adContext: Record<string, unknown> | null
  /** Se true, tenta buscar foto de perfil via WhatsApp provider */
  fetchAvatar?: {
    provider: import('./whatsapp-provider.ts').WhatsAppProvider
    config: import('./whatsapp-provider.ts').WhatsAppConfig
  }
  /** URL direta da foto de perfil (enviada pelo Hub para Evolution) */
  profilePicUrl?: string | null
  /** Override: pipeline destino (usado por source-webhook via pipeline_sources) */
  pipelineId?: string
  /** Override: lead_source.id (usado por source-webhook) */
  sourceId?: string
  /** Se true, pula atribuicao imediata e coloca lead na fila (distribute-queue) */
  useQueue?: boolean
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

  // 2.5. Criar deal para o lead (novo ou existente)
  await createDealForLead(supabase, supabasePublic, params, lead, isNewLead)

  // 3. Buscar avatar do WhatsApp (se solicitado e lead sem avatar)
  // Webhook: sem avatar (lead de formulario, nao tem WhatsApp profile)
  if (params.source !== 'webhook' && !lead.avatar_url && params.fetchAvatar) {
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

  // 3b. Avatar via URL direta (Evolution via Hub) — só se lead ainda sem avatar
  if (!lead.avatar_url && !params.fetchAvatar && params.profilePicUrl) {
    await fetchAndUploadAvatarFromUrl(
      params.supabaseUrl,
      params.supabaseKey,
      supabase,
      lead.id,
      params.profilePicUrl,
    )
  }

  // 4. Salvar mensagem
  // Temperatura: o trigger trg_lead_temperature_on_message (migration 063)
  // seta last_customer_message_at + temperature='fire' automaticamente
  // ao inserir mensagem com sender_type='lead'. Nao precisa fazer aqui.
  // Webhook: nao cria mensagem (lead de formulario, sem conversa)
  let savedMessage: { id: string } | null = null
  if (params.source !== 'webhook') {
    const { data } = await supabase.from('messages').insert({
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
    savedMessage = data

    // 5.1 Persistir midia no Storage (download + reupload)
    // URLs externas do WhatsApp/Evolution expiram. Baixar e salvar no bucket proprio.
    if (params.fileUrl && savedMessage?.id) {
      fetchAndUploadMedia(
        params.supabaseUrl,
        params.supabaseKey,
        supabase,
        savedMessage.id,
        params.companyId,
        params.fileUrl,
        params.fileMimeType,
        params.fileName,
      )
    }
  }

  // 6. Transcricao de audio (async, nao bloqueia)
  // Nota: transcricao usa fileUrl original (ainda valida neste momento)
  if ((params.messageType === 'audio') && params.fileUrl && savedMessage?.id) {
    const openaiKey = Deno.env.get('OPENAI_API_KEY')
    if (openaiKey) {
      transcribeAudio(supabase, params.fileUrl, savedMessage.id, openaiKey)
    }
  }

  // 7. Disparar SDR e automacoes (async, best-effort)
  const fnHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${params.supabaseKey}` }

  // SDR dispatch: apenas para WhatsApp/Instagram (precisa de mensagem para responder)
  if (params.source !== 'webhook') {
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
  }

  // Automacoes: dispara para TODOS os sources (webhook incluso)
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

  // 8. Auto-reply fora do horario (apenas para leads novos de WhatsApp/Instagram)
  if (params.source !== 'webhook' && isNewLead) {
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
  // Pipeline: usar override (webhook) ou buscar default (whatsapp/instagram)
  let pipelineId: string | undefined = params.pipelineId

  if (!pipelineId) {
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

    pipelineId = rawDefault?.id

    if (!pipelineId) {
      const { data: fallback, error: fallbackError } = await supabase
        .from('pipelines')
        .select('id')
        .eq('company_id', params.companyId)
        .eq('is_active', true)
        .order('position')
        .order('created_at')
        .limit(1)
        .maybeSingle()
      if (fallbackError) {
        console.error('[lead-inbound] Error fetching fallback pipeline:', JSON.stringify(fallbackError))
      }
      pipelineId = fallback?.id
    }
  }

  // Primeiro stage
  const { data: defaultStage } = pipelineId
    ? await supabase
        .from('pipeline_stages')
        .select('id')
        .eq('pipeline_id', pipelineId)
        .order('position')
        .limit(1)
        .maybeSingle()
    : { data: null }

  // Source: usar override (webhook) ou buscar por slug 'whatsapp'
  let sourceId: string | null = params.sourceId ?? null
  if (!sourceId) {
    const { data: whatsappSource } = await supabase
      .from('lead_sources')
      .select('id')
      .eq('company_id', params.companyId)
      .eq('slug', 'whatsapp')
      .maybeSingle()
    sourceId = whatsappSource?.id ?? null
  }

  // Atribuicao: webhook usa fila (distribute-queue), outros atribuem imediatamente
  let assignedTo: string | null = null

  if (!params.useQueue) {
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
  }

  const { data: newLead } = await supabase
    .from('leads')
    .insert({
      company_id: params.companyId,
      phone: params.phone,
      name: params.senderName,
      pipeline_id: pipelineId,
      stage_id: defaultStage?.id,
      source_id: sourceId,
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

/** Baixa avatar de URL direta (Evolution via Hub) e salva no Storage. */
async function fetchAndUploadAvatarFromUrl(
  supabaseUrl: string,
  supabaseKey: string,
  supabase: SupabaseClient,
  leadId: string,
  picUrl: string,
): Promise<void> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    const imgRes = await fetch(picUrl, { signal: controller.signal })
    clearTimeout(timeout)
    if (!imgRes.ok) return

    const imgBuffer = await imgRes.arrayBuffer()
    if (imgBuffer.byteLength === 0) return

    const path = `avatars/${leadId}.jpg`
    const storageClient = createClient(supabaseUrl, supabaseKey)
    const { error: uploadError } = await storageClient.storage
      .from('chat-attachments')
      .upload(path, imgBuffer, { contentType: 'image/jpeg', upsert: true })

    if (uploadError) {
      console.error('Avatar URL upload error:', JSON.stringify(uploadError))
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
    console.error('Avatar URL fetch failed:', err instanceof Error ? err.message : JSON.stringify(err))
  }
}

/** Baixa midia de URL externa e re-upa para chat-attachments. Atualiza file_url da mensagem. */
async function fetchAndUploadMedia(
  supabaseUrl: string,
  supabaseKey: string,
  supabase: SupabaseClient,
  messageId: string,
  companyId: string,
  externalUrl: string,
  mimeType: string | null,
  fileName: string | null,
): Promise<void> {
  try {
    const res = await fetch(externalUrl)
    if (!res.ok) {
      console.error(`[media-upload] Download failed (${res.status}) for message ${messageId}`)
      return
    }

    const buffer = await res.arrayBuffer()
    const contentType = mimeType ?? res.headers.get('content-type') ?? 'application/octet-stream'

    // Extensao: do fileName, do mimeType, ou fallback
    const ext = fileName
      ? fileName.split('.').pop() ?? extensionFromMime(contentType)
      : extensionFromMime(contentType)

    const path = `${companyId}/${messageId}.${ext}`

    const storageClient = createClient(supabaseUrl, supabaseKey)
    const { error: uploadError } = await storageClient.storage
      .from('chat-attachments')
      .upload(path, buffer, { contentType, upsert: true })

    if (uploadError) {
      console.error('[media-upload] Upload error:', JSON.stringify(uploadError))
      return
    }

    const { data: urlData } = storageClient.storage
      .from('chat-attachments')
      .getPublicUrl(path)

    await supabase
      .from('messages')
      .update({ file_url: urlData.publicUrl })
      .eq('id', messageId)

    console.log(`[media-upload] Persisted media for message ${messageId}`)
  } catch (err) {
    console.error('[media-upload] Failed:', err instanceof Error ? err.message : JSON.stringify(err))
  }
}

function extensionFromMime(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
    'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'mp4', 'audio/webm': 'webm',
    'video/mp4': 'mp4', 'video/3gpp': '3gp', 'video/webm': 'webm',
    'application/pdf': 'pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  }
  // Tentar match exato, depois match parcial (audio/ogg; codecs=opus -> audio/ogg)
  const base = mime.split(';')[0].trim()
  return map[base] ?? base.split('/')[1]?.replace(/[^a-z0-9]/g, '') ?? 'bin'
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

async function createDealForLead(
  supabase: SupabaseClient,
  supabasePublic: SupabaseClient,
  params: InboundParams,
  lead: { id: string; assigned_to: string | null; avatar_url: string | null; name: string | null; whatsapp_instance_name: string | null },
  isNewLead: boolean,
): Promise<void> {
  try {
    // Buscar pipeline: usar override (webhook) ou default
    let pipeline: { id: string; name: string } | null = null

    if (params.pipelineId) {
      const { data } = await supabase
        .from('pipelines')
        .select('id, name')
        .eq('id', params.pipelineId)
        .single()
      pipeline = data
    }

    if (!pipeline) {
      const { data: defaultPipeline } = await supabase
        .from('pipelines')
        .select('id, name')
        .eq('company_id', params.companyId)
        .eq('is_default', true)
        .eq('is_active', true)
        .maybeSingle()

      pipeline = defaultPipeline ?? (await supabase
        .from('pipelines')
        .select('id, name')
        .eq('company_id', params.companyId)
        .eq('is_active', true)
        .order('position')
        .limit(1)
        .single()).data
    }

    if (!pipeline) return

    const { data: firstStage } = await supabase
      .from('pipeline_stages')
      .select('id')
      .eq('pipeline_id', pipeline.id)
      .order('position')
      .limit(1)
      .single()

    if (!firstStage) return

    // Guard global: lead ja tem deal (qualquer status) neste pipeline?
    // Opcao B: 1 contato = max 1 deal automatico por pipeline.
    // Vendedor cria nova oportunidade manualmente se quiser (via UI).
    const { data: anyDealInPipeline } = await supabase
      .from('deals')
      .select('id')
      .eq('lead_id', lead.id)
      .eq('pipeline_id', pipeline.id)
      .limit(1)

    if (anyDealInPipeline && anyDealInPipeline.length > 0) return

    if (isNewLead) {
      // Lead novo: criar deal normal
      await supabase.from('deals').insert({
        company_id: params.companyId,
        lead_id: lead.id,
        name: `Negocio - ${pipeline.name}`,
        pipeline_id: pipeline.id,
        stage_id: firstStage.id,
        status: 'open',
        assigned_to: lead.assigned_to,
      })
      return
    }

    // Lead existente: verificar conflito de territorio
    const { data: existingDeals } = await supabase
      .from('deals')
      .select('id, assigned_to, pipeline_id, status')
      .eq('lead_id', lead.id)
      .in('status', ['open', 'pending_assignment'])

    // Buscar assignee de um deal open (nao pending_assignment que tem assigned_to=null)
    const existingAssignee = existingDeals?.find((d) => d.status === 'open' && d.assigned_to)?.assigned_to ?? null

    const hasConflict = existingAssignee &&
      existingDeals?.some((d) => d.pipeline_id !== pipeline.id)

    if (hasConflict) {
      // Conflito de territorio: criar deal pendente
      const { data: newDeal } = await supabase.from('deals').insert({
        company_id: params.companyId,
        lead_id: lead.id,
        name: `Negocio - ${pipeline.name}`,
        pipeline_id: pipeline.id,
        stage_id: firstStage.id,
        status: 'pending_assignment',
        assigned_to: null,
      }).select('id').single()

      if (newDeal) {
        // Notificar gestores/admins sobre conflito
        await notifyManagersAboutConflict(supabase, supabasePublic, {
          companyId: params.companyId,
          leadId: lead.id,
          leadName: lead.name ?? params.phone,
          dealId: newDeal.id,
          existingAssigneeId: existingAssignee,
          pipelineName: pipeline.name,
        })
      }
    } else if (!existingDeals || existingDeals.length === 0) {
      // Sem deals existentes (em qualquer pipeline): criar deal normal
      await supabase.from('deals').insert({
        company_id: params.companyId,
        lead_id: lead.id,
        name: `Negocio - ${pipeline.name}`,
        pipeline_id: pipeline.id,
        stage_id: firstStage.id,
        status: 'open',
        assigned_to: existingAssignee ?? lead.assigned_to,
      })
    }
    // Se ja tem deals no mesmo pipeline, nao cria duplicata
  } catch (err) {
    console.error('[lead-inbound] Error creating deal:', err)
    // Best-effort: nao bloqueia o fluxo de mensagem
  }
}

async function notifyManagersAboutConflict(
  supabase: SupabaseClient,
  supabasePublic: SupabaseClient,
  data: {
    companyId: string
    leadId: string
    leadName: string
    dealId: string
    existingAssigneeId: string
    pipelineName: string
  },
): Promise<void> {
  try {
    // Buscar nome do vendedor existente
    const { data: assigneeProfile } = await supabasePublic
      .from('profiles')
      .select('name')
      .eq('id', data.existingAssigneeId)
      .single()

    const assigneeName = assigneeProfile?.name ?? 'vendedor'

    // Buscar gestores e admins da empresa
    const { data: managerRoles } = await supabasePublic
      .from('user_roles')
      .select('user_id')
      .eq('company_id', data.companyId)
      .in('role', ['admin', 'manager'])

    if (!managerRoles || managerRoles.length === 0) return

    const notifications = managerRoles.map((r) => ({
      company_id: data.companyId,
      user_id: r.user_id,
      type: 'territory_conflict',
      title: 'Conflito de territorio',
      body: `${data.leadName} ja e atendido por ${assigneeName}. Nova entrada em ${data.pipelineName}. Clique para atribuir.`,
      action_type: 'assign_deal',
      action_data: { deal_id: data.dealId, lead_id: data.leadId },
    }))

    await supabase.from('notifications').insert(notifications)
  } catch (err) {
    console.error('[lead-inbound] Error notifying managers:', err)
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
