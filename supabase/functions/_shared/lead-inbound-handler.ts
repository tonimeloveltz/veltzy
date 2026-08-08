import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { resolvePipelineByOrigin, type OriginIdentifiers, type ResolvedPipeline } from './resolve-pipeline-by-origin.ts'

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
  /** Número Cloud API que originou a conversa (V2 multi-número). Carimba
   *  leads.cloud_api_number_id para o outbound responder pelo número certo.
   *  null para Evolution/Z-API. */
  cloudApiNumberId?: string | null
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
  /** Identificadores de campanha vindos do webhook (Lead Ads / Google / UTM).
   *  No WhatsApp, o ad_id vem de adContext.ad_id (resolvido no handler). */
  adId?: string | null
  campaignId?: string | null
  utmCampaign?: string | null
  /** Se true, pula atribuicao imediata e coloca lead na fila (distribute-queue) */
  useQueue?: boolean
  /** sender_type da mensagem gravada. Default 'lead' (o contato escreveu).
   *  'human' = eco do dono pelo app (smb_message_echoes, coexistence);
   *  'ai' reservado. */
  senderType?: 'lead' | 'human' | 'ai'
  /** Se true, pula os efeitos de engajamento automatico: criacao de deal,
   *  SDR, automacoes e auto-reply. Usado por echoes/history da coexistence
   *  (mensagens do proprio dono ou historicas): nao devem fazer a IA responder
   *  nem gerar oportunidade/automacao. Default false (comportamento atual). */
  skipSideEffects?: boolean
  /** Se true, marca a mensagem como historica (is_history=true, coluna da
   *  migration 070) — dump de history do onboarding coexistence. A chave
   *  is_history so entra no INSERT quando true, entao mensagens normais nao
   *  referenciam a coluna e o codigo NAO depende da 070 estar aplicada: sem a
   *  migration, so a importacao de history falha, o inbound normal segue intacto.
   *  O caller de history passa isHistory e skipSideEffects juntos. Default false. */
  isHistory?: boolean
}

export interface InboundResult {
  leadId: string
  isNewLead: boolean
}

// --- Handler ---

