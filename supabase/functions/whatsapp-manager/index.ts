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
