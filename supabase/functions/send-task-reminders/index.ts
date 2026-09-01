import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { isCronAuthorized, cronUnauthorized } from '../_shared/cron-auth.ts'

import { getCorsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // A5: so scheduler autenticado (service key ou x-cron-secret) dispara.
  if (!isCronAuthorized(req)) {
    return cronUnauthorized(corsHeaders)
  }

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(url, key, { db: { schema: 'veltzy' } })

    // Buscar lembretes pendentes com scheduled_at <= agora + 1 minuto
    const threshold = new Date(Date.now() + 60 * 1000).toISOString()
    const { data: reminders, error: fetchError } = await supabase
      .from('task_reminders')
      .select('*, tasks:task_id(id, title, meeting_link, meeting_lead_email, company_id)')
      .eq('status', 'pending')
      .lte('scheduled_at', threshold)
      .limit(100)

    if (fetchError) throw fetchError
    if (!reminders?.length) {
      return new Response(JSON.stringify({ processed: 0, sent: 0, failed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let sent = 0
    let failed = 0

    for (const reminder of reminders) {
      try {
        const task = reminder.tasks as { id: string; title: string; meeting_link: string | null; meeting_lead_email: string | null; company_id: string } | null
        if (!task) continue

        const companyId = task.company_id
        const channel = reminder.channel as string

        // WhatsApp - insere na fila para respeitar rate limit
        if (channel === 'whatsapp' || channel === 'both') {
          if (reminder.lead_id) {
            await supabase.from('message_queue').insert({
              company_id: companyId,
              lead_id: reminder.lead_id,
              content: reminder.content,
              message_type: 'text',
              scheduled_at: new Date(Date.now() + sent * 3000).toISOString(),
              source: 'reminder',
            })
          }
        }

        // Email via Brevo
        if (channel === 'email' || channel === 'both') {
          const email = task.meeting_lead_email
          const brevoKey = Deno.env.get('BREVO_API_KEY')

          if (email && brevoKey) {
            await fetch('https://api.brevo.com/v3/smtp/email', {
              method: 'POST',
              headers: {
                'api-key': brevoKey,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                sender: { name: 'Veltzy', email: 'noreply@veltzy.com' },
                to: [{ email }],
                subject: `Lembrete: ${task.title}`,
                textContent: reminder.content,
              }),
            })
          }
        }

        // Marcar como enviado
        await supabase
          .from('task_reminders')
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .eq('id', reminder.id)

        sent++
      } catch (err) {
        // Marcar como falhou
        await supabase
          .from('task_reminders')
          .update({ status: 'failed', error_message: (err as Error).message })
          .eq('id', reminder.id)

        failed++
      }
    }

    return new Response(
      JSON.stringify({ processed: reminders.length, sent, failed }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
