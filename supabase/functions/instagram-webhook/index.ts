import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verifyMetaSignature } from '../_shared/meta-signature.ts'

import { getCorsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'GET') {
    const url = new URL(req.url)
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')
    if (mode === 'subscribe' && token === Deno.env.get('INSTAGRAM_VERIFY_TOKEN')) {
      return new Response(challenge, { status: 200 })
    }
    return new Response('Forbidden', { status: 403 })
  }

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // A4: a Meta assina cada POST com HMAC-SHA256 do corpo cru (x-hub-signature-256).
    // Ler o corpo CRU antes de qualquer parse, senao o HMAC nao bate. Sem app
    // secret configurado, recusa (fail-closed) — nao processa webhook nao provado.
    const rawBody = await req.text()
    const appSecret = Deno.env.get('INSTAGRAM_APP_SECRET') ?? Deno.env.get('META_APP_SECRET')
    if (!appSecret || !(await verifyMetaSignature(rawBody, req.headers.get('x-hub-signature-256'), appSecret))) {
      return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const payload = JSON.parse(rawBody)
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { db: { schema: 'veltzy' } })

    for (const entry of payload.entry ?? []) {
      for (const messaging of entry.messaging ?? []) {
        if (!messaging.message?.text) continue

        const igAccountId = entry.id
        const senderId = messaging.sender.id
        const content = messaging.message.text
        const senderName = messaging.sender?.name ?? null

        const { data: connection } = await supabase
          .from('instagram_connections')
          .select('company_id')
          .eq('instagram_account_id', igAccountId)
          .single()

        if (!connection) continue

        // Busca lead por instagram_id
        let { data: lead } = await supabase
          .from('leads')
          .select('id, name')
          .eq('company_id', connection.company_id)
          .eq('instagram_id', senderId)
          .maybeSingle()

        // Atualiza nome se lead existe mas nao tem nome
        if (lead && (!lead.name || lead.name.startsWith('Contato ')) && senderName) {
          await supabase
            .from('leads')
            .update({ name: senderName })
            .eq('id', lead.id)
        }

        if (!lead) {
          let { data: defaultPipeline } = await supabase.from('pipelines').select('id').eq('company_id', connection.company_id).eq('is_default', true).maybeSingle()
          if (!defaultPipeline) {
            const { data: fallback } = await supabase.from('pipelines').select('id').eq('company_id', connection.company_id).eq('is_active', true).order('position').limit(1).maybeSingle()
            defaultPipeline = fallback
          }
          const { data: stage } = await supabase.from('pipeline_stages').select('id').eq('pipeline_id', defaultPipeline?.id).order('position').limit(1).maybeSingle()
          const { data: source } = await supabase.from('lead_sources').select('id').eq('company_id', connection.company_id).eq('slug', 'instagram').maybeSingle()
          // Negocio fica inteiro em deals, incluindo o pipeline: a coluna saiu
          // de `leads` na Onda 4. O insert do deal logo abaixo ja leva o
          // `defaultPipeline`.
          const { data: newLead } = await supabase.from('leads').insert({
            company_id: connection.company_id,
            phone: `ig_${senderId}`,
            instagram_id: senderId,
            name: senderName,
            source_id: source?.id,
          }).select('id').single()
          lead = newLead

          // Cria o deal do contato novo. Sem isso o lead fica orfao (nao aparece
          // no pipeline/Negocios) — mesmo bug ja corrigido no inbound/manual.
          if (newLead && defaultPipeline?.id && stage?.id) {
            await supabase.from('deals').insert({
              company_id: connection.company_id,
              lead_id: newLead.id,
              name: senderName ? `Negocio - ${senderName}` : 'Negocio',
              pipeline_id: defaultPipeline.id,
              stage_id: stage.id,
              status: 'open',
            })
          }
        }

        if (lead) {
          await supabase.from('messages').insert({
            lead_id: lead.id,
            company_id: connection.company_id,
            content,
            sender_type: 'lead',
            message_type: 'text',
            source: 'instagram',
          })
        }
      }
    }

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
