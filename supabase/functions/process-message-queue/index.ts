import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { isCronAuthorized, cronUnauthorized } from '../_shared/cron-auth.ts'
import { getWhatsAppConfig, getActiveProvider } from '../_shared/whatsapp-config.ts'
import { createProvider } from '../_shared/whatsapp-factory.ts'
import type { WhatsAppConfig } from '../_shared/whatsapp-provider.ts'
import { resolveOutboundCloudApiNumber } from '../_shared/cloud-api-resolve.ts'

import { getCorsHeaders } from '../_shared/cors.ts'

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
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
    const supabasePublic = createClient(url, key)

    const now = new Date().toISOString()

    const { data: items } = await supabase
      .from('message_queue')
      .select('id, company_id, lead_id, content, message_type, file_url, instance_name, metadata')
      .eq('status', 'pending')
      .lte('scheduled_at', now)
      .order('scheduled_at', { ascending: true })
      .limit(10)

    if (!items || items.length === 0) {
      return new Response(
        JSON.stringify({ processed: 0, sent: 0, failed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    let sent = 0
    let failed = 0

    for (const item of items) {
      try {
        const { data: lead } = await supabase
          .from('leads')
          .select('phone, cloud_api_number_id')
          .eq('id', item.lead_id)
          .single()

        if (!lead?.phone) {
          await supabase
            .from('message_queue')
            .update({ status: 'failed', error_message: 'Lead has no phone' })
            .eq('id', item.id)
          failed++
          continue
        }

        const activeProvider = await getActiveProvider(supabasePublic, item.company_id)
        const msgType = (item.message_type ?? 'text') as 'text' | 'image' | 'audio' | 'video' | 'document'
        let deliveryStatus: 'sent' | 'failed' = 'sent'

        if (activeProvider === 'waha') {
          // WAHA: espelha o ramo evolution, mas o provider usa sessionName (mesmo
          // valor do nome do numero) + companyId. Sem este ramo, a fila de empresa
          // waha caia no else->zapi (getWhatsAppConfig=null) e marcava 'failed'
          // "WhatsApp not connected". Alinha com o ramo waha do whatsapp-send.
          if (!item.instance_name) {
            await supabase
              .from('message_queue')
              .update({ status: 'failed', error_message: 'No session for WAHA' })
              .eq('id', item.id)
            failed++
            continue
          }

          try {
            const provider = createProvider('waha')
            await provider.sendMessage({} as WhatsAppConfig, {
              phone: lead.phone,
              content: item.content,
              type: msgType,
              mediaUrl: item.file_url ?? undefined,
              sessionName: item.instance_name,
              companyId: item.company_id,
            })
          } catch (err) {
            console.error('[process-message-queue] WAHA send failed:', err)
            deliveryStatus = 'failed'
          }
        } else if (activeProvider === 'evolution') {
          if (!item.instance_name) {
            await supabase
              .from('message_queue')
              .update({ status: 'failed', error_message: 'No instance_name for Evolution' })
              .eq('id', item.id)
            failed++
            continue
          }

          try {
            const provider = createProvider('evolution')
            await provider.sendMessage({} as WhatsAppConfig, {
              phone: lead.phone,
              content: item.content,
              type: msgType,
              mediaUrl: item.file_url ?? undefined,
              instanceName: item.instance_name,
            })
          } catch (err) {
            console.error('[process-message-queue] Evolution send failed:', err)
            deliveryStatus = 'failed'
          }
        } else if (activeProvider === 'cloud_api') {
          // Cloud API oficial: resolve o numero (vinculo do lead -> default da empresa,
          // reusa resolveOutboundCloudApiNumber do whatsapp-send). Se message_type='template'
          // (campanha HSM), envia via sendTemplate (metadata: name/language/params); senao texto.
          const outbound = await resolveOutboundCloudApiNumber(supabase, {
            cloud_api_number_id: (lead.cloud_api_number_id as string | null) ?? null,
            company_id: item.company_id,
          })
          if (!outbound) {
            await supabase
              .from('message_queue')
              .update({ status: 'failed', error_message: 'Nenhum numero Cloud API configurado' })
              .eq('id', item.id)
            failed++
            continue
          }

          try {
            const provider = createProvider('cloud_api')
            if (item.message_type === 'template') {
              const meta = (item.metadata ?? {}) as { template_name?: string; language?: string; params?: string[] }
              if (!meta.template_name || !meta.language) {
                throw new Error('Item de template sem template_name/language no metadata')
              }
              await provider.sendTemplate!({
                phone: lead.phone,
                phoneNumberId: outbound.phoneNumberId,
                companyId: item.company_id,
                templateName: meta.template_name,
                language: meta.language,
                params: meta.params ?? [],
              })
            } else {
              await provider.sendMessage({} as WhatsAppConfig, {
                phone: lead.phone,
                content: item.content,
                type: msgType,
                mediaUrl: item.file_url ?? undefined,
                phoneNumberId: outbound.phoneNumberId,
                companyId: item.company_id,
              })
            }
          } catch (err) {
            console.error('[process-message-queue] Cloud API send failed:', err)
            deliveryStatus = 'failed'
          }
        } else {
          // Fluxo Z-API existente
          const config = await getWhatsAppConfig(supabasePublic, item.company_id, { status: 'connected' })

          if (!config) {
            await supabase
              .from('message_queue')
              .update({ status: 'failed', error_message: 'WhatsApp not connected' })
              .eq('id', item.id)
            failed++
            continue
          }

          try {
            const provider = createProvider(config.provider)
            await provider.sendMessage(config, {
              phone: lead.phone,
              content: item.content,
              type: msgType,
              mediaUrl: item.file_url ?? undefined,
            })
          } catch (err) {
            console.error('[process-message-queue] Z-API send failed:', err)
            deliveryStatus = 'failed'
          }
        }

        // Salvar mensagem no historico
        await supabase.from('messages').insert({
          lead_id: item.lead_id,
          company_id: item.company_id,
          content: item.content,
          sender_type: 'ai',
          message_type: msgType,
          file_url: item.file_url ?? null,
          source: deliveryStatus === 'failed' ? 'manual' : 'whatsapp',
          instance_name: item.instance_name ?? null,
          delivery_status: deliveryStatus,
        })

        await supabase
          .from('message_queue')
          .update({
            status: deliveryStatus === 'sent' ? 'sent' : 'failed',
            sent_at: deliveryStatus === 'sent' ? new Date().toISOString() : null,
            error_message: deliveryStatus === 'failed' ? 'Send failed' : null,
          })
          .eq('id', item.id)

        if (deliveryStatus === 'sent') sent++
        else failed++

        // Delay de 2s entre envios para evitar deteccao de envio em massa
        if (items.indexOf(item) < items.length - 1) {
          await delay(2000)
        }
      } catch (err) {
        await supabase
          .from('message_queue')
          .update({ status: 'failed', error_message: (err as Error).message })
          .eq('id', item.id)
        failed++
      }
    }

    return new Response(
      JSON.stringify({ processed: items.length, sent, failed }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('[process-message-queue] error:', err)
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
