import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'

// blast-campaign-manage (campanhas-layout-midia). Body { campaign_id, action }.
// Comum: cancela os itens 'pending' da fila da campanha (por metadata.campaign_id e pelos
// message_queue_id dos recipients, para itens antigos sem metadata).
// reset: só draft/scheduled; apaga recipients e volta a campanha a rascunho (antes de
// regravar uma edição). delete: qualquer status; apaga o anexo vivo e a campanha
// (recipients caem por cascade; mensagens já enviadas ficam nas conversas).
// verify_jwt=false + auth manual (mesmo padrão do blast-dispatch).

const MEDIA_BUCKET = 'chat-attachments'
const ALLOWED_ROLES = ['admin', 'manager', 'super_admin']

function jsonResponse(body: unknown, corsHeaders: Record<string, string>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Metodo nao permitido' }, corsHeaders, 405)

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(url, key)
    const veltzy = createClient(url, key, { db: { schema: 'veltzy' } })

    // ---- Auth: usuário + empresa + papel (admin/manager/super_admin) ----
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonResponse({ error: 'Nao autorizado' }, corsHeaders, 401)
    const { data: { user }, error: userErr } = await admin.auth.getUser(authHeader.replace('Bearer ', ''))
    if (userErr || !user) return jsonResponse({ error: 'Nao autorizado' }, corsHeaders, 401)

    const { data: profile } = await admin
      .from('profiles').select('id, company_id').eq('user_id', user.id).single()
    if (!profile?.company_id) return jsonResponse({ error: 'Usuario sem empresa vinculada' }, corsHeaders, 400)
    const companyId = profile.company_id as string

    const { data: roles } = await admin
      .from('user_roles').select('role, company_id').eq('user_id', user.id)
    const allowed = (roles ?? []).some((r: { role: string; company_id: string | null }) =>
      r.role === 'super_admin' || (r.company_id === companyId && ALLOWED_ROLES.includes(r.role)))
    if (!allowed) return jsonResponse({ error: 'Permissao negada' }, corsHeaders, 403)

    // ---- Entrada ----
    const { campaign_id, action } = await req.json().catch(() => ({}))
    if (!campaign_id || (action !== 'reset' && action !== 'delete')) {
      return jsonResponse({ error: "campaign_id e action ('reset' | 'delete') obrigatorios" }, corsHeaders, 400)
    }

    const { data: campaign } = await veltzy
      .from('blast_campaigns')
      .select('id, company_id, status, media_path, media_purged_at')
      .eq('id', campaign_id)
      .maybeSingle()
    if (!campaign || campaign.company_id !== companyId) {
      return jsonResponse({ error: 'Campanha nao encontrada' }, corsHeaders, 404)
    }
    if (action === 'reset' && !['draft', 'scheduled'].includes(campaign.status)) {
      return jsonResponse({ error: `Campanha em status '${campaign.status}' nao pode ser editada`, reason: 'not_editable' }, corsHeaders, 409)
    }

    // ---- Cancela pendentes da fila ----
    const cancelledIds = new Set<string>()
    const { data: byMeta, error: metaErr } = await veltzy
      .from('message_queue')
      .update({ status: 'cancelled' })
      .eq('company_id', companyId)
      .eq('status', 'pending')
      .filter('metadata->>campaign_id', 'eq', campaign_id)
      .select('id')
    if (metaErr) return jsonResponse({ error: `Falha ao cancelar envios: ${metaErr.message}` }, corsHeaders, 500)
    for (const r of byMeta ?? []) cancelledIds.add(r.id as string)

    const { data: recs, error: recErr } = await veltzy
      .from('blast_recipients')
      .select('message_queue_id')
      .eq('campaign_id', campaign_id)
      .not('message_queue_id', 'is', null)
    if (recErr) return jsonResponse({ error: `Falha ao ler destinatarios: ${recErr.message}` }, corsHeaders, 500)
    const queueIds = (recs ?? []).map((r: { message_queue_id: string }) => r.message_queue_id)
    for (let i = 0; i < queueIds.length; i += 200) {
      const { data: byRec, error } = await veltzy
        .from('message_queue')
        .update({ status: 'cancelled' })
        .eq('company_id', companyId)
        .eq('status', 'pending')
        .in('id', queueIds.slice(i, i + 200))
        .select('id')
      if (error) return jsonResponse({ error: `Falha ao cancelar envios: ${error.message}` }, corsHeaders, 500)
      for (const r of byRec ?? []) cancelledIds.add(r.id as string)
    }

    if (action === 'reset') {
      const { error: delRecErr } = await veltzy.from('blast_recipients').delete().eq('campaign_id', campaign_id)
      if (delRecErr) return jsonResponse({ error: `Falha ao limpar destinatarios: ${delRecErr.message}` }, corsHeaders, 500)
      const { error: updErr } = await veltzy
        .from('blast_campaigns')
        .update({ status: 'draft', total_recipients: 0, queued_count: 0, sent_count: 0, failed_count: 0, started_at: null })
        .eq('id', campaign_id)
      if (updErr) return jsonResponse({ error: `Falha ao reabrir campanha: ${updErr.message}` }, corsHeaders, 500)
      return jsonResponse({ ok: true, cancelled: cancelledIds.size }, corsHeaders)
    }

    // delete
    if (campaign.media_path && !campaign.media_purged_at) {
      const { error: rmErr } = await admin.storage.from(MEDIA_BUCKET).remove([campaign.media_path])
      if (rmErr) console.warn(`[blast-campaign-manage] falha ao remover anexo ${campaign.media_path}: ${rmErr.message}`)
    }
    const { error: delErr } = await veltzy.from('blast_campaigns').delete().eq('id', campaign_id).eq('company_id', companyId)
    if (delErr) return jsonResponse({ error: `Falha ao excluir campanha: ${delErr.message}` }, corsHeaders, 500)
    return jsonResponse({ ok: true, cancelled: cancelledIds.size }, corsHeaders)
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, getCorsHeaders(req), 500)
  }
})
