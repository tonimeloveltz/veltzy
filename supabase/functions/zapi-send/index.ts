import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getWhatsAppConfig } from '../_shared/whatsapp-config.ts'
import { createProvider } from '../_shared/whatsapp-factory.ts'

import { getCorsHeaders } from '../_shared/cors.ts'

interface SendPayload {
  leadId: string
  content: string
  messageType?: string
  fileUrl?: string
  fileName?: string
  mimeType?: string
  repliedMessageId?: string
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const url = Deno.env.get('SUPABASE_URL')!
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseAuth = createClient(url, key)
    const supabase = createClient(url, key, { db: { schema: 'veltzy' } })
    const supabasePublic = createClient(url, key, {
      global: { headers: { Authorization: authHeader } }
    })

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const payload: SendPayload = await req.json()

    const { data: profile } = await supabasePublic
      .from('profiles')
      .select('company_id')
      .eq('user_id', user.id)
      .single()

    if (!profile?.company_id) {
      return new Response(JSON.stringify({ error: 'No company' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { data: lead } = await supabase
      .from('leads')
      .select('phone')
      .eq('id', payload.leadId)
      .eq('company_id', profile.company_id)
      .single()

    if (!lead) {
      return new Response(JSON.stringify({ error: 'Lead not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const config = await getWhatsAppConfig(supabasePublic, profile.company_id)

    if (config?.status === 'connected') {
      const provider = createProvider(config.provider)
      const msgType = (payload.messageType ?? 'text') as 'text' | 'image' | 'audio' | 'video' | 'document'

      await provider.sendMessage(config, {
        phone: lead.phone,
        content: payload.content,
        type: msgType,
        mediaUrl: payload.fileUrl,
        fileName: payload.fileName,
      })
    }

    const { data: message } = await supabase
      .from('messages')
      .insert({
        lead_id: payload.leadId,
        company_id: profile.company_id,
        content: payload.content,
        sender_type: 'human',
        message_type: payload.messageType ?? 'text',
        file_url: payload.fileUrl ?? null,
        file_name: payload.fileName ?? null,
        file_mime_type: payload.mimeType ?? null,
        source: config?.status === 'connected' ? 'whatsapp' : 'manual',
        replied_message_id: payload.repliedMessageId ?? null,
      })
      .select()
      .single()

    await supabase
      .from('leads')
      .update({ conversation_status: 'replied' })
      .eq('id', payload.leadId)

    // F3: Popula first_response_at na primeira resposta do vendedor
    await supabase
      .from('leads')
      .update({ first_response_at: new Date().toISOString() })
      .eq('id', payload.leadId)
      .is('first_response_at', null)

    return new Response(JSON.stringify(message), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
