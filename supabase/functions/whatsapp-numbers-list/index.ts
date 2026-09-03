import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'

/**
 * Agregador de numeros WhatsApp da empresa (tela "Numeros de WhatsApp").
 * Une os 3 providers filtrando pela empresa do usuario:
 *  - Cloud API: veltzy.cloud_api_numbers (badge "WhatsApp API Oficial")
 *  - Evolution: public.evolution_instances (badge "Evolution")
 *  - WAHA:      public.waha_instances (badge "WAHA")
 * evolution_instances/waha_instances tem RLS super_admin -> por isso roda com
 * service_role e filtra company_id no codigo (auth manual valida o usuario).
 * verify_jwt=false: front chama com Authorization Bearer do usuario, validado aqui.
 */

type NumberStatus = 'connected' | 'disconnected' | 'qr_pending' | 'pending' | 'error'

interface WhatsAppNumberItem {
  provider: 'cloud_api' | 'evolution' | 'waha'
  providerLabel: string
  displayNumber: string | null
  status: NumberStatus
  /** identificador de gerencia: session_name (waha) | instance_name (evolution) | phone_number_id (cloud_api) */
  ref: string
  /** nome do funil roteado por Origem->instancia (pipeline_routing_rules match_type='instance'); null = vai pro padrao */
  funnelName: string | null
}

function getAdminClient(schema?: 'veltzy') {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    schema ? { db: { schema } } : undefined,
  )
}

// evolution/waha compartilham o dominio de status; cloud_api usa active/offboarded.
function normalizeInstanceStatus(status: string | null): NumberStatus {
  switch (status) {
    case 'connected': return 'connected'
    case 'qr_pending': return 'qr_pending'
    case 'error': return 'error'
    case 'disconnected': return 'disconnected'
    default: return 'pending'
  }
}

async function resolveCompanyId(authHeader: string | null): Promise<{ companyId: string } | Response> {
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Nao autorizado' }), { status: 401 })
  }
  const admin = getAdminClient()
  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await admin.auth.getUser(token)
  if (error || !user) {
    return new Response(JSON.stringify({ error: 'Nao autorizado' }), { status: 401 })
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('company_id')
    .eq('user_id', user.id)
    .single()
  if (!profile?.company_id) {
    return new Response(JSON.stringify({ error: 'Usuario sem empresa vinculada' }), { status: 400 })
  }

  // Somente admin/super_admin (mesma regra do whatsapp-instance-manage).
  const { data: roles } = await admin
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('company_id', profile.company_id)
  const userRoles = (roles ?? []).map((r: { role: string }) => r.role)
  if (!userRoles.some((r: string) => ['admin', 'super_admin'].includes(r))) {
    const { data: globalRoles } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'super_admin')
    if (!globalRoles || globalRoles.length === 0) {
      return new Response(JSON.stringify({ error: 'Permissao negada' }), { status: 403 })
    }
  }

  return { companyId: profile.company_id }
}

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req)
  const headers = { ...cors, 'Content-Type': 'application/json' }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors })
  }
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Metodo nao suportado' }), { status: 405, headers })
  }

  try {
    const auth = await resolveCompanyId(req.headers.get('Authorization'))
    if (auth instanceof Response) {
      return new Response(auth.body, { status: auth.status, headers })
    }
    const { companyId } = auth

    const adminPublic = getAdminClient()
    const adminVeltzy = getAdminClient('veltzy')

    // Funil por numero (Origem->instancia): pipeline_routing_rules match_type='instance',
    // match_value = o identificador de instancia/sessao (o mesmo que vira leads.whatsapp_instance_name).
    // Resolvido UMA vez para todos os numeros (evita N queries na tela).
    const { data: rules } = await adminVeltzy
      .from('pipeline_routing_rules')
      .select('match_value, pipeline_id')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .eq('match_type', 'instance')
    const pipelineIds = [...new Set((rules ?? []).map((r) => r.pipeline_id).filter(Boolean))]
    const pipelineNameById = new Map<string, string>()
    if (pipelineIds.length > 0) {
      const { data: pipes } = await adminVeltzy
        .from('pipelines')
        .select('id, name')
        .in('id', pipelineIds)
      for (const p of pipes ?? []) pipelineNameById.set(p.id, p.name)
    }
    // match_value (identificador de instancia) -> nome do funil
    const funnelByInstance = new Map<string, string>()
    for (const r of rules ?? []) {
      const name = r.pipeline_id ? pipelineNameById.get(r.pipeline_id) : undefined
      if (r.match_value && name) funnelByInstance.set(r.match_value, name)
    }

    const items: WhatsAppNumberItem[] = []

    // Cloud API (schema veltzy). Funil casa por instance_label (o que vira instance_name no lead).
    const { data: cloud } = await adminVeltzy
      .from('cloud_api_numbers')
      .select('phone_number_id, display_number, instance_label, status')
      .eq('company_id', companyId)
    for (const n of cloud ?? []) {
      items.push({
        provider: 'cloud_api',
        providerLabel: 'WhatsApp API Oficial',
        displayNumber: n.display_number ?? null,
        status: n.status === 'active' ? 'connected' : 'disconnected',
        ref: n.phone_number_id,
        funnelName: n.instance_label ? funnelByInstance.get(n.instance_label) ?? null : null,
      })
    }

    // Evolution (schema public, Hub-owned). Funil casa por instance_name.
    const { data: evo } = await adminPublic
      .from('evolution_instances')
      .select('instance_name, phone_number, status')
      .eq('company_id', companyId)
    for (const n of evo ?? []) {
      items.push({
        provider: 'evolution',
        providerLabel: 'Evolution',
        displayNumber: n.phone_number ?? null,
        status: normalizeInstanceStatus(n.status),
        ref: n.instance_name,
        funnelName: funnelByInstance.get(n.instance_name) ?? null,
      })
    }

    // WAHA (schema public, Hub-owned). Funil casa por session_name.
    const { data: waha } = await adminPublic
      .from('waha_instances')
      .select('session_name, phone_number, status')
      .eq('company_id', companyId)
    for (const n of waha ?? []) {
      items.push({
        provider: 'waha',
        providerLabel: 'WAHA',
        displayNumber: n.phone_number ?? null,
        status: normalizeInstanceStatus(n.status),
        ref: n.session_name,
        funnelName: funnelByInstance.get(n.session_name) ?? null,
      })
    }

    return new Response(JSON.stringify({ numbers: items }), { headers })
  } catch (err) {
    console.error('[whatsapp-numbers-list] erro:', err)
    return new Response(JSON.stringify({ error: 'Erro interno' }), { status: 500, headers })
  }
})
