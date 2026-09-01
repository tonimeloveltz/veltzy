import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import { getCorsHeaders } from '../_shared/cors.ts'

interface Condition {
  field: string
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'contains' | 'in'
  value: unknown
}

function evaluateCondition(condition: Condition, lead: Record<string, unknown>): boolean {
  const fieldValue = lead[condition.field]
  switch (condition.operator) {
    case 'eq': return fieldValue === condition.value
    case 'neq': return fieldValue !== condition.value
    case 'gt': return Number(fieldValue) > Number(condition.value)
    case 'lt': return Number(fieldValue) < Number(condition.value)
    case 'contains': return String(fieldValue).includes(String(condition.value))
    case 'in': return Array.isArray(condition.value) && (condition.value as unknown[]).includes(fieldValue)
    default: return false
  }
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { trigger, leadId, companyId, triggerData } = await req.json()

    const url = Deno.env.get('SUPABASE_URL')!
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(url, key, { db: { schema: 'veltzy' } })
    const supabasePublic = createClient(url, key, { db: { schema: 'public' } })

    const { data: rules } = await supabase
      .from('automation_rules')
      .select('*')
      .eq('company_id', companyId)
      .eq('trigger_type', trigger)
      .eq('is_enabled', true)
      .order('priority', { ascending: false })

    if (!rules || rules.length === 0) {
      return new Response(JSON.stringify({ executed: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { data: lead } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single()

    if (!lead) {
      return new Response(JSON.stringify({ error: 'Lead not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // `evaluateCondition` le `lead[condition.field]` por NOME, entao uma regra
    // salva com condicao em `stage_id` pararia de casar em silencio agora que a
    // etapa saiu do contato. Enriquecer com a etapa do negocio ABERTO mais
    // recente preserva as regras ja salvas (mesma consulta que `change_stage`
    // faz abaixo). Sem negocio aberto: null, e a condicao nao casa, que e o
    // correto - o contato nao esta em etapa nenhuma.
    const { data: activeDeal } = await supabase
      .from('deals')
      .select('stage_id')
      .eq('lead_id', leadId)
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const leadForRules = { ...lead, stage_id: activeDeal?.stage_id ?? null }

    let executed = 0

    for (const rule of rules) {
      const conditions = (rule.conditions as Condition[]) ?? []
      const allPass = conditions.every((c) => evaluateCondition(c, leadForRules))

      if (!allPass) {
        await supabase.from('automation_logs').insert({
          company_id: companyId,
          rule_id: rule.id,
          lead_id: leadId,
          status: 'skipped',
          trigger_data: triggerData,
        })
        continue
      }

      const actionData = rule.action_data as Record<string, unknown>
      const oldValue = { stage_id: leadForRules.stage_id, temperature: lead.temperature, tags: lead.tags, assigned_to: lead.assigned_to }

      try {
        switch (rule.action_type) {
          case 'change_stage': {
            // Negocio mora em deals; o espelho (trg_mirror_deal_to_lead) replica
            // o stage para o lead. Multi-deal: move o deal ABERTO mais recente.
            // Sem deal aberto: fail-safe (loga e segue, nao quebra a automacao).
            const { data: targetDeal } = await supabase
              .from('deals')
              .select('id')
              .eq('lead_id', leadId)
              .eq('status', 'open')
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle()
            if (targetDeal) {
              await supabase.from('deals').update({ stage_id: actionData.stage_id }).eq('id', targetDeal.id)
            } else {
              console.warn(`[run-automations] change_stage: lead ${leadId} sem deal aberto; acao ignorada`)
            }
            break
          }
          case 'assign_lead':
            await supabase.from('leads').update({ assigned_to: actionData.profile_id }).eq('id', leadId)
            break
          case 'add_tag':
            await supabase.from('leads').update({ tags: [...(lead.tags ?? []), actionData.tag as string] }).eq('id', leadId)
            break
          case 'remove_tag':
            await supabase.from('leads').update({ tags: (lead.tags ?? []).filter((t: string) => t !== actionData.tag) }).eq('id', leadId)
            break
          case 'update_temperature':
            await supabase.from('leads').update({ temperature: actionData.temperature }).eq('id', leadId)
            break
          case 'notify_team': {
            const { data: members } = await supabasePublic
              .from('profiles')
              .select('user_id')
              .eq('company_id', companyId)
            for (const m of members ?? []) {
              await supabase.from('notifications').insert({
                company_id: companyId,
                user_id: m.user_id,
                type: 'system',
                title: actionData.title as string ?? 'Automacao executada',
                body: actionData.body as string ?? `Regra "${rule.name}" executada para lead ${lead.name ?? lead.phone}`,
              })
            }
            break
          }
          case 'send_message':
            await supabase.from('messages').insert({
              lead_id: leadId,
              company_id: companyId,
              content: actionData.message as string,
              sender_type: 'ai',
              message_type: 'text',
              source: 'manual',
            })
            break
          case 'send_whatsapp':
            // Insere na fila com delay escalonado para rate limit
            await supabase.from('message_queue').insert({
              company_id: companyId,
              lead_id: leadId,
              content: actionData.message as string,
              message_type: (actionData.message_type as string) ?? 'text',
              file_url: (actionData.file_url as string) ?? null,
              scheduled_at: new Date(Date.now() + executed * 3000).toISOString(),
              source: 'automation',
            })
            break
        }

        await supabase.from('automation_logs').insert({
          company_id: companyId,
          rule_id: rule.id,
          lead_id: leadId,
          status: 'success',
          trigger_data: triggerData,
          old_value: oldValue,
          new_value: actionData,
        })
        executed++
      } catch (err) {
        await supabase.from('automation_logs').insert({
          company_id: companyId,
          rule_id: rule.id,
          lead_id: leadId,
          status: 'failed',
          trigger_data: triggerData,
          error_message: (err as Error).message,
        })
      }
    }

    return new Response(JSON.stringify({ executed }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
