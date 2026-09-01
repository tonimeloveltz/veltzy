import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import { getCorsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const supabaseAuth = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!)
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(authHeader.replace('Bearer ', ''))
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { action, companyId, code, redirectUri } = await req.json()

    // Verify user belongs to the company
    const { data: profile } = await supabaseAuth.from('profiles').select('company_id').eq('user_id', user.id).single()
    if (profile?.company_id !== companyId) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { db: { schema: 'veltzy' } })

    if (action === 'authorize') {
      const appId = Deno.env.get('INSTAGRAM_APP_ID')
      const authUrl = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=instagram_basic,instagram_manage_messages,pages_manage_metadata&response_type=code`
      return new Response(JSON.stringify({ url: authUrl }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'callback') {
      const appId = Deno.env.get('INSTAGRAM_APP_ID')
      const appSecret = Deno.env.get('INSTAGRAM_APP_SECRET')

      const tokenRes = await fetch(`https://graph.facebook.com/v18.0/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`)
      const tokenData = await tokenRes.json()

      const pagesRes = await fetch(`https://graph.facebook.com/v18.0/me/accounts?access_token=${tokenData.access_token}`)
      const pagesData = await pagesRes.json()
      const page = pagesData.data?.[0]

      if (!page) return new Response(JSON.stringify({ error: 'No page found' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

      const igRes = await fetch(`https://graph.facebook.com/v18.0/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`)
      const igData = await igRes.json()

      await supabase.from('instagram_connections').upsert({
        company_id: companyId,
        page_id: page.id,
        page_name: page.name,
        instagram_account_id: igData.instagram_business_account?.id ?? '',
        access_token: page.access_token,
      }, { onConflict: 'company_id' })

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'disconnect') {
      await supabase.from('instagram_connections').delete().eq('company_id', companyId)
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
