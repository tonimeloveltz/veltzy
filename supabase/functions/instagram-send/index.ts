import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import { getCorsHeaders } from '../_shared/cors.ts'
import { lerSegredo, instagramTokenSecretName } from '../_shared/vault-secret.ts'
import { graphRequest, isTokenInvalid, type GraphError } from '../_shared/instagram-graph.ts'
import { decideInstagramWindow } from '../_shared/instagram-window.ts'
import { isInstagramMimeAllowed } from '../_shared/instagram-attachment.ts'

// Instagram DM, Onda 1 (Spec 5.3): envio humano pelo Direct.
// Unica origem e o front (messages.service.ts#routeMessage), sempre com token de
// usuario. Sem ramo service role nesta onda (SDR/auto-reply por Instagram e Onda 2).

type InstagramSendType = 'text' | 'image' | 'video' | 'audio' | 'document'

interface InstagramSendBody {
  leadId: string
  content: string
  messageType?: InstagramSendType
  fileUrl?: string
  fileName?: string
  mimeType?: string
}

interface GraphSendResponse {
  recipient_id?: string
  message_id?: string
}

const SEND_TYPES: readonly InstagramSendType[] = ['text', 'image', 'video', 'audio', 'document']

const ATTACHMENT_TYPE: Record<Exclude<InstagramSendType, 'text'>, string> = {
  image: 'image',
  video: 'video',
  audio: 'audio',
  document: 'file',
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(url, key, { db: { schema: 'veltzy' } })
    const supabasePublic = createClient(url, key)

    // C4: company vem sempre do JWT, nunca do body (companyId do body e ignorado).
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Unauthorized' }, 401)
    const { data: { user }, error: authError } = await supabasePublic.auth.getUser(authHeader.replace('Bearer ', ''))
    if (authError || !user) return json({ error: 'Invalid token' }, 401)

    const { data: profile } = await supabasePublic.from('profiles').select('company_id').eq('user_id', user.id).single()
    if (!profile?.company_id) return json({ error: 'No company' }, 403)
    const companyId: string = profile.company_id

    const body = await req.json().catch(() => null) as Partial<InstagramSendBody> | null
    if (!body || typeof body.leadId !== 'string' || !body.leadId) return json({ error: 'lead_obrigatorio' }, 400)

    const messageType: InstagramSendType = body.messageType ?? 'text'
    if (!SEND_TYPES.includes(messageType)) return json({ error: 'formato_nao_suportado_instagram' }, 400)
    const content = typeof body.content === 'string' ? body.content : ''
    const fileUrl = typeof body.fileUrl === 'string' && body.fileUrl ? body.fileUrl : null
    const fileName = typeof body.fileName === 'string' && body.fileName ? body.fileName : null
    const mimeType = typeof body.mimeType === 'string' && body.mimeType ? body.mimeType : null
    if (messageType === 'text' && !content.trim()) return json({ error: 'conteudo_vazio' }, 400)
    if (messageType !== 'text' && !fileUrl) return json({ error: 'file_url_invalida' }, 400)

    // 2. Lead escopado por empresa: nao da para referenciar lead de outro tenant.
    const { data: lead } = await supabase
      .from('leads')
      .select('id, instagram_id')
      .eq('id', body.leadId)
      .eq('company_id', companyId)
      .maybeSingle()
    if (!lead) return json({ error: 'Lead not found' }, 404)
    if (!lead.instagram_id) return json({ error: 'lead_sem_instagram' }, 400)

    // 3. Conexao ativa e token do Vault (A7: o token nunca mora em coluna).
    const { data: connection } = await supabase
      .from('instagram_connections')
      .select('id, is_active, status')
      .eq('company_id', companyId)
      .maybeSingle()
    if (!connection?.is_active || connection.status !== 'active') return json({ error: 'instagram_desconectado' }, 409)
    const token = await lerSegredo(supabasePublic, instagramTokenSecretName(companyId))
    if (!token) return json({ error: 'instagram_desconectado' }, 409)

    // 4. Janela calculada so com mensagens do contato vindas do Instagram.
    const { data: lastInbound } = await supabase
      .from('messages')
      .select('created_at')
      .eq('company_id', companyId)
      .eq('lead_id', lead.id)
      .eq('source', 'instagram')
      .eq('sender_type', 'lead')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const window = decideInstagramWindow(
      lastInbound ? new Date(lastInbound.created_at) : null,
      new Date(),
      Deno.env.get('INSTAGRAM_HUMAN_AGENT_ENABLED') === 'true',
    )
    if (window === 'closed') return json({ error: 'instagram_window_closed' }, 422)

    // 5. So arquivo do nosso Storage: a function nao manda URL arbitraria.
    if (fileUrl && !fileUrl.startsWith(`${url}/storage/v1/object/`)) return json({ error: 'file_url_invalida' }, 400)

    // 6. Formatos que a Meta aceita no Direct (allowlist espelhada no front).
    if (messageType !== 'text' && !isInstagramMimeAllowed(messageType, mimeType)) {
      return json({ error: 'formato_nao_suportado_instagram' }, 400)
    }

    // 7. Grava ANTES da chamada: o echo da Meta pode chegar antes da resposta,
    // e o instagram-webhook casa o echo com esta linha.
    const { data: message, error: insertError } = await supabase
      .from('messages')
      .insert({
        lead_id: lead.id,
        company_id: companyId,
        content,
        sender_type: 'human',
        message_type: messageType,
        file_url: fileUrl,
        file_name: fileName,
        file_mime_type: mimeType,
        source: 'instagram',
        replied_message_id: null,
        instance_name: null,
        delivery_status: 'pending',
        delivery_error: null,
        external_id: null,
      })
      .select()
      .single()
    if (insertError || !message) throw new Error(`Falha ao gravar mensagem: ${insertError?.message ?? 'sem retorno'}`)

    // 8. Envio pela Graph API.
    const tag = window === 'human_agent' ? { messaging_type: 'MESSAGE_TAG', tag: 'HUMAN_AGENT' } : {}
    const send = (payload: Record<string, unknown>) =>
      graphRequest<GraphSendResponse>('/me/messages', {
        method: 'POST',
        token,
        body: { recipient: { id: lead.instagram_id }, message: payload, ...tag },
      })

    const result = messageType === 'text'
      ? await send({ text: content })
      : await send({ attachment: { type: ATTACHMENT_TYPE[messageType], payload: { url: fileUrl } } })

    // Legenda em segunda chamada so quando e texto de verdade: o chat-input manda
    // o nome do arquivo como content e o audio-recorder manda vazio.
    let captionError: GraphError | null = null
    if (result.ok && messageType !== 'text' && content.trim() && content !== fileName) {
      const caption = await send({ text: content })
      if (!caption.ok) captionError = caption.error
    }

    // 9. Resultado na mensagem e, se o token morreu, na conexao.
    const failure = result.ok ? captionError : result.error
    if (failure) {
      console.error('[instagram-send] Graph API recusou', { status: failure.status, code: failure.code, message: failure.message })
      if (isTokenInvalid(failure)) {
        await supabase
          .from('instagram_connections')
          .update({ status: 'token_expired', last_error: failure.message })
          .eq('company_id', companyId)
      }
    }

    const update = result.ok
      ? {
        external_id: result.data.message_id ?? null,
        delivery_status: 'sent',
        delivery_error: captionError ? `Legenda nao enviada: ${captionError.message}` : null,
      }
      : { delivery_status: 'failed', delivery_error: result.error.message }

    const { data: updated } = await supabase
      .from('messages')
      .update(update)
      .eq('id', message.id)
      .select()
      .single()

    // Status da conversa, igual ao whatsapp-send para mensagem humana.
    await supabase
      .from('leads')
      .update({ conversation_status: 'replied' })
      .eq('id', lead.id)

    await supabase
      .from('leads')
      .update({ first_response_at: new Date().toISOString() })
      .eq('id', lead.id)
      .is('first_response_at', null)

    // 10. Mesmo contrato do whatsapp-send: a linha da mensagem, 200 tambem quando failed.
    return json(updated ?? { ...message, ...update })
  } catch (err) {
    console.error('[instagram-send] Error:', err instanceof Error ? err.message : String(err))
    return json({ error: err instanceof Error ? err.message : 'Erro inesperado' }, 500)
  }
})
