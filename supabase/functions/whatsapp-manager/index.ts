import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getWhatsAppConfig, updateWhatsAppMetadata } from '../_shared/whatsapp-config.ts'
import { createProvider } from '../_shared/whatsapp-factory.ts'

import { getCorsHeaders } from '../_shared/cors.ts'

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

    const supabasePublic = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { companyId, action } = await req.json()

    // M3: acoes que mexem na conexao so para admin/manager. Sem isso um seller
    // chama 'disconnect' e derruba o WhatsApp do time, ou 'qrcode' e sequestra a
    // sessao. 'status' fica livre (read-only). O tenant ja e protegido pela RLS
    // (supabasePublic roda com o JWT do usuario).
    const sensitiveActions = ['disconnect', 'qrcode', 'restart']
    if (sensitiveActions.includes(action)) {
      const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
      const token = authHeader.replace('Bearer ', '')
      const { data: { user }, error: authError } = await admin.auth.getUser(token)
      if (authError || !user) {
        return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      const { data: roleRows } = await admin.from('user_roles').select('role').eq('user_id', user.id)
      const privileged = (roleRows ?? []).some((r: { role: string }) => ['admin', 'manager', 'super_admin'].includes(r.role))
      if (!privileged) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
    }

    const config = await getWhatsAppConfig(supabasePublic, companyId)

    if (!config) {
      return new Response(JSON.stringify({ error: 'No config found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const provider = createProvider(config.provider)

    if (action === 'status') {
      const result = await provider.getStatus(config)

      const status = result.connected ? 'connected' : 'disconnected'
      await updateWhatsAppMetadata(supabasePublic, config.id, {
        status,
        phone_number: result.phoneNumber ?? config.phone_number,
        connected_at: result.connected ? new Date().toISOString() : config.connected_at,
      })

      return new Response(JSON.stringify({ status, phone_number: result.phoneNumber }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'qrcode') {
      const result = await provider.getQrCode(config)

      await updateWhatsAppMetadata(supabasePublic, config.id, {
        status: 'connecting',
        qr_code: result.qrCode,
      })

      return new Response(JSON.stringify({ qr_code: result.qrCode }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'disconnect') {
      await provider.disconnect(config)

      await updateWhatsAppMetadata(supabasePublic, config.id, {
        status: 'disconnected',
        qr_code: null,
      })

      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'restart') {
      await provider.restart(config)

      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
