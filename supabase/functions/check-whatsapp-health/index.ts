import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getAllConnectedConfigs, updateWhatsAppMetadata } from '../_shared/whatsapp-config.ts'
import { createProvider } from '../_shared/whatsapp-factory.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(url, key, { db: { schema: 'veltzy' } })
    const supabasePublic = createClient(url, key)

    const configs = await getAllConnectedConfigs(supabasePublic)

    const results: { companyId: string; oldStatus: string; newStatus: string }[] = []

    for (const config of configs ?? []) {
      let newStatus: string = 'connected'

      try {
        const provider = createProvider(config.provider)
        const statusResult = await provider.getStatus(config)

        if (!statusResult.connected) {
          newStatus = 'disconnected'
        }
      } catch (err) {
        console.error(`[health] company=${config.company_id} fetch error:`, err)
        newStatus = 'error'
      }

      if (newStatus !== 'connected') {
        await updateWhatsAppMetadata(supabasePublic, config.id, { status: newStatus })

        // Notificar admins da empresa
        const { data: admins } = await supabasePublic
          .from('user_roles')
          .select('user_id')
          .eq('company_id', config.company_id)
          .in('role', ['admin', 'super_admin'])

        if (admins && admins.length > 0) {
          const notifications = admins.map((a: { user_id: string }) => ({
            company_id: config.company_id,
            user_id: a.user_id,
            type: 'system',
            title: 'WhatsApp desconectado',
            body: 'A conexao WhatsApp da sua empresa foi interrompida. Entre em contato com o suporte.',
          }))

          await supabase.from('notifications').insert(notifications)
        }

        results.push({
          companyId: config.company_id,
          oldStatus: config.status,
          newStatus,
        })
      }
    }

    // --- Cobertura Cloud API (V5) ---
    // cloud_api nao vive em oauth_integrations; "estar conectado" e existir >=1
    // numero ativo em cloud_api_numbers (mesma verdade simples da V3). Derivacao
    // sem chamada Graph pesada e sem depender das flags do onboard do Hub
    // (subscribed_apps_ok/sync), que ainda nao existem no schema do Veltzy.
    // Apuramos e reportamos o estado; a NOTIFICACAO de transicao fica como
    // follow-up: nao ha onde persistir o status de saude por empresa, entao
    // notificar a cada execucao viraria spam. Um sinal mais rico entra quando o
    // Hub expuser subscribed_apps_ok/sync pro Veltzy.
    const { data: cloudApiCompanies } = await supabasePublic
      .from('companies')
      .select('id')
      .eq('active_whatsapp_provider', 'cloud_api')

    const cloudApiResults: { companyId: string; activeNumbers: number; healthy: boolean }[] = []
    for (const company of cloudApiCompanies ?? []) {
      const { count } = await supabase
        .from('cloud_api_numbers')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', company.id)
        .eq('status', 'active')

      const activeNumbers = count ?? 0
      const healthy = activeNumbers > 0
      if (!healthy) {
        console.warn(`[health] cloud_api company=${company.id} sem numero ativo`)
      }
      cloudApiResults.push({ companyId: company.id, activeNumbers, healthy })
    }

    return new Response(
      JSON.stringify({
        ok: true,
        checked: (configs?.length ?? 0) + cloudApiResults.length,
        changed: results,
        cloudApi: cloudApiResults,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('[health] error:', err)
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
