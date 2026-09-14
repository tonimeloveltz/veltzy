import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import { getCorsHeaders } from '../_shared/cors.ts'
import { verifyMetaSignature } from '../_shared/meta-signature.ts'
import { handleInboundMessage } from '../_shared/lead-inbound-handler.ts'
import { instagramTokenSecretName, lerSegredo } from '../_shared/vault-secret.ts'
import { graphRequest, parseJsonKeepingBigIds } from '../_shared/instagram-graph.ts'
import { mapInstagramMessaging, type InstagramWebhookAction } from '../_shared/instagram-webhook-mapper.ts'
import { findEchoMatch } from '../_shared/instagram-echo-match.ts'

// Instagram DM, Onda 1 (Spec 5.2): webhook do produto Instagram (Instagram Login).
// Resposta sempre 200 depois da assinatura conferida: a Meta reenvia por 36h e
// pode desativar o webhook se falhar muito. Erro de um item nao derruba os demais.

type InboundAction = Extract<InstagramWebhookAction, { kind: 'inbound' }>
type EchoAction = Extract<InstagramWebhookAction, { kind: 'echo' }>
type ReadAction = Extract<InstagramWebhookAction, { kind: 'read' }>

interface ContactProfile {
  name?: string
  username?: string
  profile_pic?: string
}

/** Janela para casar o echo com a mensagem que o proprio Veltzy acabou de enviar. */
const ECHO_MATCH_WINDOW_MS = 120_000

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null

const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err))

