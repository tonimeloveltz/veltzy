import { describe, it, expect, vi, beforeEach } from 'vitest'

// Fila de respostas para chamadas terminais (single/maybeSingle/limit)
let responseQueue: Array<{ data: unknown; error?: unknown }> = []
// Captura dos payloads passados para .insert()
let insertCalls: unknown[] = []

function createChainable() {
  const self: Record<string, unknown> = new Proxy({}, {
    get(_target, prop: string) {
      if (prop === 'single' || prop === 'maybeSingle' || prop === 'limit') {
        return () => responseQueue.shift() ?? { data: null }
      }
      if (prop === 'insert') {
        return (payload: unknown) => { insertCalls.push(payload); return self }
      }
      // check_company_limits: sem limite atingido
      if (prop === 'rpc') return () => ({ data: null })
      // from, select, eq, delete, etc. encadeiam retornando self
      return () => self
    },
  })
  return self
}

vi.mock('@/lib/supabase', () => {
  const chainable = createChainable()
  return {
    supabase: chainable,
    veltzy: () => chainable,
  }
})

import { createLeadWithDeal } from './leads.service'

const baseInput = {
  phone: '11999999999',
  name: 'Le Parc',
  pipeline_id: 'pipe-1',
  stage_id: 'stage-1',
  // truthy: pula resolveWhatsAppInstance
  whatsapp_instance_name: 'inst-1',
}

const dealPayload = () => insertCalls[1] as Record<string, unknown>

describe('createLeadWithDeal', () => {
  beforeEach(() => {
    responseQueue = []
    insertCalls = []
  })

  it('estagio aberto: cria deal com status open e closed_at null', async () => {
    responseQueue = [
      { data: { id: 'lead-1' } },                          // insert lead
      { data: { is_final: false, is_positive: null } },    // pipeline_stages
      { data: { id: 'deal-1', status: 'open' } },           // insert deal
    ]

    const result = await createLeadWithDeal('company-1', baseInput)

    expect(result.deal).toBeTruthy()
    expect(dealPayload().lead_id).toBe('lead-1')
    expect(dealPayload().pipeline_id).toBe('pipe-1')
    expect(dealPayload().stage_id).toBe('stage-1')
    expect(dealPayload().status).toBe('open')
    expect(dealPayload().closed_at).toBeNull()
  })

  it('estagio final ganho: status won e closed_at com a data retroativa fornecida', async () => {
    responseQueue = [
      { data: { id: 'lead-2' } },
      { data: { is_final: true, is_positive: true } },
      { data: { id: 'deal-2', status: 'won' } },
    ]

    const retroactive = '2026-03-10T12:00:00.000Z'
    const result = await createLeadWithDeal('company-1', { ...baseInput, closed_at: retroactive })

    expect(result.deal).toBeTruthy()
    expect(dealPayload().status).toBe('won')
    expect(dealPayload().closed_at).toBe(retroactive)
  })

  it('estagio final perdido sem data: status lost e closed_at preenchido com agora', async () => {
    responseQueue = [
      { data: { id: 'lead-3' } },
      { data: { is_final: true, is_positive: false } },
      { data: { id: 'deal-3', status: 'lost' } },
    ]

    await createLeadWithDeal('company-1', baseInput)

    expect(dealPayload().status).toBe('lost')
    expect(dealPayload().closed_at).toBeTruthy()
    expect(typeof dealPayload().closed_at).toBe('string')
  })
})
