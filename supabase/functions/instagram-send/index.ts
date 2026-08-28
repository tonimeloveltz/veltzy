import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(url, key, { db: { schema: 'veltzy' } })
    const supabaseAuth = createClient(url, key)
    const supabasePublic = createClient(url, key)

    // C4: company vem sempre do JWT, nunca do body. Unica origem e o front
    // (messages.service.ts), sempre com token de usuario — sem ramo service role.
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const { data: profile } = await supabasePublic.from('profiles').select('company_id').eq('user_id', user.id).single()
    if (!profile?.company_id) {
      return new Response(JSON.stringify({ error: 'No company' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const companyId = profile.company_id

    const { leadId, content } = await req.json()

    // lead escopado por empresa: nao da para referenciar lead de outro tenant.
    const { data: lead } = await supabase.from('leads').select('instagram_id').eq('id', leadId).eq('company_id', companyId).single()
    if (!lead?.instagram_id) return new Response(JSON.stringify({ error: 'No Instagram ID' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const { data: connection } = await supabase.from('instagram_connections').select('access_token, page_id').eq('company_id', companyId).single()
    if (!connection) return new Response(JSON.stringify({ error: 'No connection' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    await fetch(`https://graph.facebook.com/v18.0/${connection.page_id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: lead.instagram_id },
        message: { text: content },
        access_token: connection.access_token,
      }),
    })

    const { data: message } = await supabase.from('messages').insert({
      lead_id: leadId,
      company_id: companyId,
      content,
      sender_type: 'human',
      message_type: 'text',
      source: 'instagram',
    }).select().single()

    return new Response(JSON.stringify(message), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