/** Com Instagram Login a Meta assina com o secret do produto Instagram; META_APP_SECRET cobre app compartilhado. */
const isSignatureValid = async (rawBody: string, header: string | null): Promise<boolean> => {
  for (const secret of [Deno.env.get('INSTAGRAM_APP_SECRET'), Deno.env.get('META_APP_SECRET')]) {
    if (secret && await verifyMetaSignature(rawBody, header, secret)) return true
  }
  return false
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  if (req.method === 'GET') {
    const url = new URL(req.url)
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')
    const verifyToken = Deno.env.get('INSTAGRAM_VERIFY_TOKEN')
    if (mode === 'subscribe' && verifyToken && token === verifyToken) {
      return new Response(challenge, { status: 200 })
    }
    return new Response('Forbidden', { status: 403 })
  }

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // A4: HMAC do corpo CRU, antes de qualquer parse. Sem secret configurado, recusa.
  const rawBody = await req.text()
  if (!(await isSignatureValid(rawBody, req.headers.get('x-hub-signature-256')))) {
    return json({ error: 'Invalid signature' }, 401)
  }

  try {
    const payload = asRecord(parseJsonKeepingBigIds(rawBody))
    if (!payload || payload.object !== 'instagram') return json({ ok: true, ignored: true })

    const supabase = createClient(supabaseUrl, supabaseKey, { db: { schema: 'veltzy' } })
    const supabasePublic = createClient(supabaseUrl, supabaseKey)

    // Caches por request: varias mensagens do mesmo lote costumam ser da mesma conta.
    const connections = new Map<string, Promise<string | null>>()
    const tokens = new Map<string, Promise<string | null>>()

    const resolveCompanyId = (igAccountId: string): Promise<string | null> => {
      if (!connections.has(igAccountId)) {
        connections.set(igAccountId, (async () => {
          const { data } = await supabase
            .from('instagram_connections')
            .select('company_id')
            .eq('instagram_account_id', igAccountId)
            .eq('is_active', true)
            .maybeSingle()
          return data?.company_id ?? null
        })())
      }
      return connections.get(igAccountId)!
    }

    const getToken = (companyId: string): Promise<string | null> => {
      if (!tokens.has(companyId)) {
        tokens.set(companyId, lerSegredo(supabasePublic, instagramTokenSecretName(companyId)))
      }
      return tokens.get(companyId)!
    }

    const findLeadId = async (companyId: string, igsid: string): Promise<string | null> => {
      const { data } = await supabase
        .from('leads')
        .select('id')
        .eq('company_id', companyId)
        .eq('instagram_id', igsid)
        .maybeSingle()
      return data?.id ?? null
    }

    /** Nome, @ e foto do contato. Falha aqui nunca impede a mensagem. */
    const fetchContactProfile = async (companyId: string, igsid: string): Promise<ContactProfile> => {
      try {
        const token = await getToken(companyId)
        if (!token) return {}
        const result = await graphRequest<ContactProfile>(`/${encodeURIComponent(igsid)}`, {
          token,
          query: { fields: 'name,username,profile_pic' },
        })
        if (!result.ok) {
          console.warn('[instagram-webhook] perfil do contato indisponivel', { code: result.error.code, message: result.error.message })
          return {}
        }
        return result.data
      } catch (err) {
        console.warn('[instagram-webhook] perfil do contato indisponivel', { message: errorMessage(err) })
        return {}
      }
    }

    const processInbound = async (
      companyId: string,
      action: InboundAction | EchoAction,
      senderType: 'lead' | 'human',
    ): Promise<void> => {
      const { data: existing } = await supabase
        .from('leads')
        .select('avatar_url, instagram_handle')
        .eq('company_id', companyId)
        .eq('instagram_id', action.igsid)
        .maybeSingle()
      // Perfil so para contato novo ou lead sem foto E sem @: contato que nao tem
      // foto no Instagram nao gera uma chamada a Graph API por mensagem.
      const needsProfile = !existing || (!existing.avatar_url && !existing.instagram_handle)
      const profile: ContactProfile = needsProfile ? await fetchContactProfile(companyId, action.igsid) : {}
      const isOwnerReply = senderType === 'human'

      await handleInboundMessage({
        supabaseUrl,
        supabaseKey,
        companyId,
        source: 'instagram',
        phone: `ig_${action.igsid}`,
        instagramId: action.igsid,
        instagramUsername: profile.username ?? null,
        senderName: isOwnerReply ? null : profile.name ?? (profile.username ? `@${profile.username}` : null),
        content: action.content,
        messageType: action.messageType,
        externalId: action.mid,
        fileUrl: action.fileUrl,
        fileName: action.fileName,
        fileMimeType: action.fileMimeType,
        instanceName: null,
        adContext: action.kind === 'inbound' ? action.adContext : null,
        adId: action.kind === 'inbound' ? action.adId : null,
        profilePicUrl: profile.profile_pic ?? null,
        // Echo do dono pelo app: mensagem humana, sem deal, SDR, automacao ou auto-reply.
        ...(isOwnerReply ? { senderType: 'human' as const, skipSideEffects: true } : {}),
      })
    }

    const processEcho = async (companyId: string, action: EchoAction): Promise<void> => {
      // 1. Mensagem enviada pelo Veltzy que ja recebeu o external_id.
      const { data: known } = await supabase
        .from('messages')
        .select('id')
        .eq('company_id', companyId)
        .eq('external_id', action.mid)
        .maybeSingle()
      if (known) return

      // 2. Echo chegou antes de o instagram-send gravar o external_id.
      const leadId = await findLeadId(companyId, action.igsid)
      if (leadId) {
        // Mensagens nao-lead recentes do lead, da mais nova para a mais antiga
        // (limite de seguranca de 20). A regra de casamento mora no helper puro.
        const { data: recent } = await supabase
          .from('messages')
          .select('id, content, external_id, message_type')
          .eq('company_id', companyId)
          .eq('lead_id', leadId)
          .eq('source', 'instagram')
          .neq('sender_type', 'lead')
          .gte('created_at', new Date(Date.now() - ECHO_MATCH_WINDOW_MS).toISOString())
          .order('created_at', { ascending: false })
          .limit(20)
        const match = findEchoMatch(
          { content: action.content, messageType: action.messageType },
          recent ?? [],
        )

        if (match) {
          if (!match.external_id) {
            await supabase
              .from('messages')
              .update({ external_id: action.mid })
              .eq('id', match.id)
              .is('external_id', null)
          }
          return
        }
      }

      // 3. O dono respondeu pelo app do Instagram.
      await processInbound(companyId, action, 'human')
    }

    const processRead = async (companyId: string, action: ReadAction): Promise<void> => {
      const leadId = await findLeadId(companyId, action.igsid)
      if (!leadId) return

      const { data: readMessage } = await supabase
        .from('messages')
        .select('created_at')
        .eq('company_id', companyId)
        .eq('lead_id', leadId)
        .eq('external_id', action.mid)
        .maybeSingle()
      if (!readMessage) return

      await supabase
        .from('messages')
        .update({ delivery_status: 'read' })
        .eq('company_id', companyId)
        .eq('lead_id', leadId)
        .eq('source', 'instagram')
        .neq('sender_type', 'lead')
        .in('delivery_status', ['sent', 'delivered'])
        .lte('created_at', readMessage.created_at)
    }

    const entries = Array.isArray(payload.entry) ? payload.entry : []
    for (const rawEntry of entries) {
      const entry = asRecord(rawEntry)
      const entryId = typeof entry?.id === 'string' ? entry.id : typeof entry?.id === 'number' ? String(entry.id) : ''
      const items = Array.isArray(entry?.messaging) ? entry.messaging : []

      for (const item of items) {
        let actions: InstagramWebhookAction[]
        try {
          actions = mapInstagramMessaging(entryId, item)
        } catch (err) {
          console.error('[instagram-webhook] item ilegivel', { entryId, message: errorMessage(err) })
          continue
        }

        for (const action of actions) {
          try {
            if (action.kind === 'ignored') {
              console.log('[instagram-webhook] ignorado', { entryId, reason: action.reason })
              continue
            }

            const companyId = await resolveCompanyId(action.igAccountId)
            if (!companyId) {
              console.warn('[instagram-webhook] sem conexao ativa', { entryId, igAccountId: action.igAccountId })
              continue
            }

            if (action.kind === 'inbound') await processInbound(companyId, action, 'lead')
            else if (action.kind === 'echo') await processEcho(companyId, action)
            else await processRead(companyId, action)
          } catch (err) {
            console.error('[instagram-webhook] falha ao processar acao', { entryId, kind: action.kind, message: errorMessage(err) })
          }
        }
      }
    }

    return json({ ok: true })
  } catch (err) {
    console.error('[instagram-webhook] erro inesperado', { message: errorMessage(err) })
    return json({ ok: true })
  }
})