export async function handleInboundMessage(params: InboundParams): Promise<InboundResult> {
  const supabase = createClient(params.supabaseUrl, params.supabaseKey, { db: { schema: 'veltzy' } })
  const supabasePublic = createClient(params.supabaseUrl, params.supabaseKey)

  // Echoes (dono mandou pelo app) e history (dump) nao disparam engajamento
  // automatico: sem deal novo, sem SDR, sem automacao, sem auto-reply.
  const skipSideEffects = params.skipSideEffects ?? false

  // 0. Origem -> pipeline: resolver UMA vez (RF6, elimina o ponto duplo de decisao).
  //    source_id: webhook usa o override (params.sourceId); WhatsApp/IG resolve pelo slug 'whatsapp'.
  //    Alimenta tanto o resolver (habilita catch-all webhook_source) quanto a coluna deals.source_id (RF5).
  let originSourceId: string | null = params.sourceId ?? null
  if (!originSourceId) {
    const { data: whatsappSource } = await supabase
      .from('lead_sources')
      .select('id')
      .eq('company_id', params.companyId)
      .eq('slug', 'whatsapp')
      .maybeSingle()
    originSourceId = whatsappSource?.id ?? null
  }
  const adCtx = (params.adContext ?? {}) as Record<string, unknown>
  const origin: OriginIdentifiers = {
    adId: params.adId ?? (adCtx.ad_id as string | undefined) ?? null,
    campaignId: params.campaignId ?? null,
    utmCampaign: params.utmCampaign ?? null,
    instanceName: params.instanceName ?? null,
    sourceId: originSourceId,
  }
  const resolved = await resolvePipelineByOrigin(supabase, params.companyId, origin)

  // 1. Buscar lead existente
  let { data: lead } = await supabase
    .from('leads')
    .select('id, assigned_to, avatar_url, name, whatsapp_instance_name, cloud_api_number_id')
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

  // Carimbar o numero Cloud API de origem se veio e mudou (V2 multi-numero):
  // o outbound (whatsapp-send) le leads.cloud_api_number_id para responder
  // pelo numero certo. Espelha a logica de whatsapp_instance_name acima.
  if (lead && params.cloudApiNumberId && lead.cloud_api_number_id !== params.cloudApiNumberId) {
    await supabase.from('leads')
      .update({ cloud_api_number_id: params.cloudApiNumberId })
      .eq('id', lead.id)
  }

  const isNewLead = !lead

  // 2. Criar lead se nao existe
  if (!lead) {
    lead = await createLead(supabase, supabasePublic, params, resolved, originSourceId)
  }

  if (!lead) {
    throw new Error('Failed to create lead')
  }

  // 2.5. Criar deal para o lead (novo ou existente).
  // skipSideEffects (echoes/history): nao gerar oportunidade automatica.
  if (!skipSideEffects) {
    await createDealForLead(supabase, supabasePublic, params, lead, isNewLead, resolved, origin)
  }

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
  let isDuplicate = false
  if (params.source !== 'webhook') {
    // Dedup: se external_id presente, checar se ja existe (indice parcial unique)
    if (params.externalId) {
      const { data: existing } = await supabase
        .from('messages')
        .select('id')
        .eq('company_id', params.companyId)
        .eq('external_id', params.externalId)
        .maybeSingle()
      if (existing) {
        savedMessage = existing
        isDuplicate = true
        console.log(`[dedup] Skipped duplicate message: external_id=${params.externalId}`)
      }
    }

    if (!isDuplicate) {
      const { data, error: insertError } = await supabase.from('messages').insert({
        lead_id: lead.id,
        company_id: params.companyId,
        content: params.content,
        sender_type: params.senderType ?? 'lead',
        message_type: params.messageType,
        file_url: params.fileUrl,
        file_name: params.fileName,
        file_mime_type: params.fileMimeType,
        source: params.source,
        external_id: params.externalId,
        instance_name: params.instanceName,
        delivery_status: 'sent',
        // is_history so entra quando historica (migration 070): mensagens
        // normais nao referenciam a coluna -> deploy nao depende da 070.
        ...(params.isHistory ? { is_history: true } : {}),
      }).select('id').single()

      // Race condition: unique violation entre check e insert → tratar como duplicata
      if (insertError && insertError.code === '23505') {
        isDuplicate = true
        console.log(`[dedup] Race condition caught: external_id=${params.externalId}`)
      } else {
        savedMessage = data
      }
    }

    // 5.1 Persistir midia no Storage (download + reupload)
    // URLs externas do WhatsApp/Evolution expiram. Baixar e salvar no bucket proprio.
    // Se o Hub ja subiu pro Storage (URL contem /storage/v1/object/public/chat-attachments/),
    // a midia ja esta persistida — pular re-upload.
    // Pular se duplicata (midia ja foi persistida na primeira vez).
    if (!isDuplicate && params.fileUrl && savedMessage?.id) {
      const isAlreadyInStorage = params.fileUrl.includes('/storage/v1/object/public/chat-attachments/')
      if (isAlreadyInStorage) {
        // Midia ja persistida pelo Hub — so atualizar file_url da mensagem
        await supabase
          .from('messages')
          .update({ file_url: params.fileUrl })
          .eq('id', savedMessage.id)
      } else {
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
  }

  // Duplicata: pular todos os efeitos colaterais (transcricao, SDR, notificacao)
  if (isDuplicate) {
    return { leadId: lead.id, isNewLead }
  }

  // 6. Transcricao de audio (async, nao bloqueia)
  // Roteada pela edge ai-transcribe do Hub, que detem a chave, decide acesso
  // (check_ai_access) e loga o custo por empresa. Nota: usa fileUrl original
  // (ainda valida neste momento).
  if ((params.messageType === 'audio') && params.fileUrl && savedMessage?.id) {
    transcribeAudio(
      supabase,
      params.supabaseUrl,
      params.supabaseKey,
      params.companyId,
      params.fileUrl,
      savedMessage.id,
    )
  }

  // 7. Disparar SDR e automacoes (async, best-effort)
  const fnHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${params.supabaseKey}` }

  // SDR dispatch: apenas para WhatsApp/Instagram (precisa de mensagem para responder).
  // skipSideEffects (echoes/history): nao acionar a IA (senao ela responde a
  // propria mensagem do dono / mensagens antigas).
  if (params.source !== 'webhook' && !skipSideEffects) {
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

  // Automacoes: dispara para TODOS os sources (webhook incluso).
  // skipSideEffects (echoes/history): nao disparar automacao.
  if (!skipSideEffects) {
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
  }

  // 8. Auto-reply fora do horario (apenas para leads novos de WhatsApp/Instagram).
  // skipSideEffects (echoes/history): nao responder automaticamente.
  if (params.source !== 'webhook' && isNewLead && !skipSideEffects) {
    await handleAutoReply(supabase, params, lead.id)
  }

  return { leadId: lead.id, isNewLead }
}

// --- Funcoes auxiliares ---

async function createLead(
  supabase: SupabaseClient,
  supabasePublic: SupabaseClient,
  params: InboundParams,
  resolved: ResolvedPipeline,
  sourceId: string | null,
): Promise<{ id: string; assigned_to: string | null; avatar_url: string | null; name: string | null; whatsapp_instance_name: string | null; cloud_api_number_id: string | null } | null> {
  // Pipeline e source_id ja resolvidos UMA vez no handler (RF6): sem calculo proprio aqui.
  // leads.pipeline_id e NOT NULL (migration 027); createLead so roda para lead NOVO (D-3).
  const pipelineId = resolved.pipelineId ?? undefined

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
      // Negocio fica em deals: createDealForLead (chamado depois) cria o deal e
      // o espelho (trg_mirror_deal_to_lead) replica o stage de volta para o lead.
      // pipeline_id permanece porque leads.pipeline_id e NOT NULL (migration 027).
      company_id: params.companyId,
      phone: params.phone,
      name: params.senderName,
      pipeline_id: pipelineId,
      source_id: sourceId,
      assigned_to: assignedTo,
      is_queued: !assignedTo,
      ad_context: params.adContext,
      whatsapp_instance_name: params.instanceName,
      cloud_api_number_id: params.cloudApiNumberId ?? null,
    })
    .select('id, assigned_to, avatar_url, name, whatsapp_instance_name, cloud_api_number_id')
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

export interface TranscribeGatewayResult {
  ok?: boolean
  data?: { text?: string; duration_seconds?: number; cost_usd?: number; model?: string }
  error?: { code?: string; message?: string }
}

/**
 * Decide, a partir da resposta da edge ai-transcribe, se atualiza a mensagem com
 * o texto ou pula silenciosamente. Funcao pura (testavel sem a edge).
 * - 403 (empresa sem acesso de IA) -> pula.
 * - ok:false / corpo ausente -> pula.
 * - ok:true com texto nao-vazio -> aplica.
 */
export function decideTranscriptionUpdate(
  status: number,
  body: TranscribeGatewayResult | null,
): { apply: true; text: string } | { apply: false; reason: string } {
  if (status === 403) return { apply: false, reason: 'no_access_403' }
  if (!body || body.ok === false) return { apply: false, reason: 'gateway_not_ok' }
  const text = body.data?.text
  if (body.ok === true && typeof text === 'string' && text.trim().length > 0) {
    return { apply: true, text }
  }
  return { apply: false, reason: 'empty_text' }
}

async function transcribeAudio(
  supabase: SupabaseClient,
  supabaseUrl: string,
  supabaseKey: string,
  companyId: string,
  audioUrl: string,
  messageId: string,
): Promise<void> {
  try {
    const audioResponse = await fetch(audioUrl)
    const audioBuffer = await audioResponse.arrayBuffer()

    const formData = new FormData()
    formData.append('file', new Blob([audioBuffer], { type: 'audio/ogg' }), 'audio.ogg')
    formData.append('company_id', companyId)
    formData.append('product', 'veltzy')
    formData.append('feature', 'audio_transcription')
    formData.append('language', 'pt')

    // Edge->edge no padrao interno do Veltzy (Bearer service key). NAO setar
    // Content-Type: o fetch define o boundary do multipart automaticamente.
    const res = await fetch(`${supabaseUrl}/functions/v1/ai-transcribe`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${supabaseKey}` },
      body: formData,
    })

    const body = await res.json().catch(() => null) as TranscribeGatewayResult | null
    const decision = decideTranscriptionUpdate(res.status, body)
    if (decision.apply) {
      await supabase.from('messages').update({ content: decision.text }).eq('id', messageId)
    } else {
      console.log(`Transcription skipped for message ${messageId}: ${decision.reason}`)
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
  resolved: ResolvedPipeline,
  origin: OriginIdentifiers,
): Promise<void> {
  try {
    // Pipeline ja decidido UMA vez pela origem (RF6). Buscar o nome para o titulo do deal.
    if (!resolved.pipelineId) return
    const { data: pipeline } = await supabase
      .from('pipelines')
      .select('id, name')
      .eq('id', resolved.pipelineId)
      .maybeSingle()

    if (!pipeline) return

    const { data: firstStage } = await supabase
      .from('pipeline_stages')
      .select('id')
      .eq('pipeline_id', pipeline.id)
      .order('position')
      .limit(1)
      .maybeSingle()

    if (!firstStage) return

    // Origem do negocio (RF5): preenchida em TODOS os inserts de deal.
    const originFields = {
      source_id: origin.sourceId ?? null,
      origin_instance_name: origin.instanceName ?? null,
      origin_ad_id: origin.adId ?? null,
      origin_campaign_id: origin.campaignId ?? null,
      origin_utm_campaign: origin.utmCampaign ?? null,
      routing_rule_id: resolved.ruleId ?? null,
    }

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
        ...originFields,
      })
      return
    }

    // D-2: roteamento explicito por origem VENCE o guard de territorio.
    // Se a origem casou uma regra (matchType !== 'default'), o negocio nasce 'open'
    // no funil roteado sem virar pending_assignment (caso Joao: 2o negocio via anuncio).
    // O guard 1:1 acima continua valendo (idempotencia por pipeline).
    // DEFERRAL D-4: se o vendedor atribuido nao enxergar o pipeline roteado
    // (user_pipeline_access), NAO ha fallback pra fila/gestor nesta fase: limitacao
    // conhecida, baixo risco (user_pipeline_access e permissivo por default).
    const explicitlyRouted = resolved.matchType !== 'default'
    if (explicitlyRouted) {
      await supabase.from('deals').insert({
        company_id: params.companyId,
        lead_id: lead.id,
        name: `Negocio - ${pipeline.name}`,
        pipeline_id: pipeline.id,
        stage_id: firstStage.id,
        status: 'open',
        assigned_to: lead.assigned_to,
        ...originFields,
      })
      return
    }

    // Lead existente SEM roteamento explicito (caiu no default): manter a logica de conflito atual.
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
        ...originFields,
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
        ...originFields,
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
