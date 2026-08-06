/**
 * calendar-event: cria o evento do Google a partir de uma tarefa de reuniao.
 *
 * O cliente manda SO o taskId. A funcao le a tarefa com service role, resolve a
 * conexao Google do vendedor responsavel e chama o Google. Token nenhum
 * transita pelo browser (era esse o vazamento do desenho antigo, em que o
 * tasks.service.ts lia access_token e refresh_token no front).
 *
 * Toda falha de calendario responde 200 com um `skipped`: falta de calendario
 * nao e erro de sistema, e estado do usuario, e precisa chegar ao front como
 * informacao em vez de excecao. A tarefa ja existe de qualquer forma.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'
import {
  getValidAccessToken,
  createEvent,
  buildEventFromTask,
  GcalNotConnectedError,
  GcalAuthError,
  GcalProviderError,
} from '../_shared/gcal.ts'

interface TaskRow {
  id: string
  company_id: string
  lead_id: string | null
  assigned_to: string | null
  type: string
  title: string
  description: string | null
  meeting_date: string | null
  meeting_duration: number | null
  meeting_link: string | null
  meeting_lead_email: string | null
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, 401)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabaseAuth = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!)
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(
      authHeader.replace('Bearer ', ''),
    )
    if (authError || !user) return json({ error: 'Unauthorized' }, 401)

    const { action, taskId } = await req.json()
    if (action !== 'create') return json({ error: 'Unknown action' }, 400)
    if (!taskId) return json({ error: 'taskId obrigatorio' }, 400)

    const supabasePublic = createClient(supabaseUrl, serviceKey, { db: { schema: 'public' } })
    const supabaseVeltzy = createClient(supabaseUrl, serviceKey, { db: { schema: 'veltzy' } })

    const { data: profile } = await supabasePublic
      .from('profiles')
      .select('id, company_id')
      .eq('user_id', user.id)
      .single()
    if (!profile) return json({ error: 'Perfil nao encontrado' }, 403)

    const { data: taskData, error: taskError } = await supabaseVeltzy
      .from('tasks')
      .select('id, company_id, lead_id, assigned_to, type, title, description, meeting_date, meeting_duration, meeting_link, meeting_lead_email')
      .eq('id', taskId)
      .single()
    if (taskError || !taskData) return json({ error: 'Tarefa nao encontrada' }, 404)

    const task = taskData as TaskRow

    // Multi-tenant: a tarefa tem que ser da empresa de quem chamou.
    if (task.company_id !== profile.company_id) return json({ error: 'Forbidden' }, 403)

    if (task.type !== 'meeting' || !task.meeting_date) {
      return json({ error: 'Tarefa nao e uma reuniao com data definida' }, 400)
    }

    // A agenda e do vendedor responsavel pela reuniao. Sem responsavel, cai em
    // quem esta agendando.
    const ownerProfileId = task.assigned_to ?? profile.id

    // So o nome, nunca o telefone como substituto. O que sai daqui atravessa
    // para o Google e cai na caixa de email do cliente: telefone nao acrescenta
    // nada ao convite e o vendedor nao teria como perceber que vazou. Sem nome,
    // o Google exibe o proprio email do participante.
    let leadName = ''
    if (task.lead_id) {
      const { data: lead } = await supabaseVeltzy
        .from('leads')
        .select('name')
        .eq('id', task.lead_id)
        .maybeSingle()
      leadName = ((lead?.name as string | null) ?? '').trim()
    }

    const { accessToken, calendarId } = await getValidAccessToken(supabasePublic, ownerProfileId)

    const event = buildEventFromTask(
      {
        title: task.title,
        description: task.description,
        meeting_date: task.meeting_date,
        meeting_duration: task.meeting_duration,
        meeting_link: task.meeting_link,
        meeting_lead_email: task.meeting_lead_email,
      },
      leadName,
    )

    const eventId = await createEvent(accessToken, calendarId, event)

    await supabaseVeltzy
      .from('tasks')
      .update({ google_event_id: eventId })
      .eq('id', task.id)

    return json({ eventId })
  } catch (err) {
    if (err instanceof GcalNotConnectedError) {
      return json({ skipped: 'not_connected' })
    }
    if (err instanceof GcalAuthError) {
      return json({ skipped: 'auth_expired', message: err.message })
    }
    if (err instanceof GcalProviderError) {
      return json({ skipped: 'provider_error', message: err.message })
    }
    return json({ error: (err as Error).message }, 500)
  }
})
