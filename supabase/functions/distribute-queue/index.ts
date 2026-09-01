import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { isCronAuthorized, cronUnauthorized } from '../_shared/cron-auth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // A5: so scheduler autenticado (service key ou x-cron-secret) dispara.
  if (!isCronAuthorized(req)) {
    return cronUnauthorized(corsHeaders)
  }

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(url, key, { db: { schema: 'veltzy' } })
    const supabasePublic = createClient(url, key, { db: { schema: 'public' } })

    const { data: queuedLeads } = await supabase
      .from('leads')
      .select('id, company_id')
      .eq('is_queued', true)
      .order('created_at')

    if (!queuedLeads || queuedLeads.length === 0) {
      return new Response(JSON.stringify({ distributed: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const companiesMap = new Map<string, string[]>()
    for (const lead of queuedLeads) {
      const list = companiesMap.get(lead.company_id) ?? []
      list.push(lead.id)
      companiesMap.set(lead.company_id, list)
    }

    let totalDistributed = 0

    for (const [companyId, leadIds] of companiesMap) {
      const { data: sellers } = await supabasePublic
        .from('profiles')
        .select('id')
        .eq('company_id', companyId)
        .eq('is_available', true)

      if (!sellers || sellers.length === 0) continue

      for (let i = 0; i < leadIds.length; i++) {
        const sellerId = sellers[i % sellers.length].id

        await supabase
          .from('leads')
          .update({ assigned_to: sellerId, is_queued: false })
          .eq('id', leadIds[i])

        await supabase.from('activity_logs').insert({
          company_id: companyId,
          action: 'queue_distributed',
          resource_type: 'lead',
          resource_id: leadIds[i],
          metadata: { assigned_to: sellerId },
        })

        totalDistributed++
      }
    }

    return new Response(JSON.stringify({ distributed: totalDistributed }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
