import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { HubClient, HubError } from '../_shared/hub-client.ts'

import { getCorsHeaders } from '../_shared/cors.ts'

interface NotificationInput {
  company_id: string
  user_id: string // auth.users.id
  type: 'copilot'
  title: string
  body: string
  action_data: Record<string, unknown>
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(url, key, { db: { schema: 'veltzy' } })
    const supabasePublic = createClient(url, key, { db: { schema: 'public' } })
    const supabaseAuth = createClient(url, key)

    // C3: identidade sempre do token, nunca do body. Sem Authorization, nada roda.
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const token = authHeader.replace('Bearer ', '')
    const isServiceRole = token === key

    const body = await req.json()

    // --- SALES PULSE MODE ---
    if (body.action === 'sales-pulse') {
      // C3: sales-pulse e sempre chamada de usuario logado (use-sales-pulse.ts).
      // O company_id/role/profile do body sao ignorados — derivados do JWT.
      if (isServiceRole) {
        return new Response(JSON.stringify({ error: 'sales-pulse requires user token' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token)
      if (authError || !user) {
        return new Response(JSON.stringify({ error: 'Invalid token' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: profile } = await supabasePublic
        .from('profiles')
        .select('id, company_id, name')
        .eq('user_id', user.id)
        .single()
      if (!profile?.company_id) {
        return new Response(JSON.stringify({ error: 'No company' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // role autoritativo: derivado de user_roles, nunca do body. Um seller que
      // forjasse role='admin' veria a empresa toda em vez do proprio funil.
      const { data: roleRows } = await supabasePublic
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
      const roles = (roleRows ?? []).map((r: { role: string }) => r.role)
      const isPrivileged = roles.some((r) => ['admin', 'manager', 'super_admin'].includes(r))

      const company_id = profile.company_id
      const user_profile_id = profile.id
      const user_name = profile.name
      const role = isPrivileged ? 'manager' : 'seller'

      const now = new Date()
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
      const isSeller = role === 'seller'

      // Leads por temperatura
      let tempQuery = supabase
        .from('leads')
        .select('temperature')
        .eq('company_id', company_id)
      if (isSeller && user_profile_id) {
        tempQuery = tempQuery.eq('assigned_to', user_profile_id)
      }
      const { data: tempLeads } = await tempQuery

      const tempCounts = { cold: 0, warm: 0, hot: 0, fire: 0 }
      for (const l of tempLeads ?? []) {
        const t = l.temperature as keyof typeof tempCounts
        if (t in tempCounts) tempCounts[t]++
      }

      // Leads sem interacao ha mais de 24h
      let staleQuery = supabase
        .from('leads')
        .select('id, name, phone')
        .eq('company_id', company_id)
        .lt('last_customer_message_at', twentyFourHoursAgo)
        .not('conversation_status', 'eq', 'closed')
      if (isSeller && user_profile_id) {
        staleQuery = staleQuery.eq('assigned_to', user_profile_id)
      }
      const { data: staleLeads } = await staleQuery.limit(10)

      // Deals em aberto (valor total + top por valor). Le de `deals`: o valor e
      // o status do negocio moram ali, nao mais espelhados em `leads`.
      let dealsQuery = supabase
        .from('deals')
        .select('id, value, updated_at, leads:lead_id(name, phone)')
        .eq('company_id', company_id)
        .eq('status', 'open')
        // `deals.value` e numeric DEFAULT 0: negocio sem valor vem 0, nao null.
        // `.gt(0)` e o que replica o filtro antigo sobre `leads.deal_value`.
        .gt('value', 0)
        .order('value', { ascending: false })
      if (isSeller && user_profile_id) {
        dealsQuery = dealsQuery.eq('assigned_to', user_profile_id)
      }
      const { data: openDeals, error: dealsError } = await dealsQuery.limit(5)
      if (dealsError) console.error('[ai-copilot] deals em aberto:', dealsError.message)

      const totalOpenValue = (openDeals ?? []).reduce((sum, d) => sum + (d.value ?? 0), 0)

      // Top deals com dias sem atualizacao
      const topDealsInfo = (openDeals ?? []).slice(0, 3).map(d => {
        const daysAgo = Math.floor((now.getTime() - new Date(d.updated_at).getTime()) / (24 * 60 * 60 * 1000))
        return `- ${d.leads?.name || d.leads?.phone} (ID: ${d.id}): R$ ${d.value?.toFixed(2)} - ${daysAgo} dias sem atualizacao`
      }).join('\n')

      // Leads hot/fire sem resposta hoje
      let hotNoReplyQuery = supabase
        .from('leads')
        .select('id, name, phone')
        .eq('company_id', company_id)
        .in('temperature', ['hot', 'fire'])
        .eq('conversation_status', 'waiting')
      if (isSeller && user_profile_id) {
        hotNoReplyQuery = hotNoReplyQuery.eq('assigned_to', user_profile_id)
      }
      const { data: hotNoReply } = await hotNoReplyQuery.limit(10)

      // Top 3 leads hot/fire com ultima mensagem
      let topHotQuery = supabase
        .from('leads')
        .select('id, name, phone, temperature, last_customer_message_at')
        .eq('company_id', company_id)
        .in('temperature', ['hot', 'fire'])
        .order('last_customer_message_at', { ascending: false })
      if (isSeller && user_profile_id) {
        topHotQuery = topHotQuery.eq('assigned_to', user_profile_id)
      }
      const { data: topHotLeads } = await topHotQuery.limit(3)

      // Buscar ultima mensagem de cada top hot lead
      const topHotDetails: string[] = []
      for (const lead of topHotLeads ?? []) {
        const { data: lastMsg } = await supabase
          .from('messages')
          .select('content, created_at, sender_type')
          .eq('lead_id', lead.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        const msgPreview = lastMsg?.content?.slice(0, 80) ?? 'sem mensagens'
        const msgDate = lastMsg?.created_at ? new Date(lastMsg.created_at).toLocaleDateString('pt-BR') : 'N/A'
        const sender = lastMsg?.sender_type === 'lead' ? 'cliente' : 'vendedor'
        topHotDetails.push(`- ${lead.name || lead.phone} [${lead.temperature}] (ID: ${lead.id}): ultima msg (${sender}, ${msgDate}): "${msgPreview}"`)
      }

      const dataContext = `
Usuario logado: ${user_name || 'Vendedor'}
Leads por temperatura: cold=${tempCounts.cold}, warm=${tempCounts.warm}, hot=${tempCounts.hot}, fire=${tempCounts.fire}
Leads sem interacao ha mais de 24h: ${staleLeads?.length ?? 0}
Valor total de deals em aberto: R$ ${totalOpenValue.toFixed(2)}
Leads hot/fire sem resposta hoje: ${hotNoReply?.length ?? 0}

Top leads quentes (com ultima mensagem):
${topHotDetails.length > 0 ? topHotDetails.join('\n') : 'Nenhum lead hot/fire no momento'}

Deals com maior valor em aberto:
${topDealsInfo || 'Nenhum deal em aberto'}
`.trim()

      const systemPrompt = `Voce e um assistente de vendas analisando dados reais de um CRM brasileiro.
Responda APENAS em JSON valido com esta estrutura exata:
{
  "situacao": "2-3 frases diretas e especificas sobre o momento atual, citando numeros reais",
  "alertas": [
    { "tipo": "urgente|oportunidade|atencao", "texto": "alerta especifico com nome do lead ou valor real", "lead_id": "uuid ou null" }
  ],
  "acoes": [
    { "texto": "acao especifica com nome do lead", "lead_id": "uuid ou null", "destino": "inbox|pipeline|deals" }
  ]
}
Seja especifico: cite nomes, valores e prazos reais. Maximo 3 alertas e 3 acoes. Responda em portugues brasileiro com acentuacao correta (ex: situacao -> situação, acao -> ação, atencao -> atenção).`

      // Toda IA passa pelo gateway do Hub (ai-complete): resolve o modelo pelo
      // catalogo, roda check_ai_access e loga o custo. NAO resolver modelo, nem
      // logar ai_usage, nem incrementar spend aqui — seria double-count de orcamento.
      let hubResp
      try {
        const hub = new HubClient()
        hubResp = await hub.complete({
          company_id,
          product: 'veltzy',
          feature: 'ai_copilot',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: dataContext },
          ],
          temperature: 0.7,
          max_tokens: 500,
        })
      } catch (err) {
        // Gate do gateway: empresa sem IA habilitada (is_ai_enabled=false) ou
        // limite estourado. Propaga 403 + { ok:false, error } para o front degradar.
        if (err instanceof HubError && (err.code === 'TENANT_DISABLED' || err.code === 'LIMIT_EXCEEDED')) {
          return new Response(
            JSON.stringify({ ok: false, error: { code: err.code, message: err.message } }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          )
        }
        throw err
      }

      const content = hubResp.data?.content ?? '{}'
      let parsed
      try {
        parsed = JSON.parse(content)
      } catch {
        parsed = { situacao: content, alertas: [], acoes: [] }
      }

      return new Response(JSON.stringify(parsed), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
      })
    }
    // --- END SALES PULSE ---

    // C3: o modo batch gera notificacoes varrendo empresas (run_all_companies)
    // ou uma empresa arbitraria do body. E job de servico (cron) — nao ha
    // caller de usuario no codigo. So aceita service role; JWT de usuario nao
    // pode disparar geracao de notificacao para tenant nenhum.
    if (!isServiceRole) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const runAll = body.run_all_companies === true

    let companyIds: string[] = []
    if (runAll) {
      const { data } = await supabasePublic.from('companies').select('id').eq('is_active', true)
      companyIds = (data ?? []).map((c: { id: string }) => c.id)
    } else if (body.company_id) {
      companyIds = [body.company_id]
    }

    if (!companyIds.length) {
      return new Response(JSON.stringify({ ok: true, processed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const now = new Date()
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString()
    const twentyFourHoursFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
    let totalCreated = 0

    for (const companyId of companyIds) {
      const notifications: NotificationInput[] = []

      // Helper: verificar se ja existe notificacao copilot recente para evitar duplicatas
      const hasDuplicate = async (leadId: string | null, taskId: string | null): Promise<boolean> => {
        let query = supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .eq('type', 'copilot')
          .gte('created_at', twentyFourHoursAgo)

        if (leadId) {
          query = query.contains('action_data', { leadId })
        }
        if (taskId) {
          query = query.contains('action_data', { taskId })
        }

        const { count } = await query
        return (count ?? 0) > 0
      }

      // 1. Tarefas vencidas (due_date < now, status pending/in_progress)
      const { data: overdueTasks } = await supabase
        .from('tasks')
        .select('id, title, assigned_to, lead_id, leads:lead_id(name, phone)')
        .eq('company_id', companyId)
        .in('status', ['pending', 'in_progress'])
        .lt('due_date', now.toISOString())
        .limit(50)

      for (const task of overdueTasks ?? []) {
        if (await hasDuplicate(null, task.id)) continue
        if (!task.assigned_to) continue

        // Buscar user_id do profile
        const { data: profile } = await supabasePublic
          .from('profiles')
          .select('user_id')
          .eq('id', task.assigned_to)
          .single()
        if (!profile) continue

        const lead = task.leads as { name: string | null; phone: string } | null
        const leadName = lead?.name || lead?.phone || ''
        notifications.push({
          company_id: companyId,
          user_id: profile.user_id,
          type: 'copilot',
          title: 'Tarefa vencida',
          body: `"${task.title}"${leadName ? ` para ${leadName}` : ''} nao foi concluida.`,
          action_data: { taskId: task.id, leadId: task.lead_id },
        })
      }

      // 2. Leads quentes sem contato ha 3+ dias. A etapa mora no negocio, entao
      // a query parte de `deals` com o contato embutido. O `!inner` nao e
      // opcional: sem ele o filtro por `leads.temperature` nao exclui a linha
      // pai, so zera o embed, e o bloco notificaria sobre contato frio.
      const { data: hotDeals, error: hotDealsError } = await supabase
        .from('deals')
        .select('id, stage_id, assigned_to, lead_id, pipeline_stages:stage_id(name), leads:lead_id!inner(name, phone)')
        .eq('company_id', companyId)
        .eq('status', 'open')
        .in('leads.temperature', ['warm', 'hot', 'fire'])
        .not('assigned_to', 'is', null)
        .limit(100)
      if (hotDealsError) console.error('[ai-copilot] leads quentes:', hotDealsError.message)

      for (const d of hotDeals ?? []) {
        // A notificacao e sobre o CONTATO: `d.lead_id` alimenta a busca de
        // mensagem, o dedup e o action_data. Trocar pelo id do negocio quebraria
        // o hasDuplicate.
        const { data: lastMsg } = await supabase
          .from('messages')
          .select('created_at')
          .eq('lead_id', d.lead_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (lastMsg && lastMsg.created_at > threeDaysAgo) continue
        if (await hasDuplicate(d.lead_id, null)) continue

        const { data: profile } = await supabasePublic
          .from('profiles')
          .select('user_id')
          .eq('id', d.assigned_to)
          .single()
        if (!profile) continue

        const stage = d.pipeline_stages as { name: string } | null
        const contact = d.leads as { name: string | null; phone: string } | null
        const leadName = contact?.name || contact?.phone
        const daysAgo = lastMsg
          ? Math.floor((now.getTime() - new Date(lastMsg.created_at).getTime()) / (24 * 60 * 60 * 1000))
          : 'muitos'
        notifications.push({
          company_id: companyId,
          user_id: profile.user_id,
          type: 'copilot',
          title: 'Lead quente sem contato',
          body: `${leadName} esta em ${stage?.name ?? 'pipeline'} ha ${daysAgo} dias sem interacao.`,
          action_data: { leadId: d.lead_id },
        })
      }

      // 3. Meetings proximas 24h sem lembretes enviados
      const { data: upcomingMeetings } = await supabase
        .from('tasks')
        .select('id, title, assigned_to, lead_id, meeting_date, leads:lead_id(name, phone)')
        .eq('company_id', companyId)
        .eq('type', 'meeting')
        .in('status', ['pending', 'in_progress'])
        .gte('meeting_date', now.toISOString())
        .lte('meeting_date', twentyFourHoursFromNow)
        .limit(50)

      for (const task of upcomingMeetings ?? []) {
        // Verificar se tem lembretes enviados
        const { count: sentCount } = await supabase
          .from('task_reminders')
          .select('id', { count: 'exact', head: true })
          .eq('task_id', task.id)
          .eq('status', 'sent')
        if ((sentCount ?? 0) > 0) continue
        if (await hasDuplicate(null, task.id)) continue
        if (!task.assigned_to) continue

        const { data: profile } = await supabasePublic
          .from('profiles')
          .select('user_id')
          .eq('id', task.assigned_to)
          .single()
        if (!profile) continue

        const lead = task.leads as { name: string | null; phone: string } | null
        const meetingDate = new Date(task.meeting_date!)
        const hoursUntil = Math.round((meetingDate.getTime() - now.getTime()) / (60 * 60 * 1000))
        notifications.push({
          company_id: companyId,
          user_id: profile.user_id,
          type: 'copilot',
          title: 'Reuniao em breve',
          body: `${lead?.name || lead?.phone || 'Reuniao'} em ${hoursUntil}h. Verifique se esta preparado.`,
          action_data: { taskId: task.id, leadId: task.lead_id },
        })
      }

      // 4. Leads com alto score sem tasks pendentes
      const { data: highScoreLeads } = await supabase
        .from('leads')
        .select('id, name, phone, ai_score, assigned_to')
        .eq('company_id', companyId)
        .gte('ai_score', 70)
        .not('assigned_to', 'is', null)
        .limit(100)

      for (const lead of highScoreLeads ?? []) {
        const { count: taskCount } = await supabase
          .from('tasks')
          .select('id', { count: 'exact', head: true })
          .eq('lead_id', lead.id)
          .in('status', ['pending', 'in_progress'])
        if ((taskCount ?? 0) > 0) continue
        if (await hasDuplicate(lead.id, null)) continue

        const { data: profile } = await supabasePublic
          .from('profiles')
          .select('user_id')
          .eq('id', lead.assigned_to)
          .single()
        if (!profile) continue

        notifications.push({
          company_id: companyId,
          user_id: profile.user_id,
          type: 'copilot',
          title: 'Lead de alto score sem acao',
          body: `${lead.name || lead.phone} tem score ${lead.ai_score} e nenhuma tarefa planejada.`,
          action_data: { leadId: lead.id },
        })
      }

      // Inserir notificacoes em batch
      if (notifications.length > 0) {
        await supabase.from('notifications').insert(notifications)
        totalCreated += notifications.length
      }
    }

    return new Response(
      JSON.stringify({ ok: true, companies: companyIds.length, notifications_created: totalCreated }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('[ai-copilot]', err)
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
