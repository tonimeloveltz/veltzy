import { veltzy } from '@/lib/supabase'
import type { Cadence, CadenceStep, CadenceRun, CadenceStepAction, CadenceCondition, CadenceTriggerEvent } from '@/types/database'

export interface CadenceWithSteps extends Cadence {
  steps: CadenceStep[]
}

export const getCadences = async (companyId: string): Promise<Cadence[]> => {
  const { data, error } = await veltzy()
    .from('cadences').select('*').eq('company_id', companyId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as Cadence[]
}

export const getCadenceSteps = async (cadenceId: string): Promise<CadenceStep[]> => {
  const { data, error } = await veltzy()
    .from('cadence_steps').select('*').eq('cadence_id', cadenceId)
    .order('step_order', { ascending: true })
  if (error) throw error
  return (data ?? []) as unknown as CadenceStep[]
}

/** Runs de uma cadência (acompanhamento), com o nome do lead. */
export const getCadenceRuns = async (cadenceId: string): Promise<(CadenceRun & { lead_name: string | null })[]> => {
  const { data, error } = await veltzy()
    .from('cadence_runs')
    .select('*, lead:lead_id(name)')
    .eq('cadence_id', cadenceId)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw error
  return (data ?? []).map((r: Record<string, unknown>) => ({
    ...(r as unknown as CadenceRun),
    lead_name: (r.lead as { name: string | null } | null)?.name ?? null,
  }))
}

export interface CadenceStepInput {
  action_type: CadenceStepAction
  config: Record<string, unknown>
}
export interface CreateCadenceInput {
  name: string
  trigger_event: CadenceTriggerEvent | null
  trigger_conditions: CadenceCondition[]
  cancel_on_stage_change: boolean
  steps: CadenceStepInput[]
  /** Rascunho (false) ou ativa (true). Default true (compat). */
  is_enabled?: boolean
  recurring_cron?: string | null
  webhook_token?: string | null
}

export const createCadence = async (
  companyId: string,
  createdBy: string | null,
  input: CreateCadenceInput,
): Promise<Cadence> => {
  const { data: cadence, error } = await veltzy()
    .from('cadences')
    .insert({
      company_id: companyId,
      name: input.name,
      trigger_event: input.trigger_event,
      trigger_conditions: input.trigger_conditions,
      cancel_on_stage_change: input.cancel_on_stage_change,
      is_enabled: input.is_enabled ?? true,
      recurring_cron: input.recurring_cron ?? null,
      webhook_token: input.webhook_token ?? null,
      created_by: createdBy,
    })
    .select()
    .single()
  if (error) throw error

  if (input.steps.length > 0) {
    const rows = input.steps.map((s, i) => ({
      cadence_id: (cadence as { id: string }).id,
      step_order: i,
      action_type: s.action_type,
      config: s.config,
    }))
    const { error: stepsErr } = await veltzy().from('cadence_steps').insert(rows)
    if (stepsErr) throw stepsErr
  }
  return cadence as unknown as Cadence
}

export type UpdateCadenceInput = Omit<CreateCadenceInput, 'is_enabled'>

/**
 * Edita cadência e passos. Os passos são gravados por upsert em (cadence_id, step_order)
 * e só depois os excedentes são apagados: um erro no meio nunca deixa a cadência sem
 * passos (o process-cadences concluiria os runs ativos). Runs ativos seguem pelo índice
 * current_step, então passam a usar a lista nova a partir de onde estão.
 */
export const updateCadence = async (
  companyId: string,
  id: string,
  input: UpdateCadenceInput,
): Promise<void> => {
  const { error } = await veltzy()
    .from('cadences')
    .update({
      name: input.name,
      trigger_event: input.trigger_event,
      trigger_conditions: input.trigger_conditions,
      cancel_on_stage_change: input.cancel_on_stage_change,
      recurring_cron: input.recurring_cron ?? null,
      webhook_token: input.webhook_token ?? null,
    })
    .eq('id', id)
    .eq('company_id', companyId)
  if (error) throw error

  if (input.steps.length > 0) {
    const rows = input.steps.map((s, i) => ({
      cadence_id: id,
      step_order: i,
      action_type: s.action_type,
      config: s.config,
    }))
    const { error: upsertErr } = await veltzy()
      .from('cadence_steps')
      .upsert(rows, { onConflict: 'cadence_id,step_order' })
    if (upsertErr) throw upsertErr
  }

  const { error: delErr } = await veltzy()
    .from('cadence_steps')
    .delete()
    .eq('cadence_id', id)
    .gte('step_order', input.steps.length)
  if (delErr) throw delErr
}

export const setCadenceEnabled = async (id: string, isEnabled: boolean): Promise<void> => {
  const { error } = await veltzy().from('cadences').update({ is_enabled: isEnabled }).eq('id', id)
  if (error) throw error
}

/**
 * Exclui a cadência. Passos e runs caem por ON DELETE CASCADE (o histórico de
 * acompanhamento vai junto); campanhas que a usavam de follow-up ficam com
 * followup_cadence_id NULL. O .select() confirma a linha: a RLS (admin/manager)
 * barra calada, sem erro, e o toast mentiria.
 */
export const deleteCadence = async (companyId: string, id: string): Promise<void> => {
  const { data, error } = await veltzy()
    .from('cadences')
    .delete()
    .eq('id', id)
    .eq('company_id', companyId)
    .select('id')
  if (error) throw error
  if (!data?.length) throw new Error('Automação não encontrada ou sem permissão para excluir.')
}

/**
 * START MANUAL: inscreve lead(s) na cadência. Cria cadence_run (idempotente via
 * UNIQUE cadence_id,lead_id). O process-cadences (cron) avança. Gate real =
 * process-cadences (mkt_ativo_enabled); aqui a RLS já restringe à company.
 */
export const addLeadsToCadence = async (
  companyId: string,
  cadenceId: string,
  leadIds: string[],
): Promise<number> => {
  if (leadIds.length === 0) return 0
  const nowIso = new Date().toISOString()
  const rows = leadIds.map((lead_id) => ({
    cadence_id: cadenceId,
    lead_id,
    company_id: companyId,
    current_step: 0,
    status: 'active',
    next_run_at: nowIso,
  }))
  const { data, error } = await veltzy()
    .from('cadence_runs')
    .upsert(rows, { onConflict: 'cadence_id,lead_id', ignoreDuplicates: true })
    .select('id')
  if (error) throw error
  return data?.length ?? 0
}
