import { describe, expect, it } from 'vitest'
import { checklistItems, publishMissing, type ChecklistInput } from './publish-checklist'

const complete: ChecklistInput = {
  title: 'Workshop',
  slug: 'workshop',
  format: 'presencial',
  starts_at: '2026-11-24T09:00',
  ends_at: '2026-11-24T12:00',
  venue_name: 'Auditório',
  city: 'São Paulo',
  online_url: '',
  pipeline_id: 'p',
  entry_stage_id: 's',
  privacy_policy_url: 'https://x.com/privacidade',
}

describe('publishMissing', () => {
  it('evento completo nao tem pendencia', () => {
    expect(publishMissing(complete)).toEqual([])
  })

  it('lista o que falta na ordem do banco', () => {
    expect(publishMissing({
      ...complete, title: 'ab', ends_at: '', city: ' ', entry_stage_id: null, privacy_policy_url: '',
    })).toEqual(['title', 'dates', 'venue', 'pipeline', 'privacy_policy_url'])
  })

  it('online pede link e nao pede local', () => {
    expect(publishMissing({ ...complete, format: 'online', venue_name: '', city: '' })).toEqual(['online_url'])
  })

  it('hibrido pede local e link', () => {
    expect(publishMissing({ ...complete, format: 'hibrido', venue_name: '' })).toEqual(['venue', 'online_url'])
  })
})

describe('checklistItems', () => {
  it('mostra so os itens do formato', () => {
    expect(checklistItems('presencial').map((i) => i.key)).not.toContain('online_url')
    expect(checklistItems('online').map((i) => i.key)).not.toContain('venue')
    expect(checklistItems('hibrido')).toHaveLength(7)
  })
})
