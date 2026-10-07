import { supabase, veltzy } from '@/lib/supabase'
import type { ProspectGroup, ProspectSignal, ProspectConfig, ProspectDecision } from '@/types/database'

// Camada de dados da prospecção em grupos (feature oculta). Leituras via RLS
// (company_id). Review/rotulagem via RPC prospect_review_signal (o trigger barra
// UPDATE direto de colunas protegidas). Envio/rascunho/abordagem via thin edges.

const db = () => veltzy()

// --- Config (kill switch da empresa; write só super_admin pela RLS) ---
export const getConfig = async (companyId: string): Promise<ProspectConfig | null> => {
  const { data, error } = await db().from('prospect_config').select('*').eq('company_id', companyId).maybeSingle()
  if (error) throw error
  return data as ProspectConfig | null
}

export const setCompanyEnabled = async (companyId: string, isEnabled: boolean): Promise<void> => {
  const { error } = await db().from('prospect_config').update({ is_enabled: isEnabled }).eq('company_id', companyId)
  if (error) throw error
}

// --- Grupos ---
export const getGroups = async (companyId: string): Promise<ProspectGroup[]> => {
  const { data, error } = await db().from('prospect_groups').select('*').eq('company_id', companyId).order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as ProspectGroup[]
}

export const registerGroup = async (
  companyId: string,
  input: { name: string; invite_code?: string | null; niche?: string | null; session_name: string },
): Promise<ProspectGroup> => {
  const { data, error } = await db().from('prospect_groups').insert({
    company_id: companyId, name: input.name, invite_code: input.invite_code ?? null,
    niche: input.niche ?? null, session_name: input.session_name, is_active: true,
  }).select('*').single()
  if (error) throw error
  return data as ProspectGroup
}

export const updateGroup = async (
  id: string,
  patch: Partial<Pick<ProspectGroup, 'is_active' | 'niche' | 'invite_code' | 'name'>>,
): Promise<void> => {
  const { error } = await db().from('prospect_groups').update(patch).eq('id', id)
  if (error) throw error
}

// --- Sinais ---
export interface SignalFilter {
  decisions?: ProspectDecision[]
  statuses?: string[]
  shadow?: boolean
  reviewedNull?: boolean   // true = só não-revisados (fila); false = só revisados
}

export const getSignals = async (companyId: string, filter: SignalFilter = {}): Promise<ProspectSignal[]> => {
  let q = db().from('prospect_signals').select('*').eq('company_id', companyId)
  if (filter.decisions?.length) q = q.in('decision', filter.decisions)
  if (filter.statuses?.length) q = q.in('status', filter.statuses)
  if (filter.shadow !== undefined) q = q.eq('shadow', filter.shadow)
  if (filter.reviewedNull === true) q = q.is('reviewed_at', null)
  if (filter.reviewedNull === false) q = q.not('reviewed_at', 'is', null)
  const { data, error } = await q.order('created_at', { ascending: false }).limit(200)
  if (error) throw error
  return (data ?? []) as ProspectSignal[]
}

// Rotular (sombra) / rejeitar. Caminho único permitido ao usuário (trigger-safe).
export const reviewSignal = async (signalId: string, humanLabel: boolean): Promise<void> => {
  const { error } = await db().rpc('prospect_review_signal', { p_signal_id: signalId, p_human_label: humanLabel })
  if (error) throw error
}

// --- Thin edges ---
export const draftDm = async (signalId: string): Promise<string> => {
  const { data, error } = await supabase.functions.invoke('prospect-dm-draft', { body: { signal_id: signalId } })
  if (error) throw error
  const r = data as { ok?: boolean; draft?: string; error?: unknown }
  if (!r?.ok || !r.draft) throw new Error('Falha ao gerar rascunho')
  return r.draft
}

export const sendDm = async (signalId: string, messageText: string): Promise<{ blocked?: boolean; reason?: string }> => {
  const { data, error } = await supabase.functions.invoke('prospect-dm-send', { body: { signal_id: signalId, message_text: messageText } })
  if (error) throw error
  return data as { ok?: boolean; blocked?: boolean; reason?: string }
}

export const approachSignal = async (signalId: string, phone?: string): Promise<void> => {
  const { data, error } = await supabase.functions.invoke('prospect-approach', { body: { signal_id: signalId, phone } })
  if (error) throw error
  const r = data as { ok?: boolean; error?: { message?: string } }
  if (!r?.ok) throw new Error(r?.error?.message ?? 'Falha ao registrar abordagem')
}

// --- Métricas (contagens leves via head; PostgREST não agrega) ---
export interface ProspectMetrics {
  messagesRead: number
  byDecision: Record<ProspectDecision, number>
  dmsSent: number
  responses: number
  resolutionByEngine: { engine: string; total: number; resolved: number }[]
}

const countSignals = async (companyId: string, decision: ProspectDecision): Promise<number> => {
  const { count } = await db().from('prospect_signals').select('id', { count: 'exact', head: true })
    .eq('company_id', companyId).eq('decision', decision)
  return count ?? 0
}

const countRaw = async (companyId: string, engine: string, resolvedOnly: boolean): Promise<number> => {
  let q = db().from('prospect_group_messages_raw').select('id', { count: 'exact', head: true })
    .eq('company_id', companyId).eq('engine', engine)
  if (resolvedOnly) q = q.not('author_phone_resolved', 'is', null)
  const { count } = await q
  return count ?? 0
}

export const getMetrics = async (companyId: string): Promise<ProspectMetrics> => {
  const groups = await getGroups(companyId)
  const messagesRead = groups.reduce((s, g) => s + (g.messages_read ?? 0), 0)

  const [auto_dm, review, alert, discard] = await Promise.all([
    countSignals(companyId, 'auto_dm'), countSignals(companyId, 'review'),
    countSignals(companyId, 'alert'), countSignals(companyId, 'discard'),
  ])

  const { count: dmsSent } = await db().from('prospect_dm_log').select('id', { count: 'exact', head: true })
    .eq('company_id', companyId).eq('status', 'sent')
  const { count: responses } = await db().from('prospect_contacted').select('id', { count: 'exact', head: true })
    .eq('company_id', companyId).eq('responded', true)

  const engines = ['noweb', 'webjs']
  const resolutionByEngine = await Promise.all(engines.map(async (engine) => ({
    engine,
    total: await countRaw(companyId, engine, false),
    resolved: await countRaw(companyId, engine, true),
  })))

  return {
    messagesRead,
    byDecision: { auto_dm, review, alert, discard },
    dmsSent: dmsSent ?? 0,
    responses: responses ?? 0,
    resolutionByEngine,
  }
}
