// Espelho no client de veltzy.event_publish_missing (migration do Hub 20261116100146).
// Mudou a funcao no banco, muda aqui e no teste. O Publicar valida de novo pela RPC.

import type { EventFormat } from '@/types/events'

export type PublishMissingKey =
  | 'title'
  | 'slug'
  | 'dates'
  | 'venue'
  | 'online_url'
  | 'pipeline'
  | 'privacy_policy_url'

export type EditorTab = 'overview' | 'form' | 'appearance' | 'pipeline' | 'share' | 'registrants' | 'dashboard'

/** Abas que editam o evento (formulario unico); as demais operam sobre dados ja salvos. */
export const FORM_TABS: EditorTab[] = ['overview', 'form', 'appearance', 'pipeline']

export interface ChecklistInput {
  title: string
  slug: string
  format: EventFormat
  starts_at: string
  ends_at: string
  venue_name: string
  city: string
  online_url: string
  pipeline_id: string | null
  entry_stage_id: string | null
  privacy_policy_url: string
}

const blank = (v: string | null | undefined) => (v ?? '').trim() === ''

export const publishMissing = (i: ChecklistInput): PublishMissingKey[] => {
  const missing: PublishMissingKey[] = []
  if (i.title.trim().length < 3) missing.push('title')
  if (blank(i.slug)) missing.push('slug')
  if (blank(i.starts_at) || blank(i.ends_at)) missing.push('dates')
  if ((i.format === 'presencial' || i.format === 'hibrido') && (blank(i.venue_name) || blank(i.city))) missing.push('venue')
  if ((i.format === 'online' || i.format === 'hibrido') && blank(i.online_url)) missing.push('online_url')
  if (!i.pipeline_id || !i.entry_stage_id) missing.push('pipeline')
  if (blank(i.privacy_policy_url)) missing.push('privacy_policy_url')
  return missing
}

export interface ChecklistItem {
  key: PublishMissingKey
  label: string
  tab: EditorTab
  /** Campo do formulario que recebe o foco ao clicar na pendencia. */
  focus: string | null
}

const ITEMS: Record<PublishMissingKey, Omit<ChecklistItem, 'key'>> = {
  title: { label: 'Nome do evento', tab: 'overview', focus: 'title' },
  slug: { label: 'Link da página', tab: 'overview', focus: 'slug' },
  dates: { label: 'Data de início e fim', tab: 'overview', focus: 'starts_at' },
  venue: { label: 'Local e cidade', tab: 'overview', focus: 'venue_name' },
  online_url: { label: 'Link da transmissão', tab: 'overview', focus: 'online_url' },
  pipeline: { label: 'Pipeline e etapa de entrada', tab: 'pipeline', focus: null },
  privacy_policy_url: { label: 'Política de Privacidade', tab: 'overview', focus: 'privacy_policy_url' },
}

/** Itens que valem para o formato escolhido, na ordem da tela. */
export const checklistItems = (format: EventFormat): ChecklistItem[] => {
  const keys: PublishMissingKey[] = ['title', 'slug', 'dates']
  if (format !== 'online') keys.push('venue')
  if (format !== 'presencial') keys.push('online_url')
  keys.push('pipeline', 'privacy_policy_url')
  return keys.map((key) => ({ key, ...ITEMS[key] }))
}

export const checklistLabel = (key: string): string =>
  key in ITEMS ? ITEMS[key as PublishMissingKey].label : key
