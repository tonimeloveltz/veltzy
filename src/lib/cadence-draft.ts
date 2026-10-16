import type { CadenceCondition } from '@/types/database'

export type RecurringFreq = 'daily' | 'weekly' | 'monthly'

export interface RecurringDraft {
  freq: RecurringFreq
  time: string
  dow: number
  dom: number
}

export interface ConditionsDraft {
  stageTargets: string[]
  tagName: string
  sourceId: string
  onlyStageIds: string[]
}

const DEFAULT_RECURRING: RecurringDraft = { freq: 'daily', time: '09:00', dow: 1, dom: 1 }

const toStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []

/** Inverso do buildConditions do cadence-form: trigger_conditions -> campos do form. */
export const parseConditions = (conditions: CadenceCondition[] | null | undefined): ConditionsDraft => {
  const draft: ConditionsDraft = { stageTargets: [], tagName: '', sourceId: '', onlyStageIds: [] }
  for (const c of conditions ?? []) {
    if (c.field === 'to_stage_id' && c.operator === 'in') draft.stageTargets = toStringArray(c.value)
    else if (c.field === 'tag' && c.operator === 'eq' && typeof c.value === 'string') draft.tagName = c.value
    else if (c.field === 'source_id' && c.operator === 'eq' && typeof c.value === 'string') draft.sourceId = c.value
    else if (c.field === 'stage_id' && c.operator === 'in') draft.onlyStageIds = toStringArray(c.value)
  }
  return draft
}

/** Inverso do buildRecurringCron: 'daily@HH:MM' | 'weekly@<dow>@HH:MM' | 'monthly@<dom>@HH:MM'. */
export const parseRecurringCron = (cron: string | null | undefined): RecurringDraft => {
  if (!cron) return DEFAULT_RECURRING
  const parts = cron.split('@')
  if (parts[0] === 'daily' && parts.length === 2) return { ...DEFAULT_RECURRING, time: parts[1] }
  if (parts[0] === 'weekly' && parts.length === 3) return { ...DEFAULT_RECURRING, freq: 'weekly', dow: Number(parts[1]), time: parts[2] }
  if (parts[0] === 'monthly' && parts.length === 3) return { ...DEFAULT_RECURRING, freq: 'monthly', dom: Number(parts[1]), time: parts[2] }
  return DEFAULT_RECURRING
}
