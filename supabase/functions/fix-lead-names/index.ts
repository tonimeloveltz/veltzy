import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getWhatsAppConfig } from '../_shared/whatsapp-config.ts'
import { createProvider } from '../_shared/whatsapp-factory.ts'

import { getCorsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(url, key, { db: { schema: 'veltzy' } })
    const supabasePublic = createClient(url, key)

    const companyId = 'd20f7d62-974b-40c4-8f0b-bb8207513554'

    const config = await getWhatsAppConfig(supabasePublic, companyId, { status: 'connected' })
    if (!config) {
      return new Response(
        JSON.stringify({ error: 'WhatsApp nao configurado ou desconectado' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const provider = createProvider(config.provider)
    const chats = await provider.getChats(config)

    const chatMap = new Map<string, string>()
    for (const chat of chats) {
      if (!chat.isGroup && chat.name && chat.phone) {
        chatMap.set(chat.phone, chat.name)
      }
    }

    // Busca leads sem nome ou com nome generico
    const { data: leads, error } = await supabase
      .from('leads')
      .select('id, phone, name')
      .eq('company_id', companyId)
      .or('name.is.null,name.like.Contato%')

    if (error) throw error
    if (!leads || leads.length === 0) {
      return new Response(
        JSON.stringify({ message: 'Nenhum lead sem nome encontrado', updated: 0, chatsFound: chatMap.size }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const results: { id: string; phone: string; oldName: string | null; newName: string | null; status: string }[] = []

    for (const lead of leads) {
      // Pula leads do Instagram (phone com 14+ digitos e nao comeca com 55)
      if (lead.phone.length >= 14 && !lead.phone.startsWith('55')) {
        results.push({ id: lead.id, phone: lead.phone, oldName: lead.name, newName: null, status: 'skipped_instagram' })
        continue
      }

      const name = chatMap.get(lead.phone) ?? null

      if (name) {
        await supabase
          .from('leads')
          .update({ name })
          .eq('id', lead.id)
        results.push({ id: lead.id, phone: lead.phone, oldName: lead.name, newName: name, status: 'updated' })
      } else {
        results.push({ id: lead.id, phone: lead.phone, oldName: lead.name, newName: null, status: 'no_match_in_chats' })
      }
    }

    const updated = results.filter(r => r.status === 'updated').length

    return new Response(
      JSON.stringify({ total: leads.length, updated, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
