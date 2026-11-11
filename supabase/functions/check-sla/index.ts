import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { isCronAuthorized, cronUnauthorized } from '../_shared/cron-auth.ts'

import { getCorsHeaders } from '../_shared/cors.ts'

/** Mesmo default de business_rules.sla_hours (2h). */
const DEFAULT_SLA_MINUTES = 120
/** Quem conta como resposta ao lead: vendedor ou IA (SDR, automacoes, fila). */
const REPLY_SENDERS = ['human', 'ai']

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

    const now = new Date()
    const breached: string[] = []
    const slaByCompany: Record<string, number> = {}

    const loadSlaMinutes = async (cid: string): Promise<number> => {
      const { data: settings } = await supabase
        .from('system_settings')
        .select('value')
        .eq('company_id', cid)
        .eq('key', 'business_rules')
        .maybeSingle()
      const rules = settings?.value as Record<string, unknown> | null
      const slaHours = Number(rules?.sla_hours) || 0
      // sla_hours e em horas no admin, converte para minutos. Fallback: 2h,
      // o mesmo default da tela de regras (antes caia em 30 min sem aviso).
      return slaHours > 0 ? slaHours * 60 : DEFAULT_SLA_MINUTES
    }

    // Busca leads pendentes (nao breached, nao resolvidos, com mensagem do cliente)
    const { data: pendingLeads } = await supabase
      .from('leads')
      .select('id, name, phone, company_id, assigned_to, last_customer_message_at')
      .eq('sla_breached', false)
      .neq('conversation_status', 'resolved')
      .not('last_customer_message_at', 'is', null)

    if (pendingLeads && pendingLeads.length > 0) {
      // Busca config de SLA por empresa
      const companyIds = [...new Set(pendingLeads.map((l) => l.company_id))]

      for (const cid of companyIds) {
        slaByCompany[cid] = await loadSlaMinutes(cid)
      }

      for (const lead of pendingLeads) {
        const slaMinutes = slaByCompany[lead.company_id] ?? DEFAULT_SLA_MINUTES
        const threshold = new Date(now.getTime() - slaMinutes * 60 * 1000)

        // Ainda dentro do prazo
        if (new Date(lead.last_customer_message_at) >= threshold) continue

        // Verifica se ja tem resposta (vendedor ou IA) apos a ultima mensagem do cliente
        const { data: lastHumanMsg } = await supabase
          .from('messages')
          .select('created_at')
          .eq('lead_id', lead.id)
          .in('sender_type', REPLY_SENDERS)
          .gt('created_at', lead.last_customer_message_at)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (lastHumanMsg) continue

        // Marca como breached
        await supabase
          .from('leads')
          .update({ sla_breached: true })
          .eq('id', lead.id)

        // Notifica o responsavel
        if (lead.assigned_to) {
          const minutesWaiting = Math.round(
            (now.getTime() - new Date(lead.last_customer_message_at).getTime()) / 60000,
          )
          const leadName = lead.name || lead.phone

          await supabase.from('notifications').insert({
            company_id: lead.company_id,
            user_id: lead.assigned_to,
            type: 'system',
            title: 'Lead aguardando resposta',
            body: `${leadName} esta aguardando resposta ha ${minutesWaiting} minutos`,
            action_type: 'open_lead',
            action_data: { leadId: lead.id },
          })
        }

        breached.push(lead.id)
      }
    }

    // Limpa sla_breached de leads que ja receberam resposta, ou cuja pendencia
    // atual (lead escreveu de novo depois da resposta) ainda esta no prazo.
    const { data: breachedLeads } = await supabase
      .from('leads')
      .select('id, company_id, last_customer_message_at')
      .eq('sla_breached', true)
      .neq('conversation_status', 'resolved')

    const cleared: string[] = []

    if (breachedLeads && breachedLeads.length > 0) {
      for (const lead of breachedLeads) {
        // Nota interna nao e resposta ao lead nem pendencia: fica de fora.
        const { data: lastMsg } = await supabase
          .from('messages')
          .select('sender_type')
          .eq('lead_id', lead.id)
          .neq('sender_type', 'internal')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (!(lead.company_id in slaByCompany)) {
          slaByCompany[lead.company_id] = await loadSlaMinutes(lead.company_id)
        }
        const threshold = now.getTime() - slaByCompany[lead.company_id] * 60 * 1000
        const lastCustomerAt = lead.last_customer_message_at
          ? new Date(lead.last_customer_message_at).getTime()
          : null
        const answered = !!lastMsg && REPLY_SENDERS.includes(lastMsg.sender_type)
        // Exatamente no prazo ainda nao e atraso (mesma regra do breach acima).
        const withinSla = lastCustomerAt !== null && lastCustomerAt >= threshold

        if (answered || withinSla) {
          await supabase
            .from('leads')
            .update({ sla_breached: false })
            .eq('id', lead.id)
          cleared.push(lead.id)
        }
      }
    }

    return new Response(
      JSON.stringify({ ok: true, breached, cleared }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('[check-sla] error:', err)
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
